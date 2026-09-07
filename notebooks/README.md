# notebooks/

## `horizon_train.ipynb`

Trains the HORIZON world model and writes the artifact bundle the backend loads:

```
artifacts/
  states.parquet    required   host-window feature table
  scaler.json       required   feature transforms
  model.pt          required   trained model
  metrics.json      optional   eval numbers for /api/metrics
  scenarios.json    optional   demo-host ground truth
  model_heldout_<class>.pt   optional   held-out-class surprise overlay
```

Dataset: **CIC-IDS2017 GeneratedLabelledFlows** — `chethuhn/network-intrusion-dataset` on Kaggle.

---

### Prerequisite (do this once)

The notebook clones the GitHub repo to import `horizon_api` (so the model
definition used for training is the exact one the backend serves). **Push
`horizon-api/` to `https://github.com/haragam22/HORIZON` before running.**

If your repo URL differs, edit `REPO_URL` in the first config cell.

---

### Run in Kaggle

1. kaggle.com → **Create → New Notebook**.
2. **File → Import Notebook** → upload `horizon_train.ipynb` (or paste from GitHub).
3. Right sidebar → **Add Input** → search `chethuhn/network-intrusion-dataset` → **Add**.
   It mounts at `/kaggle/input/network-intrusion-dataset/`.
4. Right sidebar → **Settings → Accelerator → GPU T4** (optional; a `QUICK` run works on CPU).
5. **Run All**.
6. When it finishes: **Output** tab → download `artifacts/` (and `horizon_artifacts.zip`).

Kaggle notebooks have internet **off** by default — turn it **on**
(Settings → Internet) so the `git clone` works.

---

### Run in Colab

1. colab.research.google.com → **File → Upload notebook** → `horizon_train.ipynb`.
2. **Runtime → Change runtime type → T4 GPU** (optional).
3. **Runtime → Run all.**
4. First data cell prompts for `kaggle.json`
   (kaggle.com → your avatar → **Settings → API → Create New Token**). Upload it;
   the notebook downloads and unzips the dataset to `/content/data`.
5. The last cell zips `artifacts/` and triggers a browser download
   (`horizon_artifacts.zip`).

---

### Config knobs (first code cell)

| knob | default | notes |
| --- | --- | --- |
| `QUICK` | `False` | `True` samples 15% of flows — fast smoke run, weak model |
| `EPOCHS` | `15` | `40` for a real run |
| `HELDOUT_CAPTURE` | `ids2017-friday` | weekday held out of training for the domain-shift test |
| `LABEL_MIN_MALICIOUS` | `1` | malicious flows before a window counts as an attack window |
| `WARMUP_WINDOWS` | `5` | first N windows/host skipped when fitting the scaler |
| `RUN_HELDOUT_CLASS` | `False` | `True` adds a second full training run with one class removed |

---

### After it runs

Put the downloaded files into the backend and restart it:

```bash
cp artifacts/* horizon-api/artifacts/
cd horizon-api && uvicorn horizon_api.server:app --port 8000
curl -s localhost:8000/api/health   # "mode": "live"
```

Then the frontend (`horizon-ui`, with `VITE_API_BASE` set) shows real forecasts.
See `horizon-api/README.md` steps 2–4.

---

### What the notebook does

| cell group | step |
| --- | --- |
| config, env, data | detect Kaggle/Colab, locate the CSVs, clone the repo |
| Gate 0 | verify Source/Dest IP, Dest Port, Timestamp, Label are present |
| aggregation | raw flows → 10-feature host-window rows → `states.parquet` |
| transforms | fit `FeatureScaler` on the train split only → `scaler.json` |
| sequences | `(20-window history, next state, attack-within-20)` examples, grouped by `(capture, host)` |
| MDN sanity | check the mixture head separates a bimodal toy target before real training |
| train | joint MDN-NLL + BCE, scheduled sampling, per-epoch checkpoint |
| persistence gate | model must beat `s_hat_{t+1} = s_t` per feature |
| rollout + metrics | 50-sample rollout on demo hosts, `metrics.json`, `scenarios.json` |
| held-out class | (optional) retrain with one attack class removed |
| package | zip `artifacts/` for download |
