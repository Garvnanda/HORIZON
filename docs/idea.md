# idea.md — HORIZON

**Predictive cyber defence with a learned world model of network behaviour**

SIH 2026 · PS 26153 · NTRO · Blockchain & Cybersecurity · Software

---

## The problem

Intrusion detection is reactive by design. Every deployed system — signature-based or machine-learned — answers one question: *is this traffic malicious?* By the time it answers yes, the attacker is already inside and the damage window has opened.

Two consequences follow, and both are well documented in practice:

**Detection comes too late to prevent.** Real intrusions unfold in stages over minutes to hours: initial access, then internal reconnaissance, then lateral movement, then exfiltration or encryption. Detectors typically fire on the loud late stages. The quiet early stages — a single unusual download, a machine probing its neighbours — pass unremarked because in isolation each looks benign.

**Novel attacks pass through.** A supervised detector detects what it was trained on. An attack pattern absent from the training data has no boundary to cross, so it produces no alert. Every zero-day is, definitionally, this failure.

And a third, less discussed: **detection does not tell an analyst what to do.** An alert says something is wrong. It does not say whether isolating the machine will help, or whether the threat has already moved elsewhere.

---

## The idea

Stop building a detector. Build a **simulator of normal network behaviour**, and use its predictions.

Concretely: learn how each machine on the network behaves over time, then run that learned behaviour forward to imagine what the machine is about to do in the next several minutes. Score the imagined futures for danger. Alert on the forecast, not the observation.

The intuition is weather forecasting. A weather model does not classify "is it raining." It learns how the atmosphere moves, runs it forward, and reads off what it produced. Same structure here: learn the dynamics, simulate forward, read off the risk.

This is a **world model** in the standard AI sense — a learned model of an environment's dynamics that an agent can roll forward internally instead of acting in the real world. The problem statement asks for exactly this: a model of P(S_t+1 | S_t) over network state.

---

## How it works, in three steps

**1. Describe each machine, minute by minute.**
Every 60 seconds, each machine gets one row of numbers: how many other machines it contacted, how many ports, how many of those were machines it had never talked to before, how many attempts failed, how much data moved each way, how much went outside the organisation.

**2. Learn what normally comes next.**
Train a model to predict the next row from the previous twenty. No attack labels involved. Because the overwhelming majority of traffic is normal, what it learns is a detailed model of normal machine behaviour.

Critically, the model does not predict *one* next row — it predicts a set of possibilities with their likelihoods. Real futures are multi-modal: a machine might stay idle, or start a backup, or begin browsing. A model forced to pick one answer averages them into something that never happens.

**3. Imagine forward, many times.**
Sample a possible next minute, feed it back, sample the one after, out to twenty minutes. Do this fifty times and you get fifty plausible futures. A second small model scores each imagined minute for how attack-like it looks.

The output is not a number. It is a **spread of possible futures** — a forecast cone — with a probability curve running through it.

---

## What this makes possible that detection cannot

**Early warning with a real time budget.** The alert fires when the *forecast* crosses the threshold, not when the attack lands. Warning time is a number we measure and report.

**Detection of unseen attack types.** The model learns normal behaviour, not a catalogue of attacks. When reality diverges from what the model predicted, that divergence — surprise — flags behaviour the model of normality cannot account for, whether or not it has ever been labelled. We test this directly by removing an attack type entirely from training and checking whether it still gets caught.

**Uncertainty that means something.** When the fifty imagined futures agree, the model is confident. When they split — thirty quiet, twenty escalating — that disagreement is itself an early warning, and it is exactly the information an analyst needs for triage.

**Answers to "should I act?"** Run the forecast twice: once as *do nothing*, once as *isolate this machine now*. Two curves. One climbs, one flattens. No detector, at any accuracy, can produce that comparison — it requires a model that simulates forward.

**Explanations an analyst can read.** We can show the predicted numbers for the next five minutes next to what actually happened. The forecast is inspectable, not a black-box score.

---

## What we are claiming, precisely

We are careful about this, because overclaiming is the fastest way to lose a technical audience.

**We claim:** a model trained on next-state prediction learns network dynamics well enough to forecast attack-like states before they occur, with measurable warning time at a controlled false-alarm rate; that divergence from its predictions detects behaviour absent from its training data; and that its forward simulation supports intervention comparison.

**We do not claim:** that it invents attack patterns unrelated to anything in its training data (it composes learned behavioural modes into novel sequences — real, but bounded); that our intervention forecasts are causally validated (they are structured what-ifs, since no intervention ground truth exists); or that we model relational structure between machines (we approximate it with per-host degree and novelty features — a dynamic graph model is the correct answer and is named as future work).

---

## Scope

**In scope.** Offline analysis of captured network flow data. Host-level state modelling, probabilistic forward simulation, forecast scoring, surprise-based novelty detection, intervention comparison, an offline demo interface, and an evaluation protocol built to resist self-deception.

**Out of scope, deliberately.** Automated response — the system recommends a specific command and an analyst approves it; it never executes, never modifies network state. Packet-level inspection — no raw captures available at usable scale. Live streaming deployment — architecturally straightforward, not this project.

---

## Data

CIC-IDS2017 (the `GeneratedLabelledFlows` release), a public intrusion-detection testbed capture: eight CICFlowMeter CSVs across five weekday sessions, covering reconnaissance, brute force, web attacks, infiltration, botnet command-and-control, and denial of service. This release keeps source and destination IPs and per-flow timestamps, which the host-level state model needs; the harmonised multi-dataset collections drop them.

Holding out one entire weekday session as the test set gives a domain-shift evaluation without importing external data — a temporal and attack-mix shift on the same testbed. Weaker than a cross-network test, still stronger than a random split, and we state it as exactly that.

---

## Why this is not incremental

Three properties, each testable, none available to a classifier:

| | Classifier | HORIZON |
| --- | --- | --- |
| Output | score for now | probability curve over the next 20 minutes |
| Unseen attacks | no boundary to cross, no alert | surprise fires on any deviation from learned normality |
| "Should I act?" | unanswerable | two forecasts, intervention versus not |

The problem statement asks for a learned dynamics model rather than a static classifier. Most submissions will build a classifier and describe it as a dynamics model. The difference is visible in the training objective, and ours is next-state prediction with no labels.

---

## Build state

Contract, mock data, React frontend (all panels + a 3D kill-chain scene), FastAPI backend (`horizon-api/`, offline static bundle plus optional live inference), and the training notebook (`notebooks/horizon_train.ipynb`) are built. What remains is running the notebook on the real data and the evaluation harness. See `implementation.md`.
