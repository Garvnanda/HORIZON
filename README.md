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

## Run locally

### Option A — offline demo, no backend

```bash
cd horizon-ui
npm install
npm run dev                    # opens on http://localhost:5173 (or next free port)
# or: npm run build            # -> dist/, a self-contained offline site
```

Serves the mock bundle in `public/mock/` (4 scripted hosts). Regenerate with
`python gen_mock.py`. This is the build to deploy to Vercel/Pages for a
zero-dependency demo.

### Option B — live model, two terminals

**Terminal 1 — backend** (needs `model.pt` + `scaler.json` + `states.parquet` in
`horizon-api/artifacts/`; also loads `metrics.json`, `scenarios.json`, `platt.json`,
`network_*.json`, `flows_*.json` if present):

```bash
cd horizon-api
pip install -r requirements.txt
python -m uvicorn horizon_api.server:app --port 8000
```

Check it: open `http://localhost:8000/api/health` — `"mode":"live"` means the
artifacts loaded (`"mode":"stub"` = artifacts missing, only the 4 demo hosts,
everything else returns `503`). First `/api/forecast` after startup takes ~3-5 s
while torch loads the model, fast after.

No Kaggle run? Generate synthetic artifacts so live mode + tests work:
`python fixtures/make_fixtures.py` then `python -m pytest -q`.

**Terminal 2 — frontend**, pointed at the backend via `horizon-ui/.env.local`:

```bash
cd horizon-ui
npm install
# create horizon-ui/.env.local with exactly this line, UTF-8, no BOM:
#   VITE_API_BASE=http://localhost:8000/api
npm run dev
```

The host dropdown now lists every `(capture, host)` in the dataset — see
`docs/available-hosts.md` for the full list. Delete `.env.local` to fall back to
the offline mock bundle.

> **Windows / PowerShell:** `echo "..." > .env.local` writes UTF-16 and Vite will
> silently ignore it (you get the 4-host mock instead). Use:
> `[IO.File]::WriteAllText("$PWD\.env.local", "VITE_API_BASE=http://localhost:8000/api`n")`
> or create the file in an editor set to UTF-8.

Vite picks any free port; the backend's CORS default allows any `localhost:*`, so
a port other than 5173 is fine.

**Public demo (Vercel + Cloudflare tunnel).** Frontend: `npm run build` and deploy
`horizon-ui/dist/` to Vercel (set `VITE_API_BASE` there, or use the `?api=` link
below). Backend: run it locally and expose with `cloudflared tunnel --url
http://localhost:8000`, started with the tunnel-origins flag:

```bash
HORIZON_ALLOW_TUNNEL_ORIGINS=1 python -m uvicorn horizon_api.server:app --port 8000
```

That opts the CORS allowlist into `*.vercel.app` and `*.trycloudflare.com` for the
demo. For a stable deployment, leave that flag off and pin the exact hostname:
`HORIZON_CORS_ORIGINS=https://<your-app>.vercel.app`.

A deployed frontend can be pointed at a fresh quick-tunnel URL without a rebuild:
open `https://<app>.vercel.app/?api=https://xxxx.trycloudflare.com/api` once
(persisted in localStorage). The `?api=` value is only accepted for `localhost` or
`https://*.trycloudflare.com` hosts.

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
