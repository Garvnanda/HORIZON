"""Demo-host metadata: scripted ground truth for the hosts the demo walks through.

Base table lives in stub.DEMO_SCENARIOS. If artifacts/scenarios.json is present
(written by the Kaggle notebook from the real data) its entries override the base,
so first_attack_window etc. reflect the trained dataset rather than the mock.

scenarios.json shape:
  { "ids2017-thursday/192.168.10.15": {
        "scenario": "infiltration", "true_class": "Infiltration",
        "first_attack_window": 13, "available_t": [40, 52], "held_out": "PortScan" } }
"""
from __future__ import annotations

from . import artifacts as _art
from .stub import DEMO_SCENARIOS


def meta(capture: str, host: str) -> dict | None:
    base = DEMO_SCENARIOS.get((capture, host))
    override = (_art.load_scenarios() or {}).get(f"{capture}/{host}")
    if base is None and override is None:
        return None
    return {**(base or {}), **(override or {})}


def all_keys() -> set[tuple[str, str]]:
    keys = set(DEMO_SCENARIOS)
    for k in (_art.load_scenarios() or {}):
        cap, _, host = k.partition("/")
        if host:
            keys.add((cap, host))
    return keys
