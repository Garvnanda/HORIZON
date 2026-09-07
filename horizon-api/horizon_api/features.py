"""Feature transforms and history slicing.

FeatureScaler is numpy-only and self-contained so the Kaggle notebook can import
(or paste) it without pulling the whole package. Fit it on the TRAIN split only,
then FeatureScaler.save() it to artifacts/scaler.json (technical.md 1.2). Stored
as JSON, not a pickle, so loading it is not code execution.
"""
from __future__ import annotations

import json

import numpy as np

from . import FEATURE_KEYS, HISTORY, LOG1P_KEYS

_LOG1P_MASK = np.array([k in LOG1P_KEYS for k in FEATURE_KEYS], dtype=bool)


class FeatureScaler:
    """log1p (on the heavy-tailed subset) then per-feature standardisation.

    Operates on raw arrays shaped (..., 10) in FEATURE_KEYS order.
    """

    def __init__(self) -> None:
        self.mean_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None
        self.log1p_mask_ = _LOG1P_MASK.copy()

    def _pre(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        out = x.copy()
        out[..., self.log1p_mask_] = np.log1p(np.clip(out[..., self.log1p_mask_], 0.0, None))
        return out

    def fit(self, x: np.ndarray) -> "FeatureScaler":
        p = self._pre(x).reshape(-1, len(FEATURE_KEYS))
        self.mean_ = p.mean(axis=0)
        std = p.std(axis=0)
        std[std < 1e-6] = 1.0
        self.scale_ = std
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        if self.mean_ is None:
            raise RuntimeError("FeatureScaler not fitted")
        return (self._pre(x) - self.mean_) / self.scale_

    def inverse_transform(self, z: np.ndarray) -> np.ndarray:
        if self.mean_ is None:
            raise RuntimeError("FeatureScaler not fitted")
        z = np.asarray(z, dtype=np.float64)
        p = z * self.scale_ + self.mean_
        out = p.copy()
        out[..., self.log1p_mask_] = np.expm1(out[..., self.log1p_mask_])
        out[..., self.log1p_mask_] = np.clip(out[..., self.log1p_mask_], 0.0, None)
        return out

    # -- persistence (JSON, not pickle) ----------------------------------
    def to_dict(self) -> dict:
        if self.mean_ is None:
            raise RuntimeError("FeatureScaler not fitted")
        return {
            "feature_keys": list(FEATURE_KEYS),
            "mean": self.mean_.tolist(),
            "scale": self.scale_.tolist(),
            "log1p_mask": self.log1p_mask_.tolist(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "FeatureScaler":
        if list(d["feature_keys"]) != list(FEATURE_KEYS):
            raise ValueError("scaler feature_keys do not match FEATURE_KEYS")
        s = cls()
        s.mean_ = np.asarray(d["mean"], dtype=np.float64)
        s.scale_ = np.asarray(d["scale"], dtype=np.float64)
        s.log1p_mask_ = np.asarray(d["log1p_mask"], dtype=bool)
        return s

    def save(self, path) -> None:
        with open(path, "w") as fh:
            json.dump(self.to_dict(), fh, indent=1)

    @classmethod
    def load(cls, path) -> "FeatureScaler":
        with open(path) as fh:
            return cls.from_dict(json.load(fh))


class HistoryError(ValueError):
    """Raised when a (capture, host, t) has no valid 20-window history."""


def slice_history(states, capture: str, host: str, t: int):
    """Return (raw_features (20,10), rows_df) for windows t-19..t.

    `states` is the states.parquet DataFrame. Raises HistoryError if the host has
    fewer than 20 contiguous windows ending at t.
    """
    g = states[(states["capture"] == capture) & (states["host"] == host)]
    if g.empty:
        raise HistoryError(f"no rows for capture={capture!r} host={host!r}")
    g = g.sort_values("window_idx")
    lo = t - HISTORY + 1
    win = g[(g["window_idx"] >= lo) & (g["window_idx"] <= t)]
    if len(win) < HISTORY:
        raise HistoryError(
            f"host {host} has {len(win)}/{HISTORY} windows in [{lo}, {t}]"
        )
    win = win.iloc[-HISTORY:]
    raw = win[FEATURE_KEYS].to_numpy(dtype=np.float64)
    return raw, win


def next_actual(states, capture: str, host: str, t: int, step: int):
    """Raw feature row for window t+step, or None if it does not exist. step>=1."""
    g = states[(states["capture"] == capture) & (states["host"] == host)]
    row = g[g["window_idx"] == t + step]
    if row.empty:
        return None
    return row[FEATURE_KEYS].to_numpy(dtype=np.float64)[0]
