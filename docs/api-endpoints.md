# api-endpoints.md — HORIZON backend (`horizon-api/`)

FastAPI service that serves the frozen frontend contract (`api-contract.md`) from
the trained world model. Response shapes are defined in `api-contract.md` §3 — this
file documents the HTTP surface, the two run modes, and how the Kaggle output plugs in.

---

## Run

```bash
cd horizon-api
pip install -r requirements.txt
uvicorn horizon_api.server:app --port 8000 --reload
```

Point the frontend at it:

```bash
cd horizon-ui
echo 'VITE_API_BASE=http://localhost:8000/api' > .env.local
npm run dev
```

With `VITE_API_BASE` unset the frontend uses the static `public/mock/` bundle and
the backend is not involved at all.

---

## Modes

The backend picks a mode from what is in `horizon-api/artifacts/` (override with
`HORIZON_ARTIFACTS_DIR`).

| Mode | Trigger | Behaviour |
| --- | --- | --- |
| **live** | `model.pt` + `scaler.json` + `states.parquet` all present | Real rollout for any `(capture, host, t)` in `states.parquet`. |
| **stub** | any of the three missing | The 3 scripted demo hosts are served from `horizon-ui/public/mock/`; every other host returns `503`. |

`GET /api/health` reports the current mode.

### Dropping in the Kaggle output

The notebook (built last) writes:

| File | Produced by | Consumed by |
| --- | --- | --- |
| `model.pt` | `horizon_api.model.save(model, ...)` | `model.load` |
| `scaler.json` | `FeatureScaler.save(...)` | `FeatureScaler.load` |
| `states.parquet` | host-window aggregator | history slicing, host list, surprise |
| `metrics.json` | eval harness (P2) | `GET /api/metrics` (optional; falls back to mock) |
| `model_heldout_<class>.pt` | held-out-class experiment | `GET /api/surprise` overlay (optional) |
| `scenarios.json` | notebook (optional) | demo ground-truth overrides |
| `network_<capture>.json` | notebook topology cell | `GET /api/network` (optional; falls back to nodes-only) |
| `flows_<capture>_<host>.json` | notebook flow-sample cell | `GET /api/flows` (optional; demo hosts only) |

Copy them into `horizon-api/artifacts/` and restart uvicorn. No code change.

---

## Endpoints

All under `/api`. Query params are required unless noted.

### `GET /api/health`

Liveness + which mode. Not part of the frozen contract.

```json
{ "status": "ok", "mode": "live", "schema_version": "v4.0",
  "version": "0.1.0", "artifacts_dir": "…/horizon-api/artifacts" }
```

### `GET /api/hosts`

Host picker contents. Response: `api-contract.md` §3.1.

- **stub**: the 3 demo hosts.
- **live**: every `(capture, host)` in `states.parquet`. Demo hosts keep their
  scripted `scenario` / `true_class` / `available_t`; ad-hoc hosts get
  `scenario: "adhoc"`, `true_class: "unknown"`, `available_t` = three sample
  window indices, `peak_p_frac: 0.0` (unknown until a forecast is requested).

### `GET /api/forecast?host=&capture=&t=`

The forecast: cone, samples, trajectory, explain, MITRE, counterfactuals, alert
reference. Response: `api-contract.md` §3.2. `t >= 20` (enforced, `422` otherwise).

Pipeline (live): slice 20-window history → scale → encode → 3 rollouts
(`do_nothing` / `isolate_host` / `rate_limit`, 50 samples × 20 steps each) →
derive `p_frac`/`p_mean`/`spread`/`divergence` → attention + per-feature surprise
→ heuristic MITRE overlay → assemble.

`demo_mode: true` and `ground_truth` only for the 3 scripted hosts.

| Status | Cause |
| --- | --- |
| `422` | fewer than 20 contiguous windows ending at `t` |
| `503` | stub mode, non-demo host, or `t` not precomputed |

### `GET /api/surprise?host=&capture=`

Surprise timeline over the host's history. Response: `api-contract.md` §3.3.
Live: per-window MDN NLL of the actual next state, standardised per host over a
rolling baseline. `held_out_class` overlay is emitted only when
`artifacts/model_heldout_<class>.pt` exists.

### `GET /api/network?capture=`

Internal host-communication graph for the macro scene. Response: `api-contract.md` §3.7.

- **stub**: the scripted topology for that capture.
- **live**: `artifacts/network_<capture>.json` if present; otherwise a nodes-only
  fallback derived from `states.parquet` (`edges: []`, plus a `note`).

`503` for a non-demo capture in stub mode; `422` if the capture has no rows.

### `GET /api/flows?host=&capture=`

Sampled real flows for one host, for the micro (per-host) view. Response:
`api-contract.md` §3.8.

- **stub**: the scripted sample for a demo host.
- **live**: `artifacts/flows_<capture>_<host>.json`; `422` if not exported (the
  notebook writes it for demo hosts only).

### `GET /api/metrics`

Eval numbers. Response: `api-contract.md` §3.4. Returns `artifacts/metrics.json`
if present, else the mock bundle (`status: "MOCK"`).

### `POST /api/decision`

Log an Approve/Dismiss. **Never executes the command.** Appends one line to
`artifacts/decision_log.jsonl`.

```json
// request
{ "host": "192.168.10.15", "capture": "ids2017-thursday", "t": 40,
  "decision": "approve", "tier": "elevated", "command": "iptables …", "analyst": "demo" }
// response
{ "logged": true, "ts": "2026-09-07T09:10:00Z", "decision_log_size": 4 }
```

`decision` must be `approve` or `dismiss` (`422` otherwise).

> The frontend demo keeps its decision log in `localStorage` and does not call
> this endpoint. It exists for a live deployment audit trail.

### `GET /api/decision-log`

```json
{ "schema_version": "v4.0", "entries": [ { "ts": "…", "host": "…", "decision": "approve", … } ] }
```

Newest first.

---

## CORS

Allows `http://localhost:5173` and `http://127.0.0.1:5173` by default. Override
with `HORIZON_CORS_ORIGINS` (comma-separated).

---

## Tests

```bash
cd horizon-api
python fixtures/make_fixtures.py   # synthetic artifacts, once
python -m pytest -q
```

`fixtures/make_fixtures.py` writes a random-init model + synthetic `states.parquet`
so the full live path runs without Kaggle. Values are meaningless; only shapes are
checked. `tests/test_contract.py` asserts every forecast — stub or live — matches
`api-contract.md` §3.2.
