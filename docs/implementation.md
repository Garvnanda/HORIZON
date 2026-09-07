# implementation.md — HORIZON build plan

3 people, 4 weeks, Colab free.

- **P1 — Frontend.** Streamlit application, all panels, demo flow, visual design. Does not touch model code.
- **P2 — Data & evaluation.** Pipeline from parquet to `states.parquet`, splits, all metrics, all baselines.
- **P3 — Model.** LSTM, mixture density head, readout head, scheduled sampling, rollout.

P2 and P3 pair on the ML side; P1 works independently against a frozen data contract.

---

## The contract — freeze this on Day 2

P1 cannot wait until Week 3 for real model output. That path ends in a rushed demo, and the demo is what judges see. So P2 and P3 define the output format on Day 2, P2 writes a mock generator, and **P1 builds the entire frontend against mock data.** Swapping in real outputs in Week 3 is then a one-line change.

`forecast.json`:

```json
{
  "host": "192.168.10.15",
  "capture": "ids2018",
  "window_start_ts": "2018-02-15T10:23:00Z",
  "window_seconds": 60,
  "history": [{"window_idx": 0, "features": {"n_flows": 12.0, "n_distinct_dst_ip": 3.0, "n_distinct_dst_port": 4.0, "new_peer_rate": 0.0, "fail_ratio": 0.02, "bytes_out": 4200.0, "bytes_in": 88000.0, "io_ratio": 0.05, "mean_duration": 1.8, "external_ratio": 0.9}, "label": "benign", "surprise": 0.4}],
  "forecast": {
    "horizon": 20,
    "n_samples": 50,
    "p_frac":  [0.02, 0.03, 0.07, 0.15, 0.31, 0.58, 0.74, 0.81],
    "p_mean":  [0.03, 0.04, 0.08, 0.16, 0.29, 0.55, 0.71, 0.79],
    "spread":  [0.01, 0.02, 0.05, 0.11, 0.18, 0.22, 0.19, 0.15],
    "divergence": 0.42,
    "samples": [[0.01, 0.02, 0.04, 0.09, 0.22, 0.61, 0.88, 0.94]],
    "trajectory_mean": [{"step": 1, "features": {"n_flows": 14.0, "n_distinct_dst_ip": 4.0, "n_distinct_dst_port": 5.0, "new_peer_rate": 0.05, "fail_ratio": 0.03, "bytes_out": 4500.0, "bytes_in": 91000.0, "io_ratio": 0.05, "mean_duration": 1.7, "external_ratio": 0.88}}]
  },
  "counterfactual": {
    "action": "isolate_host",
    "applied_at_step": 1,
    "p_frac": [0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.03, 0.03]
  },
  "alert": {
    "fired": true,
    "fired_at_step": 5,
    "threshold": 0.30,
    "tier": "elevated",
    "lead_time_windows": 6,
    "recommended_command": "iptables -A FORWARD -s 192.168.10.15 -j DROP"
  },
  "ground_truth": {"attack_class": "Infiltration", "first_attack_window": 11}
}
```

**Rules.** `samples` is truncated to 50 rows of length `horizon`. `history` is 20 entries. All features are in **original units, not standardised** — the frontend shows human-readable numbers. `ground_truth` is present in demo mode only. Any change to this schema after Day 2 requires all three to agree.

---

## Week 1 — Foundations

Nobody trains a model this week. Week 1 exists so that Weeks 2–4 are not built on sand.

### P2 — Data & evaluation

**Day 1: Gate 0.** Run the column check (`technical.md` §0). Report the branch (A/B/C) to the team the same day. Everything else depends on it.

Then:
- Derive capture boundaries; verify no timestamp interleaving across campaigns.
- Build the host-window aggregator. Chunked — do not load 1 GB and groupby naively on free Colab. Subset to needed columns first.
- Implement `new_peer_rate` as a running per-host set in chronological order.
- Produce `states.parquet` v1 on one campaign to validate shape and sanity.
- **Build the metrics harness on synthetic toy sequences with a known answer.** A sequence where an "attack" starts at a known step and the correct lead time is arithmetically derivable. This is the gate for everything P3 produces — if the harness is wrong, every number afterwards is wrong.
- Build the persistence baseline (`ŝ_{t+1} = s_t`), per-feature MSE.

**Deliverables:** branch decision, `states.parquet` v1, `metrics.py` validated on toy data, persistence baseline.

### P3 — Model

- Read the parquet schema alongside P2; co-author the JSON contract.
- LSTM encoder skeleton in PyTorch. Train it on the **toy sequences** — not real data — to verify the sequence plumbing, padding, and masking are correct.
- Implement the MDN head and its loss on toy data. Verify it can fit a deliberately bimodal toy distribution: generate data where the next value is `+1` 60% of the time and `-1` 40% of the time, and check that two mixture components separate. **If it cannot do this, it will not work on real data.**
- Implement the sampling function and a bare rollout loop on toy data.

**Deliverables:** LSTM + MDN training end to end on toy data, bimodal fit demonstrated, rollout loop runs.

### P1 — Frontend

- REACT skeleton, page layout, navigation.
- Co-author the JSON contract; then build a **mock generator** producing realistic `forecast.json` files (P2 can help, but P1 owns it — you need mocks you can bend to test edge cases).
- Build the **forecast cone panel**: 50 sample lines translucent, median bold, threshold line, alert marker. This is the centrepiece; build it first.
- Design decisions locked: colours, typography, layout (`frontend.md`).

**Deliverables:** react based website running with mock data, forecast cone rendering.

### Gate 1 — end of Week 1

Column branch decided · toy-data harness validated · MDN fits a bimodal toy distribution · forecast cone renders from mock JSON. **Do not enter Week 2 without all four.**

---

## Week 2 — First real model

### P2

- Full `states.parquet` across all four campaigns, transforms and scaler fitted on train split only, persisted.
- Split logic: group by (capture, host), plus time-based, plus random-for-reference.
- Label assignment and per-class counts. Report the class balance to P3 — it sets `pos_weight`.
- Logistic regression baseline; full metric suite on it.
- **Run persistence versus P3's first checkpoints, per feature.** This is the Week 2 gate.
- Build the direct multi-horizon classifier baseline (same backbone as P3's, no rollout) — P3 supplies the model class, P2 trains and evaluates it.

### P3

- Train the dynamics model on real data. Log MDN NLL and BCE **separately** every epoch.
- **Mid-week gate: does the LSTM beat persistence per-feature?** If not, stop and report. Do not tune your way past this — investigate. Likely causes: transforms not applied, scaler leaking across splits, sequences not actually contiguous, learning rate too high.
- Add the readout head; joint training; tune lambda so neither loss swamps the other.
- Implement scheduled sampling with the linear ramp.
- Checkpoint to Drive every epoch.

### P1

- Trajectory table panel: predicted feature rows for steps 1–5 beside actuals, diverging cells highlighted.
- Surprise timeline panel.
- Host selector and time scrubber.
- Wire real metric outputs from P2 as they appear, still falling back to mocks.

### Gate 2 — mid Week 2

**LSTM beats persistence on per-feature reconstruction error.** If it does not, the project premise is wrong and we need to know now, not in Week 4. Escalate, investigate, decide.

---

## Week 3 — The differentiators

This is the week that decides how good the submission is. Order matters.

### P3

**Day 1 priority — the held-out-class experiment.** Retrain from scratch with one attack class removed entirely, then measure whether the surprise signal still flags it. Run for two held-out classes. This is scheduled first because it is our potential headline and we need time to react to whatever it produces. If it works, everything downstream is framed around it. If it does not, we report it honestly and move on.

Then:
- Full K-step sampled rollout, 50 samples, producing `p_frac`, `p_mean`, `spread`, `divergence`.
- Counterfactual branch: `intervention` channel, `apply_intervention` function, dual rollout.
- Emit real `forecast.json` files matching the contract.

### P2

- Held-out-capture split; train and evaluate.
- Lead-time-vs-FPR curve for HORIZON, direct classifier, and logistic regression on shared axes.
- Rollout error growth at steps 1/5/10/20.
- Calibration: reliability diagram, Platt scaling.
- Surprise AUC as a standalone detector, and on the held-out classes.
- Divergence AUC.

### P1

- **Counterfactual panel** — two curves, action selector. Highest-value screen in the demo; build it as soon as P3 emits counterfactual data, and against mocks before that.
- Response recommendation panel: tier, filled command, Approve/Dismiss, decision log. Never executes.
- Swap mocks for real `forecast.json`.
- Full demo walkthrough scripted and rehearsed end to end.

### Gate 3 — end of Week 3

Counterfactual panel renders from real data · held-out-class result exists (positive or negative) · lead-time curve plotted. **The counterfactual panel must not slip to Week 4** — if it does, it will not ship, and it is the differentiator.

---

## Week 4 — Freeze and package

### P3
Freeze weights. Final per-class results. Ablation if time: rollout with sampling versus mean-only, showing the mixture head earns its place.

### P2
Freeze all metrics. Assemble the results table. Document every limitation honestly.

### P1
Polish the demo. **Record the 2-minute video** — script it around one host: history, forecast climbing, alert firing, then the counterfactual flattening. Not a feature tour.

### All three
2-page architecture document · 5-slide deck · README and repo cleanup · Q&A rehearsal against `pitch.md` Part 5.

---

## Cut list, in this order, if time runs short

1. Response recommendation panel — functional but unimpressive to judges
2. Calibration plots — appendix material
3. Random-split reference numbers
4. Second held-out class (keep one)
5. Time-based split (keep grouped)

**Never cut:** the counterfactual panel, the forecast cone, the lead-time-vs-FPR curve, the persistence baseline. Those four are the project.

---

## Working rules

- **Colab free dies.** Checkpoint every epoch to Drive. Never rely on a session surviving a training run.
- **P1 is never blocked.** If real data is late, mocks carry the frontend. Never let the demo be built in the final week.
- **Every number in the deck comes from P2's harness.** No metrics computed ad hoc in a notebook cell and pasted into a slide.
- **Gates are hard.** A gate that fails means stop and report, not tune quietly and hope.
