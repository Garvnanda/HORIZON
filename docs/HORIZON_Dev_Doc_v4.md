# HORIZON — Research Document v4

*World-model predictive cyber defence from network traffic — state representation corrected to host-windows, dynamics head made probabilistic, counterfactual rollout promoted to core scope, and the plan resized for 3 people on free Colab.*

SIH 2026 · PS 26153 · NTRO · Software · Blockchain & Cybersecurity

Prepared for Har Agam Deep Singh & team. **Supersedes v3** on six points: state representation moved from 5-tuple flow sequences to host-window aggregates (§3.1 — v3's design was structurally incapable of the demo it proposed); dynamics head changed from deterministic MSE to a mixture density network with sampled rollout (§3.3); counterfactual rollout moved from Week-4 stretch to Week-3 core (§3.7); packet-level PCAP features cut entirely (§2, dataset has no raw captures); CTU-13 and UNSW-NB15 replaced by held-out-capture evaluation within the primary dataset (§4.4); team plan rebuilt for 3 people, not 5–6 (§7). Companion documents: `pitch.md`, `idea.md`, `technical.md`, `implementation.md`, `frontend.md`, `api-contract.md`, `api-endpoints.md`.

**Post-v4 correction (dataset + interface).** The primary dataset changed from `cic-collection.parquet` to **CIC-IDS2017 GeneratedLabelledFlows** (`chethuhn/network-intrusion-dataset`): the collection parquet strips `Source IP` / `Destination IP` / `Timestamp`, which the host-window state design requires. Consequence: one testbed campaign (five weekday capture sessions) instead of four, so §4.4's cross-domain test is a held-out **weekday**, a temporal + attack-mix shift rather than a cross-network one — stated honestly, not as an equivalent. The demo interface changed from Streamlit to a **React frontend (`horizon-ui/`) + FastAPI backend (`horizon-api/`)**; the offline requirement is met by a static JSON bundle, the backend is optional and adds arbitrary-host live inference. `technical.md` and `implementation.md` carry the current detail.

---

# 1 · PS requirement → our commitment

Every line below maps a PS 26153 requirement to where this document resolves it.

| PS requirement | Locked commitment | Section |
| --- | --- | --- |
| Core deliverable: a learned dynamics model, not a static classifier | LSTM trained on next-state likelihood (mixture NLL), no labels in the dynamics objective; validated against a persistence baseline before anything else | §3.2, §5.1 |
| Represent network state as feature vector or graph | Per-host, per-60s-window feature vector, 10 dimensions + intervention channel; sequences of 20 windows | §3.1 |
| Two feature levels required | Flow-level features aggregated into host-window state — two levels of representation. **Packet-level cut**: dataset ships no raw PCAPs; stated as a limitation, not implied | §2, §8 |
| K-step rollout: infiltration probability + ATT&CK stage + driving features | Sampled autoregressive rollout, 50 futures × 20 steps; probability as fraction of attack-like futures; heuristic stage overlay; attention-based feature attribution | §3.4, §3.6 |
| Explainability required — black-box not acceptable | Attention weights over timesteps + the predicted trajectory itself, shown as readable feature rows. **SHAP cut** as redundant at 3-person scale | §3.6 |
| Benchmark vs logistic regression: F1, precision, recall, FPR | Reported as specified, plus two further baselines the PS does not require (§5) | §6.6 |
| Generalise to unseen attack patterns, not memorise | Group-by-(capture, host) leakage-free split; held-out weekday session; **held-out attack class** as the headline generalisation experiment | §6.4, §6.5 |
| Offline demo: Streamlit / Flask / CLI, no cloud API dependency | React frontend shipping precomputed forecasts as static JSON, zero external calls at inference; optional local FastAPI for live inference | §7, `frontend.md`, `api-endpoints.md` |
| Interpretable decision support | Response Recommendation Panel (recommend-and-approve, never executes) plus counterfactual intervention comparison | §3.7, §3.8 |
| Deliverables: code, readme, 2-page architecture doc, 2-min demo video, 5-slide PPT | This document is the internal base; the 2-page doc and 5-slide deck are distilled in Week 4 | §9 |

---

# 2 · Locked technical decisions

| Decision | Locked answer | Why |
| --- | --- | --- |
| **State representation** | Host-window: one feature vector per internal host per 60-second window; sequence = 20 consecutive windows for the same (capture, host) | **This is v4's most important correction.** v3 used sequences of flows grouped by 5-tuple. The infiltration kill chain (Dropbox download → internal NMAP scan → C2 beacon) spans three *different* 5-tuples, so a model whose entire input is one conversation cannot represent the demo it was built for. Representation failure, unfixable by training. Host-windows place the whole chain in one sequence. |
| **Graph / GNN** | Rejected, named as future work | Architecturally the correct answer — lateral movement literally is a change in graph topology. Not buildable by 3 people in 4 weeks on free Colab. `n_distinct_dst_ip` and `new_peer_rate` are a deliberate scalar approximation of node degree and edge novelty. Stated openly, not concealed. |
| **Dynamics head** | Mixture density network, 5 components, mixture NLL loss, sampled rollout (50 futures) | v3's MSE objective mathematically converges on the conditional *mean* of the next state. Where the future is multi-modal (70% idle / 30% scan burst) the mean is a state that never occurs, and feeding it back collapses the rollout toward the global average. MDN represents distinct modes; sampling commits to one per rollout. This is where the system's generative behaviour comes from. |
| **Scheduled sampling** | Mandatory, linear ramp p: 0.0 → 0.5 across training | The readout head is trained on hidden states from real rows but queried at rollout on states from imagined rows. Untreated, everything past step 1 is smooth-looking noise (exposure bias). Not fixed by "training more" — a specific change to the training loop. |
| **Counterfactual rollout** | **Core scope, Week 3.** Promoted from v3's Week-4 stretch | The only capability in the system that no classifier can produce at any accuracy, and the only screen that answers *should I act*. Costs one state channel and one extra rollout call. Framed and presented as a structured what-if, never as a validated causal estimate. |
| **Packet-level PCAP features** | **Cut.** v3 had this as core Week-2 scope | The chosen dataset ships CICFlowMeter feature rows (CSVs); CIC-IDS2017's raw PCAPs run to ~50 GB and are unusable on free Colab/Kaggle. Cutting it honestly is better than half-attempting it; it also recovers most of the 6→3 headcount reduction. |
| **Primary dataset** | **CIC-IDS2017 GeneratedLabelledFlows** (Kaggle: `chethuhn/network-intrusion-dataset`) — 8 CICFlowMeter CSVs across five weekday capture sessions, with Flow ID, both IPs, both ports, timestamp, and label | `cic-collection.parquet` (four harmonised CIC campaigns) was the v4 pick but drops IPs and timestamp, which the state design needs. `GeneratedLabelledFlows` keeps them. Fits in RAM with chunked reads. |
| **Cross-domain evaluation** | Held-out **weekday capture session** within CIC-IDS2017 (default `ids2017-friday`). CTU-13 and UNSW-NB15 both cut | With one campaign there is no held-out campaign available. Holding out a weekday is a temporal + attack-mix shift on the same testbed — weaker than cross-network, still an honest generalisation test at zero integration cost. Framed as such, not overstated. |
| **Headline generalisation experiment** | Held-out **attack class** — remove one class entirely from training, test whether the surprise signal still flags it | The only experiment that could yield a research claim rather than an engineering feature: *detects attack classes absent from training*. One extra training run. Scheduled Week 3 Day 1 so there is time to react to either outcome. |
| **Explainability** | Attention weights + the predicted trajectory rows. SHAP cut | v3 committed to both. At 3-person scale, SHAP over a 50-sample rollout is expensive and harder to read than showing the model's own predicted numbers. The trajectory table is stronger explainability than a feature-attribution bar chart. |
| **Second baseline** | Direct multi-horizon classifier — same backbone, predicts P(attack within K) in one pass, no rollout | Carried from v3, and still the sharpest test we run on ourselves. Expected to match or beat the rollout on lead time, since it never compounds error. Framing prepared in advance (§5.4). |
| **Third baseline** | **Persistence** (ŝ_t+1 = s_t), per-feature | New in v4. v3 had two baselines for the classifier and none for the dynamics model — the actual novel component. If the LSTM cannot beat "next minute looks like this minute", it has collapsed to the mean and the premise is void. Hard gate, Week 2. |
| **Response layer scope** | Recommendation panel: templated filled-in command per alert, Approve/Dismiss, decision logged, **never executed** | Unchanged from v3. PS asks for decision support, not autonomous response. |
| **Demo interface** | React frontend (`horizon-ui/`), offline, precomputed forecasts as static JSON. Optional FastAPI backend (`horizon-api/`) for live arbitrary-host inference | Streamlit replaced for a stronger visual demo (the 3D kill-chain scene, the forecast cone). Static bundle keeps the offline guarantee; the backend never has to run on stage. |
| **Calibration** | Platt scaling default, isotonic fallback | Unchanged from v3. |
| **Team size** | **3 people**: one frontend-only, two on data/eval and model | v3 planned for 5–6. Scope in §7 is cut to match, not stretched. |

---

# 3 · Architecture

## 3.1 State representation

**Unit.** One state vector = one internal host, one 60-second window. One sequence = 20 consecutive windows for the same (capture, host). Forecast horizon K = 20 windows.

**Features (11 dimensions).**

| # | Feature | Definition (over this host's flows in this window) | Transform |
| --- | --- | --- | --- |
| 1 | `n_flows` | flow count | log1p → standardise |
| 2 | `n_distinct_dst_ip` | unique destination IPs | log1p → standardise |
| 3 | `n_distinct_dst_port` | unique destination ports | log1p → standardise |
| 4 | `new_peer_rate` | fraction of dst IPs never contacted by this host before | standardise |
| 5 | `fail_ratio` | flows with zero response bytes or RST, ÷ n_flows | standardise |
| 6 | `bytes_out` | total forward bytes | log1p → standardise |
| 7 | `bytes_in` | total backward bytes | log1p → standardise |
| 8 | `io_ratio` | bytes_out / (bytes_in + 1) | log1p → standardise |
| 9 | `mean_duration` | mean flow duration | log1p → standardise |
| 10 | `external_ratio` | flows to non-RFC1918 destinations ÷ n_flows | standardise |
| 11 | `intervention` | **0 throughout training.** Set to 1 only in counterfactual rollout | none |

**Why these features.** They are chosen so attack behaviour is *expressible* in the numbers without being hard-coded: a port scan is feature 3 spiking with feature 5; lateral movement is feature 4 climbing; exfiltration is features 8 and 10 rising together; a C2 beacon is low 1, low 6, high 10, steady 9. We do not encode these rules — we provide a representation in which the model can learn them.

**Transforms are mandatory.** Counts and byte totals are heavy-tailed across orders of magnitude. Untransformed, reconstruction loss is dominated by `bytes_in` alone. Scaler fitted on the train split only, persisted, applied everywhere.

**Empty windows** get a row of zeros plus an `is_empty` flag. Silence is signal; skipping the window shifts the timeline and corrupts every lead-time measurement.

**Host selection.** Internal (RFC1918) sources only; external IPs are peers, not modelled subjects. Drop hosts with under 40 windows.

**Grouping.** Always by **(capture, host)**, never host alone — the same host IP recurs across weekday sessions, and stitching across a session boundary joins two runs of one machine under different conditions into one sequence.

## 3.2 Encoder

```
Input   x[1..20]                     (batch, 20, 11)
LSTM    hidden 128, 2 layers, dropout 0.2, batch_first
Output  h                            (batch, 128)
```

**Why LSTM before Transformer.** Naturally stateful, so autoregressive rollout is a loop rather than a re-encode of a growing sequence. Recent IDS work finds Transformer performance on this data is governed more by padding convention than by architecture — a warning that Transformers here fail subtly and invisibly. At 20 timesteps, attention buys little over recurrence.

## 3.3 Dynamics head — mixture density network

```
K_mix = 5
Head_D: Linear(128 → 5 × (1 + 10 + 10))
        = 5 mixture logits + 5×10 means + 5×10 log-variances
Loss:   mixture negative log-likelihood
```

Trained on the **next state**, with no labels. Because ~99% of traffic is benign, the objective turns the boring majority of the data into a detailed model of normal host behaviour — data a classifier learns almost nothing from.

**Numerical stability, non-negotiable:** clamp log-variances to [-7, 3]; use `logsumexp`, never manual log-of-sum-of-exps; gradient clipping at 1.0. NaN loss is almost always a variance collapsing toward zero.

**Sampling:** draw a component from the categorical over mixture weights, then sample within that component's Gaussian. Each rollout commits to a mode and follows it.

**Fallback:** if MDN training fails twice, discretise each feature into 20 quantile bins and predict a softmax per feature with cross-entropy. More robust, equally expressive, larger output layer.

**What this gives us, precisely.** During training the model learns the recurring *modes* of host behaviour. At inference it recombines them into sequences that never literally occurred. That is real generative behaviour and it is worth claiming. It does **not** invent attack shapes unrelated to anything in the data — claim more than this and the claim breaks under one question.

## 3.4 Readout head and rollout

```
Head_R: Linear(128 → 64) → ReLU → Dropout → Linear(64 → 1) → sigmoid
Target: attack window for this host within the next K=20 windows
Loss:   BCE with pos_weight from class balance
Joint:  loss = mdn_nll + λ · bce      (λ = 1.0 initially)
```

**Shared trunk is the experiment.** The hypothesis is that the representation learned by predicting the future is useful for detecting attacks. Two separate models would never test it. **Log both loss terms separately every epoch** — if BCE dominates, the trunk quietly becomes a classifier and we retain the world-model label with none of the substance.

**Rollout:** encode 20 windows → sample next state → feed back → repeat 20 steps → repeat the whole thing 50 times.

Derived outputs: `p_frac[k]` (fraction of sampled futures attack-like at step k — the headline probability, more interpretable than an averaged sigmoid), `p_mean[k]`, `spread[k]` (uncertainty), and `divergence` (how much the 50 futures disagree — a host at a decision point scores high; reported with its own standalone AUC).

## 3.5 Lead time and surprise

**Lead time** = alert window index − first true attack window index. **Never reported as a single number** — the threshold determines it, so it is gameable in both directions. Reported as a curve against false-alarm rate with all baselines on shared axes (§6.1).

**Surprise** = negative log-likelihood of the *actual* next state under the model's prediction, standardised per host over a rolling baseline. Reported as an independent detector with its own AUC. This is the channel that catches attack classes absent from training, and it comes free from the rollout.

## 3.6 Explainability

Attention weights over the 20-window history (which moments drove the prediction), plus the predicted trajectory rendered as readable feature rows in original units alongside what actually happened. An analyst can see that the model wrote down "47 distinct ports, failure rate 0.71" for a minute that had not happened yet. That is stronger and more legible than a feature-attribution bar chart.

## 3.7 Counterfactual rollout — core scope

Roll out twice from identical history: *do nothing*, and *isolate host at step 1* (intervention channel set to 1; `n_distinct_dst_ip`, `n_distinct_dst_port`, `bytes_out`, `external_ratio` forced toward per-host minima). Two probability curves on one axis.

**Stated caveat, in the document, on the panel, and in the pitch:** the model has never seen real intervention data, so this is a structured what-if grounded in learned dynamics, not a validated causal estimate. Saying it first converts a vulnerability into a credibility signal.

## 3.8 MITRE ATT&CK stage mapping

Heuristic overlay, stated as such — dataset attack-class labels do not map 1:1 to ATT&CK tactics. PortScan → Reconnaissance · Brute Force / Web Attack → Initial Access · Infiltration → Lateral Movement · Bot → C2 · Exfiltration → Exfiltration · SQL Injection → Execution/Collection. Presented to a jury as *trajectory stage estimation*, not technique identification.

## 3.9 Demo application

React frontend (`horizon-ui/`), five panels in demo order: forecast cone · counterfactual comparison · trajectory table · surprise timeline · response recommendation, plus a 3D kill-chain scene driven by the live forecast. Fully offline (forecasts shipped as static JSON), live threshold slider. Optional FastAPI backend (`horizon-api/`) serves the same shapes from the trained model for arbitrary-host inference. Full specification in `frontend.md`; output shapes in `api-contract.md`; backend in `api-endpoints.md`.

---

# 4 · Data pipeline

## 4.1 Gate 0 — column verification

**Nothing else starts until this passes.** The state design requires source IP, destination IP, destination port, and timestamp. The `MachineLearningCVE` variant of this dataset drops IPs and ports; `GeneratedLabelledFlows` keeps them. Verify.

| Outcome | Action |
| --- | --- |
| **A** — IPs + timestamp present (expected) | Proceed as written |
| **B** — timestamp present, IPs absent | Re-check the dataset variant first. If genuinely absent: global-window fallback, one state row per 60s window per session; features 2, 3, 4, 10 become session-wide. Mechanism unchanged; alerts point at a time, not a machine |
| **C** — no usable timestamp | Abandon; pull raw CIC-IDS2017 CSVs from CIC's distribution page. ~2 days |

Capture session = the weekday, from the filename. Thursday/Friday have multiple files, concatenated in time order before windowing.

## 4.2 Aggregation

Chunked processing, columns subset before load. `new_peer_rate` maintained as a running per-host set of previously-seen destinations in chronological order, reset per (capture, host).

Output: `states.parquet` — `[capture, host, window_idx, ts, <10 named features>, is_empty, label]`, sorted. Written by `notebooks/horizon_train.ipynb`, loaded directly by the backend.

## 4.3 Labels

A window carries an attack class when at least `LABEL_MIN_MALICIOUS` flows in it are so labelled (default 1), taking the most common malicious class. Fine-grained class retained, not just binary — needed for per-class metrics and the held-out-class experiment. Label smoothing applied; the published audit of CIC-IDS-2017/2018 documents roughly 7.5% label error, which is why we validate against a held-out session rather than trusting label self-consistency.

## 4.4 Cross-domain evaluation

Train on four weekday sessions, test on the fifth (`HELDOUT_CAPTURE`, default `ids2017-friday`). Expect a macro-F1 drop. **The drop is the finding, not a failure** — an honest generalisation measurement most published work avoids reporting. State what shifts precisely: same testbed and address ranges, different day and attack tooling. A temporal + attack-mix shift, not cross-network. Weaker than a held-out-campaign test; do not present it as equivalent.

---

# 5 · Baselines

| # | Baseline | What it tests |
| --- | --- | --- |
| 1 | **Persistence** (ŝ_t+1 = s_t), per-feature | Did the dynamics model learn anything at all, or collapse to the mean? **Hard gate, Week 2.** New in v4 |
| 2 | Class-conditional mean | Second sanity floor on reconstruction |
| 3 | **Logistic regression** on current-window features | PS-required benchmark, named explicitly |
| 4 | **Direct multi-horizon classifier** — same backbone, one forward pass, no rollout | Does the rollout's trajectory reconstruction earn its complexity and its error compounding? |

**On baseline 4.** Expect it to match or beat the rollout on lead time. If it does, the claim is *not* "our world model is more accurate." It is: the rollout produces an inspectable predicted trajectory, a surprise signal, and a counterfactual branch — none of which a direct classifier can produce at any accuracy. Rehearse this; do not improvise it on stage.

---

# 6 · Evaluation protocol

Built in Week 1 on synthetic toy sequences with an arithmetically known answer, **before any real training**. A wrong harness invalidates every number produced afterwards.

| Priority | Metric | Why ranked here |
| --- | --- | --- |
| 1 | **Lead time vs false-alarm rate curve** | The differentiator, reported honestly. A single lead-time number is threshold-dependent and gameable; every other team will report one. All baselines on shared axes |
| 2 | **Held-out attack class, surprise AUC** | Our potential headline: detects classes absent from training. Two held-out classes, one high-volume, one distinct in character |
| 3 | Rollout error growth (steps 1 / 5 / 10 / 20) | Exposes autoregressive compounding that an averaged metric hides |
| 4 | Held-out capture: macro-F1 and lead-time drop | Domain shift, honestly measured |
| 5 | F1 / precision / recall / FPR vs logistic regression | PS-required benchmark |
| 6 | Lead time and calibration vs direct multi-horizon classifier | Does the rollout earn its own risk |
| 7 | Per-class F1 | Do not average away weak classes |
| 8 | Calibration (reliability diagram, Platt/isotonic) | Is the probability curve a genuine forecast or a step function |
| 9 | Divergence AUC | The disagreement-among-futures signal as a standalone detector |
| 10 | Persistence comparison, per-feature | Gate, not a headline — but the number that decides whether anything else is real |

**Splits.** Primary: group by (capture, host) — every window from one host on one side. Also time-based. Random for reference only, flagged as inflated.

---

# 7 · Team plan — 3 people, 4 weeks

**P1 — frontend only.** **P2 — data & evaluation.** **P3 — model.**

**The contract, frozen.** In `api-contract.md`. P1 built the entire frontend against mocks; the backend too. Swapping in real output is a `VITE_API_BASE` env var or a file drop into `horizon-api/artifacts/`.

**Progress against this plan:** the contract, mock bundle, frontend (all panels + 3D scene), backend (`horizon-api/`, stub + live), and training notebook (`notebooks/horizon_train.ipynb`) are **done**. Not done: running the notebook on real data, the full eval harness (Week 3 P2 column below), the held-out-class experiment, and packaging (Week 4). `implementation.md` "What is left" has the itemised list.

| Week | P1 — Frontend | P2 — Data & eval | P3 — Model |
| --- | --- | --- | --- |
| **1** | React skeleton; mock generator; **forecast cone panel**; design locked | **Gate 0 Day 1**; session boundaries; host-window aggregator; `states.parquet` v1; **metrics harness on toy data**; persistence baseline | LSTM + MDN on **toy data only**; verify MDN separates a deliberately bimodal toy distribution; rollout loop |
| **2** | Trajectory table; surprise timeline; host selector; threshold slider | Full `states.parquet`; transforms and splits; logistic regression; **run persistence vs P3's checkpoints** | Train on real data; **Gate 2: beat persistence per-feature**; readout head; joint training; scheduled sampling |
| **3** | **Counterfactual panel**; response panel; swap mocks for real backend; rehearse walkthrough | Held-out weekday; **lead-time vs FPR curve**; error growth; calibration; surprise and divergence AUC | **held-out-class experiment (×2)**; full sampled rollout; counterfactual branch; emit real artifacts |
| **4** | Polish; **record 2-min video**; projector test | Freeze metrics; results table; limitations | Freeze weights; per-class results; sampling-vs-mean ablation if time |

**Hard gates.**
1. **End Week 1** — column branch decided · toy harness validated · MDN fits a bimodal toy distribution · cone renders from mock JSON.
2. **Mid Week 2** — **LSTM beats persistence per-feature.** If not, the premise is wrong. Stop and investigate; do not tune quietly past it.
3. **End Week 3** — counterfactual panel renders from real data · held-out-class result exists, positive or negative · lead-time curve plotted.

**Cut list, in order:** response panel → calibration plots → random-split reference → second held-out class → time-based split.
**Never cut:** counterfactual panel · forecast cone · lead-time-vs-FPR curve · persistence baseline.

---

# 8 · Risk map

| Risk | Probability | Mitigation |
| --- | --- | --- |
| IPs/ports absent (wrong dataset variant) | Medium — `MachineLearningCVE` drops them | Gate 0 on Day 1; confirm `GeneratedLabelledFlows`; branch decided immediately |
| One-campaign data weakens the domain-shift claim | Certain | §4.4 frames the held-out weekday honestly as temporal + attack-mix shift; never called cross-network |
| LSTM fails to beat persistence | Medium — per-host per-minute traffic is bursty and partly random; "next minute looks like this minute" may be hard to beat | Hard gate mid-Week 2. Likely causes if it fails: transforms not applied, scaler leaking across splits, non-contiguous sequences, learning rate too high. Escalate rather than proceed |
| MDN training unstable / NaN | Medium | Log-variance clamping, logsumexp, gradient clipping; discretised fallback after two failures |
| Detection loss swamps dynamics loss | Medium | Log both terms separately; tune λ; persistence gate catches the failure |
| Rollout collapses (lead time ≈ 0) | Reduced from v3 by sampling and scheduled sampling | Toy-example validation in Week 1 before real data; keep the toy rollout as a guaranteed-clean fallback demo |
| Direct classifier beats the rollout | **Likely** | Expected. Framing prepared in §5. This is a presentation problem, not a project failure |
| Held-out-class experiment produces nothing | Medium | Report as a negative result with numbers. Scheduled Week 3 Day 1 precisely so there is time to react |
| Frontend blocked waiting on ML | High if unmanaged | Frozen JSON contract Day 2; P1 never waits on real data |
| Counterfactual slips to Week 4 | Medium | Then it does not ship, and it is the differentiator. Gate 3 exists for this |
| Counterfactual challenged as non-causal | **Certain** | Stated first — in this document, on the panel, in the pitch |
| Graph modelling raised in Q&A | Likely | Named as the architectural ceiling and as future work; scalar degree/novelty features described as the deliberate approximation |
| Colab/Kaggle session death mid-training | High | Notebook checkpoints `model.pt` every epoch to `artifacts/`; chunked reads, columns subset before load |
| Label noise (~7.5% documented) | Known | Label smoothing; validate on held-out capture, not label self-consistency |

---

# 9 · Ceiling and future work

Stated as known limitations. Naming your own ceiling is a strength signal; being caught not knowing it is fatal.

**Graph-structured dynamics — the architectural ceiling.** We model each host as an independent time series, discarding relational structure. We can see that host A contacted 40 new peers; we cannot see that A's new peers are exactly the hosts B contacted last week — the actual fingerprint of coordinated lateral movement. A dynamic GNN over the host communication graph captures this and is the correct answer to this problem. Not buildable in this timeline.

**Causally validated counterfactuals.** Validating intervention forecasts requires a network where a host can actually be isolated and the outcome observed. No such intrusion dataset has been published. Ours remain structured what-ifs.

**Live deployment.** Streaming feature extraction, per-host state across millions of hosts, inference latency budgets. Architecturally straightforward, entirely out of scope.

**Deliberately excluded:** automated response (recommend-and-approve only) · packet-level inspection (raw PCAPs too large) · additional external datasets (one dataset chosen for column compatibility; a second is future work, and would strengthen the domain-shift claim §4.4 currently understates).

---

# 10 · Deliverables checklist

Source code link with README mirroring §3–4 · 2-page architecture document distilled from §1–3 · 2-minute demo video scripted around one host (history → cone → alert → counterfactual → surprise), not a feature tour · 5-slide technical presentation · Q&A rehearsal against `pitch.md` Part 5.

---

# 11 · Key references

- **World models** — Ha & Schmidhuber (2018) and the Dreamer line: agents learn a simulator of their environment and plan by rolling it forward internally. Our structure, applied to a network.
- **Mixture density networks** — Bishop (1994). The standard tool for multi-modal prediction; used in trajectory forecasting for the same reason we use it — a car at an intersection might turn or go straight, and averaging the two predicts driving into the kerb.
- **Scheduled sampling** — Bengio et al. (2015). Standard remedy for exposure bias in autoregressive prediction.
- **Multi-step attack prediction, classical era** — Holgado et al. (2017), HMM-based attack stage prediction. The pre-deep-learning baseline we build past; rejected as an approach because its states must be hand-specified rather than learned.
- **Dataset label quality** — Liu, Engelen, Lynar, Essam & Joosen (2022), error-prevalence audit of CIC-IDS-2017/2018; source of the 7.5% figure.
- **Transformer padding in IDS** — arXiv:2606.11098; padding convention rather than architecture governs performance, and the source of our grouped leakage-free split protocol.
- **ATT&CK coverage in temporal methods** — arXiv:2511.03799; window-based methods give the broadest tactic coverage, and public datasets bias toward late-stage attacks.

---

*Document status: v4 + post-v4 correction (dataset `cic-collection.parquet` → CIC-IDS2017 GeneratedLabelledFlows; interface Streamlit → React + FastAPI). Scaffolding (contract, mocks, frontend, backend, training notebook) built. Next gate: Gate 0 on a real notebook run. See `implementation.md` "What is left".*