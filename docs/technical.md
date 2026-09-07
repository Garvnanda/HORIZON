# technical.md — HORIZON technical specification

SIH 2026 · PS 26153. Dataset: **CIC-IDS2017 GeneratedLabelledFlows** (Kaggle: `chethuhn/network-intrusion-dataset`) — 8 CICFlowMeter CSVs, one per capture session, spanning five weekdays (Mon–Fri) of a single testbed campaign. Compute: Colab / Kaggle free. Team: 3.

This is the reference spec. `implementation.md` says who builds what and when. `pitch.md` explains why. `api-contract.md` freezes the model→frontend output; `api-endpoints.md` documents the backend that serves it.

**Why this dataset, not `cic-collection.parquet`.** The earlier plan named `cic-collection.parquet` (four harmonised CIC campaigns). That file drops `Source IP` / `Destination IP` / `Timestamp` — the columns the host-window state design is built on — so it is unusable here. `GeneratedLabelledFlows` keeps Flow ID, both IPs, both ports, and the timestamp. The cost: one testbed campaign instead of four, so the cross-domain test is a held-out **weekday session** rather than a held-out campaign (§6.5) — a weaker shift, stated honestly.

---

## 0 · Gate 0 — column verification

**Nothing else starts until this passes.** Our state design requires source IP, destination IP, destination port, and timestamp. Some "cleaned" CIC collections deliberately drop IPs and ports because they leak — a model can memorise the attacker's address instead of learning behaviour.

```python
import pandas as pd, glob
files = sorted(glob.glob('<data>/**/*.csv', recursive=True))
df = pd.read_csv(files[0], nrows=300)
df.columns = df.columns.str.strip()          # CIC headers carry leading spaces
print(files)
print(df.columns.tolist())
print(df.head(3).T)
print(df['Label'].value_counts())
```

Look for: `Source IP`, `Destination IP`, `Destination Port`, `Timestamp`, `Label`. The capture session is identified by the **filename** (`Monday-WorkingHours...`, `Friday-WorkingHours-Afternoon-PortScan...`), not a column.

| Outcome | Action |
| --- | --- |
| **A** — IPs + timestamp present (expected for `GeneratedLabelledFlows`) | Proceed as written. |
| **B** — timestamp present, IPs absent | First re-check you pulled `GeneratedLabelledFlows`, not the `MachineLearningCVE` variant. If genuinely absent: global-window fallback, one state row per 60s window over the whole session, features 2, 3, 4, 10 become session-wide. Mechanism unchanged; alerts point at a time rather than a machine. Downstream works with `host` replaced by `capture`. |
| **C** — no usable timestamp | Abandon this file. Pull the raw CIC-IDS2017 CSVs from CIC's distribution page. Costs ~2 days. |

**Capture sessions.** The eight CSVs map to five weekday captures (`ids2017-monday` ... `ids2017-friday`); Thursday and Friday have two/three files each, concatenated in time order before windowing. Every grouping downstream is by **(capture, host)**, never host alone. The same host IP recurs across weekdays; stitching across a session boundary joins two runs of one machine under different attack conditions into one sequence, produces excellent-looking numbers, and collapses under one question in Q&A.

---

## 1 · State representation

### 1.1 Unit

One state vector = **one internal host, one 60-second window**.
One sequence = **20 consecutive windows for the same (capture, host)** = 20 minutes of history.
Forecast horizon K = **20 windows**.

### 1.2 Feature vector (11 dimensions)

| # | Name | Definition (over flows from this host in this window) | Transform |
| --- | --- | --- | --- |
| 1 | `n_flows` | count of flows | log1p → standardise |
| 2 | `n_distinct_dst_ip` | unique destination IPs | log1p → standardise |
| 3 | `n_distinct_dst_port` | unique destination ports | log1p → standardise |
| 4 | `new_peer_rate` | fraction of dst IPs never contacted by this host in any prior window | standardise |
| 5 | `fail_ratio` | flows with zero response bytes or RST flag, ÷ `n_flows` | standardise |
| 6 | `bytes_out` | total forward bytes | log1p → standardise |
| 7 | `bytes_in` | total backward bytes | log1p → standardise |
| 8 | `io_ratio` | `bytes_out / (bytes_in + 1)` | log1p → standardise |
| 9 | `mean_duration` | mean flow duration | log1p → standardise |
| 10 | `external_ratio` | flows to non-RFC1918 destinations ÷ `n_flows` | standardise |
| 11 | `intervention` | **0 during all training.** Set to 1 only in counterfactual rollout (§5.3). | none |

**Transforms are mandatory.** Counts and byte totals span orders of magnitude with heavy tails. Untransformed, the reconstruction loss is dominated entirely by `bytes_in` and the model learns nothing else. The transform lives in `horizon_api.features.FeatureScaler` (log1p on the heavy-tailed subset, then standardise), imported by both the training notebook and the serving backend so they cannot drift. Fit on the **train split only**; persist as `scaler.json` and apply the same one everywhere.

**Empty windows.** A host with no flows still gets a row — zeros post-transform, plus an `is_empty` flag. Silence is signal; skipping the window shifts the timeline and corrupts every lead-time measurement.

**Host selection.** Internal (RFC1918) source addresses only. External IPs are peers, not modelled subjects. Drop hosts with fewer than 40 total windows.

**`new_peer_rate` implementation note.** Maintain a per-host set of previously-seen destination IPs, updated window by window in chronological order. It is a running state, not a groupby. Reset per (capture, host). The first few windows per host are biased high (every peer is "new"); skip the first `WARMUP_WINDOWS` (default 5) windows per host when **fitting the scaler**, keep them in the sequences.

### 1.3 Window labels

A window carries an attack class when at least `LABEL_MIN_MALICIOUS` flows in it are so labelled (default 1; raise it to suppress single-flow noise), taking the most common malicious class; otherwise `benign`. Keep the fine-grained class name, not just binary — needed for per-class metrics and the held-out-class experiment.

### 1.4 Output artifact

`states.parquet` — columns `[capture, host, window_idx, ts, <10 named features>, is_empty, label]`, sorted by `(capture, host, window_idx)`. Written by the training notebook, loaded directly by the backend for history slicing, the host list, and the surprise timeline.

---

## 2 · Model

### 2.1 Encoder

```
Input   x[1..20]              (batch, 20, 11)
LSTM    hidden=128, layers=2, dropout=0.2, batch_first=True
Output  h                     (batch, 128)   final hidden state
```

### 2.2 Dynamics head — mixture density network

Predicts a **distribution** over the next state, not a point.

```
K_mix = 5 components
Head_D: Linear(128 -> K_mix * (1 + 10 + 10))
        = 5 mixture logits
        + 5 x 10 means
        + 5 x 10 log-variances     (features 1-10; intervention is not predicted)
```

**Loss — mixture negative log-likelihood:**

```python
# means, log_vars: (B, K, 10); logits: (B, K); target: (B, 10)
log_pi   = F.log_softmax(logits, dim=-1)                    # (B, K)
var      = log_vars.exp().clamp(min=1e-4)
t        = target.unsqueeze(1)                              # (B, 1, 10)
log_prob = -0.5 * (((t - means) ** 2) / var + log_vars + math.log(2 * math.pi))
log_prob = log_prob.sum(-1)                                 # (B, K)
loss     = -torch.logsumexp(log_pi + log_prob, dim=-1).mean()
```

**Numerical stability — do not skip.** Clamp `log_vars` to `[-7, 3]`. Use `logsumexp`, never a manual log of a sum of exps. If loss goes NaN, the cause is almost always a variance collapsing to zero — tighten the clamp.

**Sampling:**

```python
k       = torch.distributions.Categorical(logits=logits).sample()      # (B,)
mu      = means.gather(1, k[:,None,None].expand(-1,1,10)).squeeze(1)
sigma   = var.gather(1, k[:,None,None].expand(-1,1,10)).squeeze(1).sqrt()
s_next  = mu + sigma * torch.randn_like(mu)
```

**Fallback if MDN training is unstable:** discretise each feature into 20 quantile bins, predict a softmax over bins per feature, train with cross-entropy, sample per feature. More robust, equally expressive, larger output layer. Switch only if MDN has failed twice.

### 2.3 Readout head

```
Head_R: Linear(128 -> 64) -> ReLU -> Dropout(0.2) -> Linear(64 -> 1) -> sigmoid
Target: does an attack window occur for this host within the next K=20 windows?
Loss:   BCEWithLogitsLoss(pos_weight = n_negative / n_positive)
```

### 2.4 Joint training

```
loss = mdn_nll + lambda * bce          lambda = 1.0 initially
```

**Log both terms separately every epoch.** If BCE dominates, the shared LSTM quietly becomes a classifier and the dynamics degrade — leaving the world-model framing with nothing behind it. If `mdn_nll` stops improving while BCE keeps falling, reduce lambda.

### 2.5 Scheduled sampling

Mandatory. Without it, everything past rollout step 1 is noise that looks smooth.

During training, at each timestep, with probability `p` replace the true input with a sample from the model's own previous-step prediction. Ramp `p` linearly from 0.0 at epoch 0 to 0.5 at the final epoch. Log `p` per epoch.

### 2.6 Training configuration

```
optimizer      Adam, lr=1e-3, weight_decay=1e-5
scheduler      ReduceLROnPlateau(patience=3, factor=0.5)
batch_size     256
epochs         40, early stopping on val loss, patience=7
grad clipping  clip_grad_norm_(1.0)      # required with MDN
checkpoint     every epoch to artifacts/ (Colab/Kaggle sessions die)
```

---

## 3 · Baselines

Build all three. Each answers a different question.

**3.1 Persistence — `ŝ_{t+1} = s_t`.** The dynamics baseline. Report per-feature MSE. **If the LSTM does not beat this per-feature, the model learned nothing and the premise is wrong.** Hard gate, Week 2. Build it before the LSTM.

*Strengthen the gate* (agreed, still to apply): also report persistence MSE restricted to **pre-transition windows** — the 3–5 windows immediately before an attack onset, where "next minute looks like this minute" is exactly the assumption that should break. Beating persistence on quiet windows is easy; beating it there is the real test.

**3.2 Class-conditional mean.** Predict the mean next state per attack class. Second sanity floor. Report alongside persistence, not instead of it.

**3.3 Logistic regression.** Flat current-window features → attack/benign. Named explicitly in the problem statement. Report F1, precision, recall, FPR.

**3.4 Direct multi-horizon classifier.** Same LSTM backbone, same features, predicts P(attack within K) in one forward pass, no rollout. **Expect it to match or beat the rollout on lead time** — it never compounds error. If it does, the claim moves to what the rollout produces that it cannot: trajectory, surprise, counterfactuals. Prepare that framing in advance.

---

## 4 · Rollout

```python
def rollout(model, x_hist, K=20, n_samples=50, intervention_at=None):
    trajectories, curves = [], []
    for _ in range(n_samples):
        h = model.encode(x_hist)
        traj, curve = [], []
        for k in range(K):
            p = model.head_r(h)
            s = model.sample_next(h)
            if intervention_at is not None and k >= intervention_at:
                s = apply_intervention(s)
            curve.append(p); traj.append(s)
            h = model.step(h, s)
        trajectories.append(traj); curves.append(curve)
    return trajectories, curves
```

**Derived outputs:**

- `p_mean[k]` — mean attack probability at step k across samples
- `p_frac[k]` — **fraction of sampled futures that are attack-like at step k.** Prefer this as the headline probability; it is more interpretable than an averaged sigmoid.
- `spread[k]` — standard deviation across samples = model uncertainty
- `divergence` — how much the 50 futures disagree, aggregated over the horizon. A machine at a decision point has high divergence. Report its standalone AUC as a detector.

---

## 5 · Derived signals

### 5.1 Lead time

`lead_time = (first window index where alert fires) − (first true attack window index)`, in windows. Positive = early warning.

**Never report a single number.** The threshold determines it. Report as a curve against false-alarm rate (§6.1).

### 5.2 Surprise

```
surprise_t = -log p(s_t_actual | model prediction from s_{t-1})
```

Using the MDN likelihood directly, which is more principled than an L2 distance. Standardise per host over a rolling baseline. Report AUC as an independent detector — this is the channel that catches unseen attack classes.

### 5.3 Counterfactual

Roll out three times from the same history (the contract fixes these keys: `do_nothing`, `isolate_host`, `rate_limit`):
- **Do nothing** — standard.
- **Isolate at step 1** — `intervention = 1` from step 1, and `apply_intervention` forces `n_distinct_dst_ip`, `n_distinct_dst_port`, `bytes_out`, `external_ratio` toward their per-host minima.
- **Rate-limit at step 1** — `intervention = 1`, milder clamp on `n_flows` and `bytes_out` (halfway to the per-host floor).

Report all curves. **State the caveat in the doc, the demo, and the pitch:** the model has never seen real intervention data, so this is a structured what-if grounded in learned dynamics, not a validated causal estimate. `apply_intervention` currently clamps toward per-host minima observed in the 20-window history; tuning it against held-out post-isolation behaviour is still open.

---

## 6 · Evaluation

Built in Week 1 on synthetic toy sequences with a known answer, **before any real training**. A wrong harness invalidates every number produced afterwards.

### 6.1 Lead time vs false-alarm rate — headline

Sweep the alert threshold. Plot lead time (y) against per-host false-alarm rate (x). Plot HORIZON, the direct classifier, and logistic regression on the same axes. A single lead-time figure at a chosen threshold is gameable, and every other team will report one.

### 6.2 Rollout error growth

MDN NLL and per-feature MSE at steps 1, 5, 10, 20. Exposes compounding error that an averaged metric hides completely.

### 6.3 Calibration

Reliability diagram over `p_frac`. Platt scaling as the default correction, isotonic if the miscalibration is not sigmoid-shaped.

### 6.4 Held-out attack class — the headline experiment

Remove one attack class **entirely** from training data (all windows containing it, and in this single-campaign dataset, every host that ever shows it). Train fully. Test whether the surprise signal (§5.2) flags it on held-out data.

Run for at least two different held-out classes — one high-volume (e.g. PortScan), one distinct in character (e.g. Bot / botnet C2). Report surprise AUC on the held-out class versus benign. The notebook does this when `RUN_HELDOUT_CLASS = True` and saves `model_heldout_<class>.pt`, which the backend loads for the surprise-overlay panel.

Scheduled first thing in Week 3 so there is time to react to the result. If it works, it is the headline. If not, report it as a negative result with numbers.

### 6.5 Held-out capture (weekday)

Train on four weekday sessions, test on the fifth (`HELDOUT_CAPTURE`, default `ids2017-friday`). Expect a macro-F1 drop. **The drop is the finding, not a failure.** Be precise about what shifts: same testbed and address ranges, different day and different attack tooling — a temporal and attack-mix shift, not a cross-network shift. Weaker than the held-out-campaign test the four-dataset plan would have given; still an honest generalisation measurement most submissions skip.

### 6.6 Standard metrics

Macro-F1, per-class F1 (never average away weak classes), precision, recall, FPR versus logistic regression. Report **per-class lead time** too, not just aggregate — a class that fires 8 windows early and one that fires 1 window early should not be blended into one number.

### 6.7 Splits

Primary: group by **(capture, host)** — every window from one host on one side. Also report time-based (train early, test late). Random split for reference only, flagged as inflated.

---

## 7 · Demo application (React + FastAPI)

Runs fully offline — the frontend ships the forecasts as static JSON, no external calls at inference (hard requirement in the problem statement). Full specification in `frontend.md`; the frozen output shapes in `api-contract.md`; the backend in `api-endpoints.md`.

- **`horizon-ui/`** — React + Vite. Five panels: forecast cone, counterfactual comparison, trajectory table, surprise timeline, response recommendation (templated command, Approve/Dismiss, logged, never executed). Plus a 3D kill-chain scene driven by the live forecast + counterfactual choice.
- **`horizon-api/`** — FastAPI. Serves the same shapes from the trained model. **stub** mode (no artifacts) serves the 3 demo hosts from the static bundle; **live** mode (drop `model.pt` + `scaler.json` + `states.parquet` into `artifacts/`) does a real rollout for any host in the dataset. Optional at the demo, but it is what lets a judge pick an arbitrary host.

The offline requirement is met by the static bundle alone; the backend never has to run on stage.

---

## 8 · Risks

| Risk | Mitigation |
| --- | --- |
| IPs/ports absent (wrong dataset variant) | Gate 0, Day 1. Confirm `GeneratedLabelledFlows`, not `MachineLearningCVE`. Branch decided immediately. |
| Single-campaign data weakens the domain-shift claim | Acknowledged in §6.5. Frame the held-out weekday honestly as temporal + attack-mix shift. Do not call it cross-network. |
| MDN training unstable / NaN | Clamp log-variances, logsumexp, gradient clipping. Discretised fallback (§2.2) if it fails twice. |
| LSTM fails to beat persistence | Hard gate mid-Week 2. Escalate rather than proceed. |
| Detection loss swamps dynamics loss | Log both separately; tune lambda. |
| Rollout collapses (lead time = 0) | Scheduled sampling + toy validation before real data. |
| Direct classifier beats the rollout | Expected. Framing prepared in §3.4. |
| Label noise (~7.5% documented) | Label smoothing; validate on held-out capture, not label self-consistency. |
| Colab/Kaggle session death | Notebook checkpoints `model.pt` every epoch to `artifacts/`. Chunked CSV reads, columns subset before load. |
| Frontend blocked waiting on ML | Frozen contract (`api-contract.md`); frontend + backend both built against mocks and done. |
| Counterfactual challenged as non-causal | Stated first, in the doc, the demo, and the pitch. |

---

## 9 · Deliverables

Source code and README · 2-page architecture document · 2-minute demo video · 5-slide technical presentation. All distilled from these documents, not copied wholesale.

## 10 · Repo map

| Path | What |
| --- | --- |
| `horizon-ui/` | React frontend. Static-JSON demo (`public/mock/`) + `VITE_API_BASE` switch to the live backend. |
| `horizon-api/` | FastAPI inference backend. `horizon_api/model.py` + `features.py` are the shared architecture/transform contract. |
| `notebooks/horizon_train.ipynb` | Trains the model, writes `states.parquet` / `scaler.json` / `model.pt` / `metrics.json` / `scenarios.json`. Runs on Kaggle or Colab. |
| `docs/api-contract.md` | Frozen model→frontend output shapes. |
| `docs/api-endpoints.md` | Backend HTTP surface + how the notebook output plugs in. |
