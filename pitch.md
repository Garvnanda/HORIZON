# pitch.md — HORIZON, explained

**SIH 2026 · PS 26153 · NTRO · Predictive cyber defence with a learned world model**

This document is for *understanding and defending* the project. Read it before pitching. Every module is explained in plain language, every design decision has its reasoning and its rejected alternatives, and the honest limitations are stated so you say them before a judge does.

---

## Part 1 — The one-paragraph pitch

Existing intrusion detection tells you an attack is happening. By then the attacker is already inside. HORIZON learns how machines on a network *normally behave over time*, then runs that learned behaviour forward to imagine what each machine is about to do next — several minutes into the future. If an imagined future looks like an attack, we alert now, before it happens. Because the model learns normal dynamics rather than a list of known attacks, it can flag behaviour it has never seen labelled. And because it simulates forward, it can answer the question no detector can: *if I isolate this machine right now, does the threat go away?*

---

## Part 2 — The core idea, in three sentences

Use this framing every single time. It is the clearest version.

1. For every machine on the network, every 60 seconds, we write **one row** describing what that machine did — how many other machines it talked to, how many ports, how many connections failed, how much data moved in and out.

2. We train a model to answer one question: **given the last 20 rows for this machine, what does the next row look like?** Not "is this an attack." Just what happens next. Since almost all traffic is normal, what it mostly learns is *how a normal machine behaves*.

3. We then **run it forward.** Predict row 21, feed that prediction back in, predict row 22, and so on for 20 steps. That gives us an imagined future. A second small model reads each imagined row and scores how attack-like it looks. If step 6 of the imagined future looks like a port scan, we raise an alert **now** — six minutes before it happens.

### The analogy that makes it land

**Weather forecasting.** A weather model does not classify "is it raining right now." It learns how the atmosphere moves, runs it forward, and reads off what it produced. That is exactly our shape: learn the dynamics, simulate forward, read off the danger. Nobody has to be told twice what a hurricane forecast cone means, and our main visual is deliberately the same shape.

### Where "world model" comes from

The term is standard in AI research. A world model is a learned simulator of an environment — a model that, given the current state, predicts the next state. In robotics and game-playing AI (the DeepMind and Ha & Schmidhuber line of work), agents learn a world model and then "dream" — plan by rolling the model forward internally instead of acting in the real world. We are applying that structure to a network: the network is the environment, the state is what each host is doing, and the dreaming is our forecast.

The problem statement defines exactly this: a model of **P(S_t+1 | S_t)** — the probability of the next network state given the current one. We satisfy it literally.

---

## Part 3 — The modules, one by one

### Module 1 — Host-window state

**What it does.** Turns an irregular firehose of connection records into a regular time series: one row per machine per minute.

**Why it is needed.** A model that simulates forward needs a *state* — something that (a) ticks on a regular clock, (b) is the same shape at every step so predictions can be fed back in, and (c) actually contains the thing we want to forecast. Raw connection records fail all three: they arrive in irregular bursts, and each one belongs to a different conversation.

**The features (10 of them).** Per host, per 60-second window:

| Feature | What it captures in plain terms |
| --- | --- |
| `n_flows` | how busy the machine was |
| `n_distinct_dst_ip` | how many different machines it talked to |
| `n_distinct_dst_port` | how many different services it touched |
| `new_peer_rate` | how much of that was with machines it had never contacted before |
| `fail_ratio` | how many connection attempts got no answer |
| `bytes_out` / `bytes_in` | how much data left and arrived |
| `io_ratio` | whether it was mostly sending or mostly receiving |
| `mean_duration` | short bursts or long sessions |
| `external_ratio` | how much traffic left the organisation |

**Why these features specifically.** They are chosen to make attack behaviour *visibly different* from normal behaviour in the numbers:

- A **port scan** is `n_distinct_dst_port` jumping from 3 to 300 with `fail_ratio` spiking — most scanned ports are closed, so most attempts fail.
- **Lateral movement** is `new_peer_rate` climbing — a workstation suddenly talking to machines it has never contacted.
- **Data exfiltration** is `io_ratio` and `external_ratio` both rising — lots of data going out, to the outside world.
- **A C2 beacon** is small, regular flows to one new external peer — low `n_flows`, low `bytes_out`, high `external_ratio`, steady `mean_duration`.

That is the whole point: we do not tell the model these rules. We give it a representation in which these patterns are *expressible*, and let it learn them.

**Decision: why host-windows and not individual connections.**

This was our biggest early correction. Our first design used sequences of individual connections grouped by "conversation" (source IP, source port, destination IP, destination port, protocol).

That is broken for the attack we care about. Consider a real infiltration chain in the CIC dataset:

1. A victim machine downloads a malicious file from Dropbox → conversation: `victim → dropbox:443`
2. The infected machine runs a port scan inside the office network → conversations: `victim → 10.0.0.5:22`, `victim → 10.0.0.6:80`, `victim → 10.0.0.7:445` … hundreds, all different
3. It beacons out to the attacker → conversation: `victim → attacker:8080`

Three stages, **not one shared conversation between them**. A model whose entire input is one conversation is being asked "what is the next connection in this Dropbox session?" — and the honest answer is "more Dropbox traffic." The port scan is not in its input and not in its output space. It is invisible *by construction*.

This is a representation failure, not an accuracy failure. No amount of training or tuning fixes an input that does not contain the signal.

Switching to host-windows puts the whole chain inside **one sequence for one machine**: the download minute, the scanning minutes, the beaconing minutes are consecutive rows describing the same host. Now "predict the next row" is a question with a real, useful answer.

**Rejected alternative — graph neural network.** The most expressive option, and the problem statement explicitly permits it: model the network as a graph where machines are nodes and communication is edges, then predict the next graph. Lateral movement literally *is* a change in graph structure, so a GNN would see it directly.

We rejected it on **cost, not merit**. Dynamic graph networks are difficult to train, the intrusion-detection literature on them is thin, and debugging one on free compute with three people in four weeks is a reliable way to have nothing working at the end. Our features are a deliberate hand-built approximation of the graph signal: `n_distinct_dst_ip` is node degree, `new_peer_rate` is edge novelty. We keep *how many and how new*; we lose *exactly who*.

**Say this out loud if asked.** "We approximated graph structure with degree and novelty features because a dynamic GNN was not buildable in our timeline" is a strong answer that shows you considered it. "We did not think of a graph" is not.

**Rejected alternative — packet-level inspection.** Would give richer features (TTL patterns, TCP window sizes, payload characteristics). Requires the raw packet captures, tens of gigabytes for CIC-IDS2017 and unusable on free compute. We use the flow-feature CSVs instead. Cut cleanly rather than half-attempted.

---

### Module 2 — The dynamics model (this is the world model)

**What it does.** An LSTM neural network that takes the last 20 rows for a machine and predicts what the 21st row will be. Trained on *all* traffic, including — especially — the normal traffic.

This is the **M model** from Ha & Schmidhuber's "World Models" almost exactly: their M is an MDN-RNN — a recurrent net with a mixture-density output that predicts the distribution over the next state. Ours is the same construction (LSTM + 5-component MDN), applied to network host state instead of a game environment. We are not loosely borrowing the term; the architecture is the reference one.

**Why the training objective matters so much.** We train it to predict the **next state**, scored on the likelihood of the real next state under the predicted mixture. We do **not** train it to predict a label.

This single choice is what makes it a world model rather than a classifier, and it has a consequence people miss: it makes the boring 99% of the data *useful*. Under a classification objective, 99% benign traffic just teaches the model to say "benign." Under a next-state objective, that same 99% teaches it what normal machine behaviour looks like in fine detail — which is exactly the knowledge we need.

**Why an LSTM.** An LSTM carries a running summary of history in its internal memory. Two practical reasons over a Transformer: it is naturally stateful, which makes feeding predictions back in a simple loop rather than a re-encode; and recent intrusion-detection research has found that Transformer performance on this kind of data depends more on getting sequence padding conventions exactly right than on the architecture itself — a warning that Transformers here are easy to get subtly and invisibly wrong. Our sequences are 20 steps long, where attention buys very little over recurrence.

**Rejected alternative — autoencoder anomaly detection.** A well-established approach: compress the current state, reconstruct it, flag high reconstruction error. It works. But it is **non-predictive by construction** — it tells you something is odd *now*, never that something is *coming*. No lead time, which is our headline claim. We get its benefit anyway for free (see Module 6, surprise).

**Rejected alternative — latent-space world model.** The state-of-the-art in the world-model literature (the PlaNet/Dreamer line) compresses observations into a latent space and learns dynamics there, which makes long rollouts more stable. Rejected because that machinery earns its complexity when observations are high-dimensional and redundant — 64×64 images. Ours is a 10-number vector. Not worth the extra encoder, decoder, and balancing terms.

**Rejected alternative — hidden Markov models and Bayesian attack graphs.** The classical pre-deep-learning approach to multi-step attack prediction, and genuinely interpretable. Rejected because the states must be hand-specified by the designer — you encode your own belief about the kill chain rather than learning it from data, which is the opposite of what the problem statement asks for. Correct to cite as the prior art we build past.

---

### Module 3 — Probabilistic output: how the model gets "imagination"

**The problem with the obvious approach.** If you train a model with mean-squared error, there is a mathematical fact you cannot escape: the output that minimises squared error is the **average** of all possible next states. So if a machine's next minute could plausibly be quiet (70% of the time) or a scan burst (30%), the model outputs the blend — a state that is neither, and that never actually occurs in reality. Feed that blur back in for 20 steps and the forecast drifts toward the average of all network behaviour, which is meaningless.

This is not a bug to be tuned away. It is precisely what the loss function asked for.

**Our fix — a mixture density head.** Instead of predicting one next state, the model predicts **five possible next states**, each with its own likelihood:

> "40% chance the next minute looks like *this* (quiet), 35% chance like *this* (moderate web browsing), 15% like *this* (a scan burst), 10% like *this* (a large transfer)."

At forecast time we **sample**: pick one possibility according to its probability, commit to it, feed it forward, repeat. Run the whole rollout 50 times and you get 50 genuinely different imagined futures — some where the machine stays quiet, some where the attack unfolds.

**This is where the "creativity" is.** During training the model learns the *modes* of network behaviour — the recurring shapes that machine activity takes. At inference it freely recombines them into sequences that never literally occurred in the training data. It is not replaying memorised examples; it is composing plausible futures from learned building blocks.

Be precise about the limit, though, because a sharp judge will probe it: **it composes from what it has seen.** It will not invent an attack shape with no relation to anything in the data. It *will* produce novel combinations — the fan-out profile of a scan with the timing profile of a beacon — in sequences that are new. Claim that; do not claim more.

**Real-world grounding.** Mixture density networks are a standard technique (Bishop, 1994) used precisely for problems where the future is multi-modal — most famously in handwriting and trajectory prediction, where "where will the pen go next" genuinely has several valid answers. Self-driving-car trajectory prediction uses exactly this structure for exactly this reason: a car at an intersection might turn left or go straight, and a model that averages the two predicts driving into the kerb.

**What this buys us, concretely:**

- Forecasts stop collapsing toward the average, because we never feed the average back in.
- Attack probability becomes **the fraction of imagined futures containing an attack** — far more honest and more interpretable than a single number from a sigmoid.
- We get **uncertainty for free.** When the 50 futures agree, the model is confident. When they disagree, it is not. That is exactly what a security analyst needs in order to triage.
- **A new signal: future disagreement.** A machine whose 50 imagined futures all agree is boring. A machine where 30 futures stay quiet and 20 turn into scans is a machine at a decision point. That divergence is itself an early warning, and it costs one line of code to measure.

**Fallback if training misbehaves.** Mixture models can be numerically awkward (variances can collapse toward zero). The backup is to bin each feature into ~20 buckets and predict a category over buckets — the approach used in PixelCNN-style models. More robust to train, equally expressive, slightly larger output layer.

---

### Module 4 — The readout head

**What it does.** A small second network reading the LSTM's internal memory and answering: how attack-like is this situation, within the next 20 minutes?

**Why it shares the same LSTM.** This is the experiment at the heart of the project. Our hypothesis is that *the understanding gained from learning to predict the future is useful for detecting attacks*. If we trained two separate models we would never test that — we would just have a forecaster and a classifier sitting next to each other. Sharing the trunk is what makes the world model do detection work.

**A risk to watch, and say out loud if asked.** The two objectives can fight. If the detection loss dominates, the shared memory quietly becomes a classifier and the forecasting degrades — leaving us with the world-model label and none of the substance. We monitor both losses separately, never just the total, and the persistence check (Module 7) is a hard gate against exactly this.

---

### Module 5 — Scheduled sampling: the detail that decides whether this works

**The problem.** During training, the detection head sees internal memory built from *real* observed rows. But during forecasting, from step 2 onward, it sees memory built from the model's *own imagined* rows. Those are not the same kind of input. A model trained only on real data is being asked, at forecast time, to interpret something it has never encountered — and it will produce output that looks perfectly smooth and is entirely meaningless.

This is the single most common way forecasting systems fail while appearing to work. It has a name in the literature — exposure bias — and a standard fix.

**The fix.** During training, gradually start feeding the model its own predictions instead of the real values. Begin at 0% (all real), ramp to about 50% by the end of training. By the time training finishes, the model has practised operating on its own imagination, which is exactly the situation it faces in deployment.

**Real-world grounding.** Scheduled sampling was introduced by Bengio et al. (2015) for sequence prediction and is standard practice in any autoregressive forecasting system. It is not optional and it is not a nicety — leaving it out means every forecast past step 1 is noise.

---

### Module 6 — The rollout, and the three things it gives us that a classifier cannot

**What it does.** Encode the last 20 minutes → predict the next state → sample it → feed it back → repeat 20 times → do that whole thing 50 times.

**Output:** 50 imagined trajectories, each with a probability score at every future step.

**Be honest about this in the pitch:** a simpler model that predicts "attack within 20 minutes?" directly in one shot may well match our accuracy, because it never compounds error. We build that model as a baseline specifically so we discover this in testing rather than in the judging room.

So why roll out? Because the rollout produces three things a direct classifier cannot produce at any accuracy:

**(a) Surprise.** We predicted the next minute; the next minute arrived; they do not match. The model is *surprised*. Surprise means this machine is doing something our model of normal behaviour cannot account for — regardless of whether that behaviour has ever been labelled as an attack. This is our path to detecting attack types that were never in the training data. It comes free from the rollout.

**(b) The trajectory itself.** We can show an analyst the actual predicted numbers for the next five minutes, alongside what really happened. The system's reasoning is inspectable, not a black box.

**(c) Counterfactuals.** This is the differentiator. We add one extra input channel meaning "an intervention was applied," then run the forecast twice: once as *do nothing*, once as *isolate this machine now*. Two curves on one chart. One climbs, one flattens.

That answers the question every security analyst actually has — **should I act?** — which no detector, however accurate, can answer. A detector says "something is wrong." We say "something is coming, and here is what happens if you do nothing versus if you act."

**Honest caveat, stated before a judge states it:** we have no real data on interventions, so this is a *structured what-if*, not a validated causal prediction. We show what the model believes happens under an intervention, grounded in how the state changes. Saying this first is far stronger than being caught not saying it.

---

### Module 7 — Evaluation: the four ways this kind of system lies to you

The evaluation is not paperwork. Each piece exists because there is a specific way we could fool ourselves.

**Lie 1: "Our model beat the baseline."** Maybe it just learned to recognise specific machines. If the same machine's data appears in both training and testing, the model memorises rather than generalises.
**Guard:** all data from one machine stays on one side of the split. Always.

**Lie 2: "We get 6 minutes of warning."** Warning time depends entirely on where you set the alert threshold. Lower it and you get more warning — and more false alarms. A single warning-time number is meaningless and is gameable in either direction.
**Guard:** we report warning time **against false-alarm rate** as a curve, with every baseline plotted on the same axes. This is what makes the number defensible.

**Lie 3: "The model learned network dynamics."** Maybe it just learned to output the average, which produces a perfectly smooth-looking training curve and predicts nothing.
**Guard:** we compare against the dumbest possible predictor — "the next minute looks exactly like this minute." If our model cannot beat that, per feature, it has learned nothing and the premise is wrong. This is a hard gate in Week 2.

**Lie 4: "The forecast is accurate."** Maybe it is accurate one step out and garbage by step ten, which an averaged number hides completely.
**Guard:** we report forecast error separately at steps 1, 5, 10, and 20.

Plus: a calibration check (does a "70% chance" actually happen 70% of the time?), per-class results (so weak attack types are not averaged away), and the benchmark against logistic regression that the problem statement names explicitly.

**This is a pitch asset, not overhead.** Most teams will report a single impressive number at a threshold they picked because it looked good. Presenting the whole trade-off curve, including where the baselines sit on it, reads as a team that knows what it is doing.

---

### Module 8 — The generalisation experiment (our potential headline)

**The experiment.** Remove one attack type *entirely* from training — the model never sees a single example of it. Then test whether the surprise signal still flags it.

**Why this matters.** Every signature-based and supervised system has the same fundamental limitation: it detects what it was trained on. Novel attacks get through. Because our model learns *normal* behaviour rather than a catalogue of attacks, anything that deviates should register as surprise — including attacks that did not exist when the model was trained.

**If it works,** we have an empirical claim almost no other submission will have: *detects attack classes absent from the training data*. That is a research result, not an engineering feature, and it would be the headline of the entire pitch.

**If it does not work,** we report it plainly as a negative result with the numbers. Judges respect that far more than a claim that falls apart under one question.

It costs one extra training run. It is scheduled early in Week 3 so there is time to react to whatever it produces.

---

## Part 4 — Ceiling and future work

State these as *known* limitations. Naming your own ceiling is a strength signal; being caught not knowing it is fatal.

### What we cannot reach in this timeline

**Graph-structured dynamics — the real architectural ceiling.**
We model each machine as an independent time series. That throws away relational information: we can see that machine A suddenly contacted 40 new peers, but not that A's new peers are *exactly the machines B contacted last week* — which is the actual fingerprint of coordinated lateral movement. A dynamic graph neural network over the host communication graph would capture this, and it is the architecturally correct answer to this problem. It is not buildable by three people in four weeks on free compute. **Named as future work.**

**Causally validated counterfactuals.**
Our intervention forecasts are structured what-ifs. Validating them properly requires a network where you can actually isolate a host and observe the result — a live testbed with ground truth on intervention outcomes. Nobody has published this dataset for intrusion scenarios. **Named as future work; the honest framing is used in the demo.**

**Real deployment scale.**
We work on captured datasets. A live deployment needs streaming feature extraction, per-host state maintained across millions of hosts, and inference latency budgets. Architecturally straightforward, entirely out of scope here. **Future work.**

### Deliberately excluded from scope

- **Automated response.** The system recommends and an analyst approves; it never executes. The problem statement asks for decision support, not autonomous action, and automated network changes need infrastructure and safety guarantees we do not have.
- **Packet-level inspection.** The raw PCAPs are too large to process on free compute; we use the flow-feature CSVs.
- **A second dataset.** We use CIC-IDS2017 (the release that retains IPs and timestamps). Holding out one weekday session gives a temporal and attack-mix domain-shift test without importing another dataset. Adding a second dataset would give a genuine cross-network test and is the honest next step; named as future work, not claimed.

---

## Part 5 — Questions you will be asked, with answers

**"How is this different from any anomaly detection system?"**
Anomaly detection tells you something is odd *now*. We forecast several minutes ahead and produce a probability curve over future time, so we can act before the event. We also get the anomaly signal for free as our surprise channel — so we have both, and it is strictly more.

**"How do we know it is detecting early rather than just detecting late and you calling it early?"**
Our warning-time-versus-false-alarm curve, with the direct classifier baseline plotted on the same axes. It shows the earliness is real and not bought by lowering the threshold.

**"Does the early warning hold for every attack?"**
No, and we are precise about this. Lead time needs the attack to build up in the observable features. For a multi-stage campaign - a scan escalating to denial of service - the forecast climbs from 5% to 70% before it peaks; that is real warning time. For a payload-drop attack like the infiltration, the victim machine looks completely normal until the payload fires, so there is no precursor to forecast from - we detect it at onset with a calibrated probability, and the value there is the predicted trajectory, the surprise signal, and the counterfactual. We report lead time per attack class, never as one blended number.

**"Is it not just an LSTM classifier with extra steps?"**
The training objective is different in a way that matters: we train on next-state prediction with no labels, so the model learns normal dynamics from the 99% benign traffic that a classifier learns nothing from. That gives us three capabilities a classifier structurally cannot have — the forward simulation, the surprise signal, and counterfactuals.

**"What about a graph model?"**
It is the architecturally correct answer and we would build it with more time. We approximated the graph signal with degree and novelty features. Named in our future work.

**"Your counterfactuals are not causal."**
Correct, and we say so on the slide. It is a structured what-if grounded in learned dynamics, not a validated causal estimate. Validating it needs intervention data nobody has published.

**"How does this handle attacks it has never seen?"**
That is exactly the held-out-class experiment (Module 8). [Insert the result once you have it. If it worked, this is the strongest moment in the pitch. If it did not, say so and explain what you learned.]

**"Why 60-second windows?"**
Long enough that a port scan registers as a distinct signature; short enough that warning time measured in windows is operationally meaningful. It is a tunable parameter and we chose it deliberately, not by default.

---

## Part 6 — Reference points to cite

- **World models** — Ha & Schmidhuber's "World Models" (2018) and the Dreamer line of work: agents learn a simulator of their environment and plan by rolling it forward internally. Our structure is the same, applied to a network.
- **Mixture density networks** — Bishop (1994). The standard tool for multi-modal prediction; used in trajectory forecasting for exactly the reason we use it.
- **Scheduled sampling** — Bengio et al. (2015). The standard remedy for exposure bias in autoregressive prediction.
- **Multi-step attack prediction, classical era** — Holgado et al. (2017), hidden Markov models for attack stage prediction. The pre-deep-learning baseline we build past.
- **Dataset label quality** — the published audit of CIC-IDS-2017/2018 (Liu, Engelen, Lynar, Essam & Joosen, 2022) documenting roughly 7.5% label error. We cite this to explain why we validate across held-out captures rather than trusting label self-consistency.
- **Transformer padding in intrusion detection** — recent work finding padding convention matters more than architecture choice for this data. Our reason for choosing an LSTM first.
