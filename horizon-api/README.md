# horizon-api

HORIZON inference backend. FastAPI service that serves the frozen frontend
contract (`../docs/api-contract.md`) from the trained world model.

Endpoint reference: **`../docs/api-endpoints.md`**.

---

## 1. Run the backend

```bash
cd horizon-api
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash; use .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

uvicorn horizon_api.server:app --port 8000
```

Check it:

```bash
python -c "import urllib.request, json; print(json.load(urllib.request.urlopen('http://localhost:8000/api/health')))"
```

`mode` in the response is `stub` until you add artifacts (step 2).

- **stub** — no model: only the 3 scripted demo hosts work, served from
  `../horizon-ui/public/mock/`. Every other host returns `503`.
- **live** — model present: real rollout for any host in `states.parquet`.

Add `--reload` while developing. Override CORS origins with
`HORIZON_CORS_ORIGINS="http://localhost:5173,..."` if the frontend runs elsewhere.

---

## 2. Add trained artifacts (stub -> live)

The Kaggle notebook produces these. Copy them into `horizon-api/artifacts/`:

| File | Required | Produced by | Used for |
| --- | --- | --- | --- |
| `model.pt` | yes | `horizon_api.model.save(model, path)` | the model |
| `scaler.json` | yes | `FeatureScaler.save(path)` | feature transforms |
| `states.parquet` | yes | host-window aggregator | history, host list, surprise |
| `metrics.json` | no | eval harness | `GET /api/metrics` (else falls back to mock) |
| `model_heldout_<class>.pt` | no | held-out-class experiment | `GET /api/surprise` overlay |
| `scenarios.json` | no | notebook | demo ground-truth overrides |

```bash
cp ~/Downloads/model.pt ~/Downloads/scaler.json ~/Downloads/states.parquet horizon-api/artifacts/
```

`artifacts/` is git-ignored. Files can live elsewhere:
`HORIZON_ARTIFACTS_DIR=/path/to/dir uvicorn horizon_api.server:app --port 8000`.

---

## 3. Rerun after new artifacts

The backend caches the loaded bundle in memory. After replacing any file in
`artifacts/`, restart the server:

```bash
# Ctrl-C the running uvicorn, then:
uvicorn horizon_api.server:app --port 8000
```

With `--reload` a restart still is not triggered by artifact changes (only by
`.py` edits) — restart manually. Confirm the swap took:

```bash
python -c "import urllib.request, json; print(json.load(urllib.request.urlopen('http://localhost:8000/api/health'))['mode'])"
# -> live
```

No frontend change is needed when artifacts change.

---

## 4. Run the frontend against it

```bash
cd horizon-ui
echo 'VITE_API_BASE=http://localhost:8000/api' > .env.local
npm install        # first time only
npm run dev        # http://localhost:5173
```

- `VITE_API_BASE` **set**   -> frontend calls the live backend.
- `VITE_API_BASE` **unset** (delete `.env.local`) -> frontend uses the static
  `public/mock/` bundle, backend not involved.

Restart `npm run dev` after changing `.env.local`.

---

## Tests

```bash
cd horizon-api
python fixtures/make_fixtures.py    # once: synthetic model + parquet (git-ignored)
python -m pytest -q
```

`fixtures/make_fixtures.py` writes a random-init model so the full live path runs
without Kaggle. Values are meaningless; the tests check output shape against
`../docs/api-contract.md` §3.2 only.

---

## Layout

```
horizon_api/
  model.py      LSTM enc + attention pool + MDN(5) + BCE readout   (the notebook imports this)
  features.py   FeatureScaler (log1p + standardise) + history slicing  (the notebook imports this)
  rollout.py    sampled autoregressive rollout + isolate/rate_limit interventions
  predict.py    forecast() / hosts_doc() / surprise_doc()  -> contract dicts
  surprise.py   per-window MDN NLL timeline
  mitre.py      heuristic attack class -> ATT&CK stage overlay
  artifacts.py  locate + lazy-load the bundle, mode detection
  stub.py       no-artifacts fallback
  server.py     FastAPI app
fixtures/       synthetic artifacts for tests (git-ignored)
artifacts/      real artifacts land here (git-ignored)
```

`model.py` and `features.py` are the shared contract with training — the Kaggle
notebook imports `HorizonModel` and `FeatureScaler`, so architecture and
transforms cannot drift between training and serving.
