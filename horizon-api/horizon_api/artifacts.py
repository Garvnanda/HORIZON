"""Locate and lazily load the trained artifacts.

Drop these into artifacts/ (or set HORIZON_ARTIFACTS_DIR):
  model.pt        - HorizonModel state_dict + config (horizon_api.model.save)
  scaler.json     - fitted horizon_api.features.FeatureScaler (FeatureScaler.save)
  states.parquet  - [capture, host, window_idx, ts, <10 features>, is_empty, label]
  metrics.json    - optional; real eval numbers for /api/metrics
  scenarios.json  - optional; demo ground-truth overrides (see stub.DEMO_SCENARIOS)

All three of model/scaler/states present -> mode "live". Otherwise "stub".
"""
from __future__ import annotations

import functools
import json
import os
from pathlib import Path

_DEFAULT_DIR = Path(__file__).resolve().parent.parent / "artifacts"


def artifacts_dir() -> Path:
    return Path(os.environ.get("HORIZON_ARTIFACTS_DIR", _DEFAULT_DIR))


def _path(name: str) -> Path:
    return artifacts_dir() / name


def has_live_artifacts() -> bool:
    return all(_path(n).exists() for n in ("model.pt", "scaler.json", "states.parquet"))


def mode() -> str:
    return "live" if has_live_artifacts() else "stub"


@functools.lru_cache(maxsize=1)
def _load_bundle(dir_key: str):
    import pandas as pd

    from .features import FeatureScaler
    from .model import load as load_model

    model = load_model(_path("model.pt"))
    scaler = FeatureScaler.load(_path("scaler.json"))
    states = pd.read_parquet(_path("states.parquet"))
    states["host"] = states["host"].astype(str)
    states["capture"] = states["capture"].astype(str)
    return model, scaler, states


def load_bundle():
    """(model, scaler, states_df). Cached; raises if not in live mode."""
    if not has_live_artifacts():
        raise RuntimeError("live artifacts not present; backend is in stub mode")
    return _load_bundle(str(artifacts_dir()))


def load_metrics() -> dict | None:
    p = _path("metrics.json")
    if not p.exists():
        return None
    return json.loads(p.read_text())


def load_json(name: str) -> dict | None:
    """Read an arbitrary artifact JSON file (network_*.json, flows_*.json, ...)."""
    p = _path(name)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def load_scenarios() -> dict | None:
    p = _path("scenarios.json")
    if not p.exists():
        return None
    return json.loads(p.read_text())


def reset_cache() -> None:
    _load_bundle.cache_clear()
