"""Stub mode: no trained artifacts, serve the 3 scripted demo hosts from the
pre-generated mock bundle (horizon-ui/public/mock/, produced by gen_mock.py).

Any non-demo host raises StubUnavailable -> 503. Adding real artifacts switches
predict.py to live inference and this module is bypassed.
"""
from __future__ import annotations

import json
from pathlib import Path

_MOCK_DIR = Path(__file__).resolve().parent.parent.parent / "horizon-ui" / "public" / "mock"

# host -> demo metadata. Mirrors gen_mock.SCENARIOS / api-contract 5.
DEMO_SCENARIOS = {
    ("ids2017-thursday", "192.168.10.15"): {
        "scenario": "infiltration",
        "true_class": "Infiltration",
        "first_attack_window": 13,
        "available_t": [40, 52],
        "held_out": "PortScan",
    },
    ("ids2017-friday", "192.168.10.50"): {
        "scenario": "botnet",
        "true_class": "Bot",
        "first_attack_window": 12,
        "available_t": [30],
        "held_out": "Botnet",
    },
    ("ids2017-monday", "192.168.10.8"): {
        "scenario": "benign",
        "true_class": "benign",
        "first_attack_window": None,
        "available_t": [60],
        "held_out": None,
    },
}


class StubUnavailable(RuntimeError):
    """Requested data is not in the scripted demo bundle."""


def _read(name: str) -> dict:
    p = _MOCK_DIR / name
    if not p.exists():
        raise StubUnavailable(f"mock file {name} not found; run horizon-ui/gen_mock.py")
    return json.loads(p.read_text())


def hosts() -> dict:
    return _read("hosts.json")


def metrics() -> dict:
    return _read("metrics.json")


def forecast(capture: str, host: str, t: int) -> dict:
    key = (capture, host)
    if key not in DEMO_SCENARIOS:
        raise StubUnavailable(
            f"{host} on {capture} is not a scripted demo host; add trained artifacts for live inference"
        )
    avail = DEMO_SCENARIOS[key]["available_t"]
    if t not in avail:
        raise StubUnavailable(f"no precomputed forecast at t={t}; available: {avail}")
    return _read(f"forecast_{capture}_{host}_t{t}.json")


def surprise(capture: str, host: str) -> dict:
    key = (capture, host)
    if key not in DEMO_SCENARIOS:
        raise StubUnavailable(f"{host} on {capture} is not a scripted demo host")
    return _read(f"surprise_{capture}_{host}.json")


def network(capture: str) -> dict:
    if capture not in {c for c, _ in DEMO_SCENARIOS}:
        raise StubUnavailable(f"{capture} is not a scripted demo capture")
    return _read(f"network_{capture}.json")


def flows(capture: str, host: str) -> dict:
    key = (capture, host)
    if key not in DEMO_SCENARIOS:
        raise StubUnavailable(f"{host} on {capture} is not a scripted demo host")
    return _read(f"flows_{capture}_{host}.json")
