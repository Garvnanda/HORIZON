"""Generate synthetic artifacts so the backend runs in 'live' mode without Kaggle.

Writes into this directory:
  states.parquet   - synthetic host-window table (3 demo hosts + 2 ad-hoc)
  scaler.json      - FeatureScaler fitted on it
  model.pt         - random-init HorizonModel (correct shapes, garbage weights)

Point the backend at it:  HORIZON_ARTIFACTS_DIR=horizon-api/fixtures

Values are meaningless - this only exercises plumbing and output shape. Real
numbers come from the Kaggle notebook.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from horizon_api import FEATURE_KEYS
from horizon_api.features import FeatureScaler
from horizon_api.model import HorizonModel, ModelConfig
from horizon_api.model import save as save_model

HERE = Path(__file__).resolve().parent
RNG = np.random.default_rng(42)

# (capture, host, n_windows, attack_onset or None)
HOSTS = [
    ("ids2017-thursday", "192.168.10.15", 130, 63),
    ("ids2017-friday", "192.168.10.50", 130, 70),
    ("ids2017-monday", "192.168.10.8", 130, None),
    ("ids2017-tuesday", "10.0.0.7", 90, 40),
    ("ids2017-wednesday", "10.0.0.9", 90, None),
]

_BENIGN_MEAN = np.array([12, 3, 5, 0.05, 0.03, 4e3, 8e4, 0.05, 1.8, 0.6])
_ATTACK_MEAN = np.array([200, 30, 120, 0.6, 0.6, 8e4, 3e4, 2.5, 0.3, 0.1])


def _row(attackish: bool) -> np.ndarray:
    base = _ATTACK_MEAN if attackish else _BENIGN_MEAN
    noise = RNG.normal(1.0, 0.25, size=len(FEATURE_KEYS)).clip(0.3, 2.0)
    v = base * noise
    v[3] = np.clip(v[3], 0, 1)   # new_peer_rate
    v[4] = np.clip(v[4], 0, 1)   # fail_ratio
    v[9] = np.clip(v[9], 0, 1)   # external_ratio
    return v


def build_states() -> pd.DataFrame:
    rows = []
    for capture, host, n, onset in HOSTS:
        for w in range(n):
            attackish = onset is not None and w >= onset
            feat = _row(attackish)
            rows.append({
                "capture": capture,
                "host": host,
                "window_idx": w,
                "ts": f"2017-07-06T{9 + w // 60:02d}:{w % 60:02d}:00Z",
                **{k: float(feat[i]) for i, k in enumerate(FEATURE_KEYS)},
                "is_empty": False,
                "label": ("PortScan" if attackish else "benign"),
            })
    return pd.DataFrame(rows)


def _network(capture: str, demo_host: str) -> dict:
    hs = [demo_host, "192.168.10.1", "192.168.10.3", "192.168.10.5", "ext:internet"]
    nodes = [{
        "host": h, "subnet": "external" if h.startswith("ext") else h.rsplit(".", 1)[0],
        "n_flows": 500 + i * 100, "n_windows": 120,
        "kind": ("gateway" if h.endswith(".1") else "domain-controller" if h.endswith(".3")
                 else "external" if h.startswith("ext") else "server" if h.endswith(".5") else "workstation"),
        "is_demo": h == demo_host, "is_target": h.endswith(".3"),
    } for i, h in enumerate(hs)]
    edges = [
        {"src": demo_host, "dst": "192.168.10.1", "flows": 200, "internal": True},
        {"src": demo_host, "dst": "192.168.10.5", "flows": 90, "internal": True},
        {"src": "192.168.10.1", "dst": "ext:internet", "flows": 500, "internal": False},
        {"src": demo_host, "dst": "192.168.10.3", "flows": 40, "internal": True, "attack": True, "stage": 2},
    ]
    return {"schema_version": "v4.0", "capture": capture, "nodes": nodes, "edges": edges}


def _flows(capture: str, host: str) -> dict:
    rows = []
    for w in range(0, 90, 2):
        rows.append({"window_idx": w, "ts": f"2017-07-06T10:{w % 60:02d}:00Z",
                     "dst_ip": "192.168.10.1", "dst_port": 443,
                     "bytes_out": 1200, "bytes_in": 8000,
                     "label": "PortScan" if w >= 63 else "benign", "internal": True})
    return {"schema_version": "v4.0", "capture": capture, "host": host, "flows": rows}


DEMO = [("ids2017-thursday", "192.168.10.15"), ("ids2017-friday", "192.168.10.50"),
        ("ids2017-monday", "192.168.10.8")]


def main() -> None:
    states = build_states()
    states.to_parquet(HERE / "states.parquet", index=False)

    scaler = FeatureScaler().fit(states[FEATURE_KEYS].to_numpy())
    scaler.save(HERE / "scaler.json")

    model = HorizonModel(ModelConfig())
    model.eval()
    save_model(model, HERE / "model.pt")

    for cap, host in DEMO:
        (HERE / f"network_{cap}.json").write_text(json.dumps(_network(cap, host), indent=1))
        (HERE / f"flows_{cap}_{host}.json").write_text(json.dumps(_flows(cap, host), indent=1))

    print(f"wrote fixtures to {HERE}")
    print(f"  states.parquet  {len(states)} rows, {states[['capture','host']].drop_duplicates().shape[0]} hosts")
    print("  scaler.json, model.pt (random init)")
    print(f"  network_*.json, flows_*.json  ({len(DEMO)} demo hosts)")


if __name__ == "__main__":
    main()
