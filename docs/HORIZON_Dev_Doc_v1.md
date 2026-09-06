# HORIZON — Development Document v1

**SIH 2026 · PS 26153 · NTRO · World-model predictive cyber defence**

Team size: 3. Compute: Colab free. Dataset: `cic-collection.parquet` (Kaggle, 1.03 GB — CIC-IDS2017 + CIC-DoS2017 + CSE-CIC-IDS2018 + CIC-DDoS2019, harmonised labels).

This document supersedes Research Doc v3 on: state representation (§2), packet-level scope (cut, §0.3), team allocation (3 people, §7), and cross-dataset strategy (§6.4). Everything else in v3 still stands.

---

## 0 · Read this first

### 0.1 What we are building, in three sentences

1. For every internal machine, every 60 seconds, we write **one row describing what that machine did** — how many peers it talked to, how many ports, how many connections failed, how much data moved.
2. We train a model to answer one question: **given the last 20 rows for this machine, what does the next row look like?** Not "is this an attack." Just what happens next. Because most traffic is benign, what it mostly learns is how a normal machine behaves over time.
3. We then **run it forward**: predict row 21, feed that prediction back in, predict row 22, and so on for 20 steps. That gives us an imagined future for that machine. A second small model reads each imagined row and scores how attack-like it is. If step 6 of the imagined future looks like a port scan, we alert **now** — six minutes before it happens.

The analogy to use in every explanation: **weather forecasting**. A forecaster doesn't classify "is it raining." It learns how the atmosphere moves, runs it forward, and reads off what it produced. Same shape.

### 0.2 Why this is not just a classifier with extra steps

Three properties a classifier structurally cannot have. These are our differentiators; each is testable and each is a slide.

| Property | What it means | Test |
| --- | --- | --- |
| **Forecast** | We produce a probability *curve over future time*, not a score for now. Lead time is a real number we can report. | §6, metric 1 |
| **Surprise** | We predicted row 21; row 21 arrives; they don't match. The model is surprised. Surprise flags behaviour our model of normal cannot account for — **even for attack types never seen in training**. | §6, metric 5 + held-out-class test |
| **Counterfactual** | Roll out twice: once as "do nothing", once as "host isolated at t+1". Two curves. One climbs, one flattens. Answers *should I act*, not just *is something wrong*. | §5.4 |

Counterfactual rollout is the single feature most likely to separate us from every other team on this PS. It is cheap (one extra channel in the state vector, one extra rollout call). **It is not a stretch goal. It is Week 3 core.**

### 0.3 Explicitly cut from v3 — do not build these

- **Packet-level PCAP features.** We have no PCAPs; CIC's raw captures are hundreds of GB and unusable on Colab free. Our answer to the PS's "two feature levels" is: flow-level features aggregated into host-window state — a genuine second level of representation. State this honestly in the submission; do not imply we did packet inspection.
- **CTU-13 and UNSW-NB15.** Our parquet already spans four separate captures. Holding out one capture gives us the domain-shift result for free (§6.4).
- **SHAP.** Attention weights alone satisfy the PS's explainability requirement. SHAP over a rollout is expensive and confusing to present.
- **Automated response execution.** Recommend-and-approve only, as in v3 §3.6.

---

## 1 · GATE 0 — Column verification (do this before anything else)

Our entire state design needs source IP, destination IP, destination port, and timestamp. **Some "cleaned" CIC collections deliberately drop IPs and ports because they leak.** If this one did, the plan below cannot run as written and we branch.

```python
import pandas as pd

df = pd.read_parquet('cic-collection.parquet')
print(len(df))
print(df.columns.tolist())
print(df.dtypes)
print(df.head(3).T)
print(df['Label'].value_counts())   # column name may differ
```

Look for: any column resembling `Src IP` / `Source IP`, `Dst IP`, `Dst Port`, `Timestamp` / `Flow Start`, and a `Dataset` / `Attempted Category` style column marking which of the four captures each row came from.

**Branch on what you find:**

| Outcome | Action |
| --- | --- |
| **A — IPs + timestamp present** | Proceed with this document unchanged. |
| **B — timestamp present, IPs absent** | Fall back to **global windows**: one state row per 60s window across the whole capture, aggregating all flows in it. Weaker (no per-host attribution, alerts point at a time not a machine), but the world-model mechanism is unchanged. All of §3–§6 works with `host` replaced by `capture`. |
| **C — no usable timestamp** | Abandon this file. Download raw CSE-CIC-IDS2018 CSVs from CIC's own distribution page, which retain IPs and timestamps. Costs ~2 days. |

**Also verify capture boundaries.** Four datasets are collated here; timestamps may interleave or restart. If there is no capture-identifier column, derive one from large timestamp gaps. Every grouping downstream is by **(capture, host)** — never host alone. Grouping across a boundary stitches two unrelated machines into one sequence, produces excellent numbers, and gets destroyed in Q&A.

Do not write model code until this gate is passed and the branch is chosen. Owner: **Person A**, Day 1.

---

## 2 · State representation

### 2.1 The unit

One state vector = **one internal host, one 60-second window**.

A sequence = **20 consecutive windows for the same (capture, host)** = 20 minutes of that machine's history.

### 2.2 Why not per-flow (this was v3's error)

A 5-tuple conversation is one machine talking to one other machine on one port pair. The infiltration kill chain — Dropbox download → internal NMAP scan → C2 beacon — spans three completely different 5-tuples. A model whose input window is one conversation can never predict "and now this host starts scanning the subnet," because scanning flows are neither in its input nor in its output space. Not an accuracy problem — a representation problem, unfixable by training.

Host-windows put the whole chain in one sequence: the download stage is one external peer with high inbound bytes; the scan stage is distinct-ports jumping from 2 to 300 with failure rate spiking; the C2 stage is a new external peer with small periodic flows. Different rows, same sequence. Now "predict the next row" is a question with a real and useful answer.

5-tuple grouping still matters — but for the **train/test split** (§6.5), not for state design. Those two roles were conflated in v3.

### 2.3 The feature vector

Start with exactly these. Do not add more until the baseline in §4.2 is beaten.

| # | Feature | Definition (over all flows from this host in this window) |
| --- | --- | --- |
| 1 | `n_flows` | count of flows |
| 2 | `n_distinct_dst_ip` | unique destination IPs |
| 3 | `n_distinct_dst_port` | unique destination ports |
| 4 | `new_peer_rate` | fraction of destination IPs not contacted by this host in any prior window |
| 5 | `fail_ratio` | flows with zero response bytes, or RST flag set, / `n_flows` |
| 6 | `bytes_out` | total forward bytes |
| 7 | `bytes_in` | total backward bytes |
| 8 | `io_ratio` | `bytes_out / (bytes_in + 1)` |
| 9 | `mean_duration` | mean flow duration |
| 10 | `external_ratio` | flows to non-RFC1918 destinations / `n_flows` |
| 11 | `intervention` | **0 always during training.** Set to 1 only at counterfactual rollout (§5.4). |

**Transforms — mandatory, not optional.** Counts and byte totals are heavy-tailed across orders of magnitude. Apply `log1p` to features 1, 2, 3, 6, 7, 9, then standardise (fit scaler on train split only). Ratios (4, 5, 8, 10) are already bounded — standardise only. Skipping this makes next-state MSE dominated by `bytes_in` alone and the model learns nothing else.

**Empty windows.** A host with no flows in a window still gets a row: all zeros post-transform, with a `is_empty` flag. Silence is signal — do not skip the window and shift the timeline.

**Which hosts.** Internal (RFC1918) hosts only, as the source. External IPs are peers, not modelled subjects. Drop hosts with fewer than 40 total windows.

### 2.4 Window labels

A window is labelled with the attack class if **any** flow in it carries that label; otherwise `benign`. Keep the fine-grained attack name, not just benign/malicious — needed for per-class F1 and the held-out-class test.

Owner: **Person A**. Deliverable: `states.parquet` with columns `[capture, host, window_idx, ts, f1..f10, is_empty, label]`.

---

## 3 · Model

### 3.1 Dynamics model (the world model)

```
Input:  x[1..20]   shape (batch, 20, 11)
LSTM:   hidden 128, 2 layers, dropout 0.2
Head_D: Linear(128 -> 10)   -> predicted next state (features 1-10; intervention is not predicted)
Loss:   MSE(pred, actual_next_state)
```

This is trained on **next-state reconstruction**, not on labels. All traffic is used, benign included — that is the point. Most of what this learns is normal behaviour.

### 3.2 Readout head

```
Head_R: Linear(128 -> 64) -> ReLU -> Linear(64 -> 1) -> sigmoid
Target: is this host in an attack window within the next K=20 windows?
Loss:   BCE, pos_weight set from class balance
```

Two heads on one shared LSTM. Train jointly: `loss = MSE + λ · BCE`, start `λ = 1.0`, tune if one head dominates.

### 3.3 Scheduled sampling — the part that must not be skipped

At rollout the readout head sees hidden states produced from **the model's own predicted rows**, not real ones. If trained only on real rows, it is out of distribution from rollout step 2 onward and the whole forecast is noise. This is not fixed by "training more" — it is a specific change to the training loop.

Implementation: with probability `p`, replace the true input at each timestep with the model's own prediction from the previous step. Ramp `p` from 0.0 at epoch 0 to 0.5 by the final epoch (linear). Log `p` per epoch.

### 3.4 Rollout

```
h = encode(x[1..20])
for k in 1..K:
    s_hat = Head_D(h)
    p[k]  = Head_R(h)
    h     = lstm_step(h, s_hat)
```

Outputs: probability curve `p[1..K]`, predicted state trajectory `s_hat[1..K]`, attention/hidden norms per step.

**Lead time** = (window index at which `p` first crosses threshold θ) − (window index of the first true attack window). Reported **at matched false-alarm rate**, never at a hand-picked θ (§6.1).

Owner: **Person B**.

---

## 4 · Baselines (build these before believing any result)

### 4.1 Persistence — the dynamics baseline

`ŝ_{t+1} = s_t`. If the LSTM does not beat this on per-feature reconstruction error, the world model learned nothing and the entire framing is unsupported. **Build this on Day 3, before training anything.** Also build a class-conditional mean predictor.

v3 had baselines for the classifier and none for the dynamics model — which is the actual novel component. Fixed here.

### 4.2 Logistic regression — PS-required

Flat features from the current window, predicting attack/benign. PS names this benchmark explicitly. Report F1, precision, recall, FPR.

### 4.3 Direct multi-horizon classifier — the honest test

Same LSTM backbone, same features, but predicts `P(attack within K)` directly in one forward pass, no rollout.

**Expect this to match or beat the rollout on lead time**, because it never compounds error. Decide the framing now, not on stage: if it wins, our claim is *not* "our world model is more accurate." It is "the rollout produces an inspectable predicted trajectory — the intermediate states, the stage estimates, and the counterfactual branch — which a direct classifier cannot produce at any accuracy." That is a true statement and a strong one. Rehearse it.

---

## 5 · Demo (Streamlit)

### 5.1 Input

Upload a CSV of flows, or pick a pre-loaded host+time-range from the test split. Feature pipeline runs locally, model weights loaded from disk, **no external API calls at inference** (PS hard requirement).

### 5.2 Main panel

Infiltration-probability curve across the 20-step horizon, with the alert threshold marked and the true attack onset marked (in demo mode).

### 5.3 Trajectory panel — do not skip this

A table of the **predicted feature rows** for steps t+1…t+5 beside what actually happened. This is what makes the world model legible rather than asserted; every other team will show a probability line and nothing behind it.

### 5.4 Counterfactual panel — our differentiator

Two curves on one axis:

- **Do nothing** — standard rollout.
- **Isolate host at t+1** — same rollout, but `intervention = 1` from step 1, and `n_distinct_dst_ip`, `bytes_out` forced toward zero at the injection step.

Honest caveat for the doc and the Q&A: the model has not been trained on real intervention data, so this is a *structured what-if*, not a validated causal estimate. Say it before a juror says it.

### 5.5 Response Recommendation Panel

Per v3 §3.6, unchanged: tiered by score, filled-in `iptables` command as copyable text, Approve/Dismiss toggle that logs the decision. Never executes.

Owner: **Person C**.

---

## 6 · Evaluation

Built **before** any model training. An incorrect harness invalidates every number produced afterwards. Person C starts here on Day 1 with synthetic toy sequences.

### 6.1 Lead time vs false-alarm rate — headline

Not a single number. Sweep θ, plot lead time (y) against per-host false-alarm rate (x). Plot our rollout, the direct classifier, and logistic regression on the same axes. A single lead-time figure at a chosen threshold is gameable and every other team will report one.

### 6.2 Rollout error growth

Reconstruction error at t+1, t+5, t+10, t+20. Exposes autoregressive error compounding. A model accurate at t+1 that collapses by t+10 is a real failure mode a single-point metric hides.

### 6.3 Calibration

Reliability diagram for the probability curve. Platt scaling as default correction, isotonic if the miscalibration is not sigmoid-shaped. This is the difference between a forecast and a threshold dressed up as one.

### 6.4 Generalisation — two tests

- **Held-out capture.** Train on three of the four collated datasets, test on the fourth. Expect a 15–30 point macro-F1 drop; the drop is the finding, not a failure.
- **Held-out attack class.** Remove one attack class entirely from training. Test whether the *surprise* signal (§6.5) still fires on it. If yes, this is our strongest slide: detection of an attack type never seen in training. If no, we learned it privately rather than on stage.

### 6.5 Surprise as a second alarm

`surprise_t = ||s_t_actual − s_t_predicted||`, standardised per host. Report its AUC as a detector in its own right, independently of the readout head.

### 6.6 Splits

Group by **(capture, host)** — every window from one host stays on one side of the split. Also report a time-based split. Random split for reference only; it will be inflated and we say so.

### 6.7 Reported table

Macro-F1 (leakage-free), per-class F1 (do not average away weak classes), precision, recall, FPR vs logistic regression, plus everything above.

---

## 7 · Plan — 3 people

One owner per lane. No shared ownership.

| | **Person A — Data & State** | **Person B — Model** | **Person C — Eval & Demo** |
| --- | --- | --- | --- |
| **Week 1** | GATE 0 column check, branch decision. Capture-boundary derivation. Host-window aggregation. `states.parquet` v1. | Read the parquet schema with A. LSTM skeleton on toy sequences. Persistence baseline. | Lead-time-vs-FPR harness on toy data. **This is the gate for everything B produces.** Streamlit skeleton. |
| **Week 2** | Transforms, scaler, split logic, empty-window handling, label assignment. Freeze `states.parquet` v2. | Train dynamics model. Verify it beats persistence per-feature — **if not, stop and report before continuing.** Readout head + scheduled sampling. | Logistic regression baseline. Wire real metrics onto B's first checkpoints. Probability-curve panel. |
| **Week 3** | Held-out-capture and held-out-class splits. Support B on data bugs. | K-step rollout. Direct multi-horizon baseline. Counterfactual branch. | Rollout error growth, calibration, surprise AUC. Trajectory panel. Counterfactual panel. |
| **Week 4** | Freeze pipeline, document limitations. | Freeze weights, per-class results. | Demo video (2 min), 2-page architecture doc, 5-slide PPT. |

### Hard gates — do not pass without meeting them

1. **End of Week 1:** column branch decided, lead-time harness validated on toy data where the answer is known.
2. **Mid Week 2:** LSTM beats persistence on per-feature reconstruction. If it does not, the premise is wrong and we escalate rather than proceed.
3. **End of Week 3:** counterfactual panel renders. It is the differentiator; if it slips into Week 4 it will not ship.

---

## 8 · Risks

| Risk | Mitigation |
| --- | --- |
| IPs/ports absent from the parquet | GATE 0 on Day 1. Branch B or C, decided immediately, not discovered in Week 2. |
| Rollout degenerates — lead time = 0 | Next-state loss first, scheduled sampling, toy-example validation before real data. |
| Dynamics model collapses to predicting the mean | Persistence baseline as a hard gate (§4.1). Per-feature error, not aggregate. |
| Direct classifier beats the rollout | Expected. Framing prepared in §4.3 in advance. |
| Label noise (~7.5% documented in CIC-IDS2017/2018) | Label smoothing. Validate on held-out capture rather than trusting self-consistency. |
| Colab free session limits | Model is small (20×11 inputs, 128 hidden). Checkpoint every epoch to Drive. Subset columns before loading the 1 GB parquet. |
| Counterfactual challenged as uncausal in Q&A | We say it first: structured what-if, not a validated causal estimate. |
| 3 people, not 6 | Packet-level, SHAP, and two datasets cut. Scope now matches headcount. |

---

## 9 · References

- arXiv:2606.11098 — padding convention, not architecture, determines Transformer IDS performance; source of the leakage-free grouped-split protocol.
- arXiv:2511.03799 — systematic review; temporal/window methods give broadest ATT&CK coverage, datasets bias toward late-stage attacks.
- Liu, Engelen, Lynar, Essam & Joosen (2022) — error prevalence audit of CIC-IDS-2017/2018; source of the 7.5% label-noise figure.
- Holgado et al. (2017) — HMM-based multi-step attack prediction; the pre-deep-learning lead-time baseline.

---

*Status: v1 dev doc, written against `cic-collection.parquet`, 3 people, Colab free. First action: GATE 0 (§1), Person A, Day 1.*
