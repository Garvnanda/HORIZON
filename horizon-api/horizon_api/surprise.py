"""Live surprise timeline: per-window NLL of the actual next state under the model
(technical.md 5.2). Standardised per host over a rolling baseline.
"""
from __future__ import annotations

import numpy as np
import torch

from . import HISTORY, SCHEMA_VERSION
from . import artifacts as _art
from . import stub as _stub
from .features import FeatureScaler
from .model import HorizonModel

_ROLL = 20  # rolling-baseline window for per-host standardisation


@torch.no_grad()
def series(model: HorizonModel, scaler: FeatureScaler, states, capture: str, host: str,
          max_windows: int = 130) -> dict:
    from . import FEATURE_KEYS

    g = states[(states["capture"] == capture) & (states["host"] == host)].sort_values("window_idx")
    if g.empty:
        raise ValueError(f"no rows for {capture}/{host}")

    raw = g[FEATURE_KEYS].to_numpy(dtype=np.float64)
    z = scaler.transform(raw)
    widx = g["window_idx"].to_numpy()
    labels = g["label"].astype(str).to_numpy()
    n = min(len(g), max_windows)

    dev = next(model.parameters()).device
    raw_nll: list[float | None] = []
    for i in range(n):
        if i < HISTORY:
            raw_nll.append(None)
            continue
        hist = z[i - HISTORY : i]
        x = np.concatenate([hist, np.zeros((HISTORY, 1))], axis=1)
        x = torch.tensor(x, dtype=torch.float32, device=dev).unsqueeze(0)
        state, *_ = model.encode(x)
        target = torch.tensor(z[i], dtype=torch.float32, device=dev).unsqueeze(0)
        raw_nll.append(float(model.mdn.nll(state, target)))

    vals = np.array([v for v in raw_nll if v is not None], dtype=np.float64)
    base_mean = vals[:_ROLL].mean() if len(vals) >= _ROLL else (vals.mean() if len(vals) else 0.0)
    base_std = vals[:_ROLL].std() if len(vals) >= _ROLL else (vals.std() if len(vals) else 1.0)
    base_std = base_std if base_std > 1e-6 else 1.0

    out = []
    for i in range(n):
        s = raw_nll[i]
        std_s = 0.0 if s is None else (s - base_mean) / base_std
        out.append({
            "window_idx": int(widx[i]),
            "surprise": round(float(max(0.0, std_s)), 3),
            "label": labels[i],
        })
    return out


def doc(capture: str, host: str) -> dict:
    """api-contract 3.3. Stub mode -> scripted bundle. Live mode -> real series.

    The held_out_class overlay needs a separately trained model (one attack class
    removed); it is emitted only when artifacts/model_heldout_<class>.pt exists.
    """
    if _art.mode() == "stub":
        return _stub.surprise(capture, host)

    model, scaler, states = _art.load_bundle()
    s = series(model, scaler, states, capture, host)
    result = {
        "schema_version": SCHEMA_VERSION,
        "host": host,
        "capture": capture,
        "window_seconds": 60,
        "series": s,
    }
    from . import scenarios as _scen

    demo = _scen.meta(capture, host)
    if demo and demo.get("held_out"):
        removed = demo["held_out"]
        ho_path = _art.artifacts_dir() / f"model_heldout_{removed}.pt"
        if ho_path.exists():
            from .model import load as load_model

            ho_model = load_model(ho_path)
            result["held_out_class"] = {
                "removed_class": removed,
                "series": series(ho_model, scaler, states, capture, host),
                "note": (
                    f"Model trained with every {removed} window removed. "
                    f"Surprise timeline computed on the same host."
                ),
            }
    return result
