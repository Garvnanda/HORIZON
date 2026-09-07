# technical.md — HORIZON technical specification

SIH 2026 · PS 26153. Dataset: `cic-collection.parquet` (Kaggle, 1.03 GB). Compute: Colab free. Team: 3.

This is the reference spec. `implementation.md` says who builds what and when. `pitch.md` explains why.

---

## 0 · Gate 0 — column verification

**Nothing else starts until this passes.** Our state design requires source IP, destination IP, destination port, and timestamp. Some "cleaned" CIC collections deliberately drop IPs and ports because they leak — a model can memorise the attacker's address instead of learning behaviour.

```python
import pandas as pd
df = pd.read_parquet('cic-collection.parquet')
print(len(df))
print(df.columns.tolist())
print(df.dtypes)
print(df.head(3).T)
print(df.iloc[:, -1].value_counts())
```

Look for columns resembling: `Src IP`/`Source IP`, `Dst IP`, `Dst Port`, `Timestamp`/`Flow Start`, and a `Dataset`/`Source` column identifying which of the four campaigns each row came from.

| Outcome | Action |
| --- | --- |
| **A** — IPs + timestamp present | Proceed as written. |
| **B** — timestamp present, IPs absent | **Global-window fallback:** one state row per 60s window over the whole capture, aggregating all flows. Features 2, 3, 4, 10 become network-wide counts. Mechanism unchanged; alerts point at a time rather than a machine. Everything downstream works with `host` replaced by `capture`. |
| **C** — no usable timestamp | Abandon this file. Pull raw CSE-CIC-IDS2018 CSVs from CIC's distribution page, which retain IPs and timestamps. Costs ~2 days. |

**Capture boundaries.** Four campaigns are collated here; timestamps may interleave or restart. If no campaign identifier column exists, derive one from large timestamp gaps. Every grouping downstream is by **(capture, host)** — never host alone. Grouping across a boundary stitches two unrelated machines into one sequence, produces excellent-looking numbers, and collapses under one question in Q&A.

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

**Transforms are mandatory.** Counts and byte totals span orders of magnitude with heavy tails. Untransformed, the reconstruction loss is dominated entirely by `bytes_in` and the model learns nothing else. Fit the scaler on the **train split only**; persist it (`joblib`) and apply the same one everywhere.

**Empty windows.** A host with no flows still gets a row — zeros post-transform, plus an `is_empty` flag. Silence is signal; skipping the window shifts the timeline and corrupts every lead-time measurement.

**Host selection.** Internal (RFC1918) source addresses only. External IPs are peers, not modelled subjects. Drop hosts with fewer than 40 total windows.

**`new_peer_rate` implementation note.** Maintain a per-host set of previously-seen destination IPs, updated window by window in chronological order. It is a running state, not a groupby. Reset per (capture, host).

### 1.3 Window labels

A window carries the attack class if **any** flow in it is so labelled; otherwise `benign`. Keep the fine-grained class name, not just binary — needed for per-class metrics and the held-out-class experiment.

### 1.4 Output artifact

`states.parquet` — columns `[capture, host, window_idx, ts, f1..f10, is_empty, label]`, sorted by `(capture, host, window_idx)`.

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
checkpoint     every epoch to Google Drive (Colab sessions die)
```

---

## 3 · Baselines

Build all three. Each answers a different question.

**3.1 Persistence — `ŝ_{t+1} = s_t`.** The dynamics baseline. Report per-feature MSE. **If the LSTM does not beat this per-feature, the model learned nothing and the premise is wrong.** Hard gate, Week 2. Build it before the LSTM.

**3.2 Class-conditional mean.** Predict the mean next state per attack class. Second sanity floor.

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

Roll out twice from the same history:
- **Do nothing** — standard.
- **Isolate at step 1** — `intervention = 1` from step 1, and `apply_intervention` forces `n_distinct_dst_ip`, `n_distinct_dst_port`, `bytes_out`, `external_ratio` toward their per-host minima.

Report both probability curves. **State the caveat in the doc, the demo, and the pitch:** the model has never seen real intervention data, so this is a structured what-if grounded in learned dynamics, not a validated causal estimate.

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

Remove one attack class **entirely** from training data (all windows containing it). Train fully. Test whether the surprise signal (§5.2) flags it on held-out data.

Run for at least two different held-out classes — one high-volume (e.g. port scan), one distinct in character (e.g. botnet C2). Report surprise AUC on the held-out class versus benign.

Scheduled first thing in Week 3 so there is time to react to the result. If it works, it is the headline. If not, report it as a negative result with numbers.

### 6.5 Held-out capture

Train on three campaigns, test on the fourth. Expect 15–30 point macro-F1 drop. **The drop is the finding, not a failure** — it is an honest domain-shift measurement most papers avoid reporting.

### 6.6 Standard metrics

Macro-F1, per-class F1 (never average away weak classes), precision, recall, FPR versus logistic regression.

### 6.7 Splits

Primary: group by **(capture, host)** — every window from one host on one side. Also report time-based (train early, test late). Random split for reference only, flagged as inflated.

---

## 7 · Demo application (Streamlit)

Runs fully offline — weights loaded from disk, no external calls at inference (hard requirement in the problem statement). See `frontend.md` for the full specification.

Five panels: forecast cone with probability curve; counterfactual comparison; trajectory table (predicted rows versus actual); surprise timeline; response recommendation (templated command, Approve/Dismiss, logged, never executed).

---

## 8 · Risks

| Risk | Mitigation |
| --- | --- |
| IPs/ports absent from parquet | Gate 0, Day 1. Branch decided immediately, not discovered in Week 2. |
| MDN training unstable / NaN | Clamp log-variances, logsumexp, gradient clipping. Discretised fallback (§2.2) if it fails twice. |
| LSTM fails to beat persistence | Hard gate mid-Week 2. Escalate rather than proceed. |
| Detection loss swamps dynamics loss | Log both separately; tune lambda. |
| Rollout collapses (lead time = 0) | Scheduled sampling + toy validation before real data. |
| Direct classifier beats the rollout | Expected. Framing prepared in §3.4. |
| Label noise (~7.5% documented) | Label smoothing; validate on held-out capture, not label self-consistency. |
| Colab session death | Checkpoint every epoch to Drive. Subset columns before loading. |
| Frontend blocked waiting on ML | Frozen JSON contract in Week 1 (see `implementation.md`). |
| Counterfactual challenged as non-causal | Stated first, in the doc, the demo, and the pitch. |

---

## 9 · Deliverables

Source code and README · 2-page architecture document · 2-minute demo video · 5-slide technical presentation. All distilled from these documents, not copied wholesale.
