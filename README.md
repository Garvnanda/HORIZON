# HORIZON

**World-model predictive cyber defence from network traffic.**

SIH 2026 · Problem Statement 26153 · NTRO · Blockchain & Cybersecurity

Intrusion detectors answer one question: *is this traffic malicious?* By the time
they answer yes, the attacker is inside. HORIZON learns how each machine on a
network behaves over time, rolls that behaviour forward 50 times to imagine the
next 20 minutes, and scores the imagined futures for danger. It alerts on the
**forecast**, not the observation.

Three things a classifier cannot produce, all of which fall out of a model that
simulates forward:

- a **probability curve** over the next 20 minutes, with measurable warning time
- **surprise** — divergence from the forecast flags attacks absent from training
- a **counterfactual** — roll out "isolate this host now" vs "do nothing", side by side

---

## Repository

| Path | What | Language |
| --- | --- | --- |
| **`horizon-ui/`** | React + Vite dashboard. Forecast cone, counterfactual, trajectory table, surprise timeline, MITRE overlay, response panel, and a real host-communication scene. Ships fully offline as static JSON. | TypeScript |
| **`horizon-api/`** | FastAPI inference backend. Serves the frozen contract from the trained model. Runs in **stub** mode (no artifacts, 4 scripted demo hosts) or **live** mode (real rollout for any host). | Python |
| **`notebooks/horizon_train.ipynb`** | Trains the model on Kaggle/Colab. Writes `model.pt`, `scaler.json`, `states.parquet`, `metrics.json`, `scenarios.json`, `platt.json`, `network_*.json`, `flows_*.json`. | Python |
| **`docs/`** | `HORIZON_Dev_Doc_v4.md` (research doc), `technical.md` (spec), `implementation.md` (build plan), `idea.md`, `pitch.md`, `frontend.md`, `api-contract.md` (frozen model↔frontend shapes), `api-endpoints.md` (backend surface), `dashboard-guide.md` (judge-presenting notes). |

---

## The model

LSTM encoder (128, 2 layers) → attention pooling over the 20-window history →
**mixture density network** dynamics head (5 components, predicts a *distribution*
over the next state) + BCE readout head. Trained on next-state likelihood, no
labels in the dynamics objective. 50-sample autoregressive rollout, K = 20.
Scheduled sampling. Platt-calibrated readout.

`horizon-api/horizon_api/model.py` and `features.py` are the shared contract: the
notebook imports them, so training and serving cannot drift.

**State** — one 10-feature vector per internal host per 60-second window
(`n_flows`, `n_distinct_dst_ip`, `n_distinct_dst_port`, `new_peer_rate`,
`fail_ratio`, `bytes_out`, `bytes_in`, `io_ratio`, `mean_duration`,
`external_ratio`), sequences of 20 windows.

**Data** — CIC-IDS2017 GeneratedLabelledFlows (Kaggle `pshikk/cicids2017-untampered`),
5 weekday capture sessions. Held-out weekday for the domain-shift test.

---

## Run

### Frontend (offline demo — no backend needed)

```bash
cd horizon-ui
npm install
npm run dev            # http://localhost:5173
# or: npm run build    # -> dist/, a self-contained offline site
```

Serves the mock bundle in `public/mock/`. Regenerate it with `python gen_mock.py`.

### Backend

```bash
cd horizon-api
pip install -r requirements.txt
python fixtures/make_fixtures.py    # synthetic artifacts, so tests + live mode run without Kaggle
python -m pytest -q
uvicorn horizon_api.server:app --port 8000
```

- **stub mode** (default) — the 4 demo hosts from the mock bundle, everything else `503`.
- **live mode** — drop `model.pt` + `scaler.json` + `states.parquet` into
  `horizon-api/artifacts/`, restart. Real rollout for any host in the dataset.
  `GET /api/health` reports the mode.

### Point the frontend at the live backend

```bash
cd horizon-ui
echo 'VITE_API_BASE=http://localhost:8000/api' > .env.local
npm run dev
```

Delete `.env.local` to go back to the offline mock bundle.

### Train

`notebooks/horizon_train.ipynb` on Kaggle or Colab. Full instructions in
`notebooks/README.md`. Push this repo first — the notebook clones it to import
`horizon_api`. Download `artifacts/`, drop it into `horizon-api/artifacts/`.

---

## Demo scenarios

| Host | Story | What it shows |
| --- | --- | --- |
| `friday/172.16.0.1` | port scan escalating to DDoS | **the forecast with real lead time** — the model catches the escalation climbing before it peaks |
| `thursday/192.168.10.8` | infiltration victim | calibrated onset detection + predicted trajectory + counterfactual |
| `friday/192.168.10.15` | botnet beacon | surprise catches it; held-out-class overlay |
| `monday/192.168.10.9` | quiet host | does not cry wolf |

---

## Status

| Piece | State |
| --- | --- |
| Frontend | done — offline demo builds and runs |
| Backend | done — stub + live, 7 endpoints, tests pass |
| Notebook | done — trained twice on real data; persistence gate 10/10, calibration honest, surprise works |
| Lead time | present on multi-stage campaigns (scan → DDoS); payload-drop attacks are detected at onset (no behavioural precursor in the data — stated honestly) |
| Evaluation harness | **open** — `metrics.json` is still MOCK; lead-time-vs-FPR curve, baselines, per-class numbers not yet built |
| Held-out-class experiment | **open** — one training run away |
| PCAP/CSV upload endpoint | **open** — the problem statement asks for file input |
| Packaging (2-page doc, deck, video) | **open** |

See `docs/implementation.md` "What is left" for the itemised list.

---

## Offline guarantee

The demo runs with zero network calls at inference — forecasts are shipped as
static JSON. The backend is optional and never has to run on stage.
