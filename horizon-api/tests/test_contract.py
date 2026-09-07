"""The forecast output must match docs/api-contract.md 3.2 exactly, in both modes."""
import json
from pathlib import Path

import pytest

from horizon_api import FEATURE_KEYS, HISTORY, HORIZON, N_SAMPLES

FEATSET = set(FEATURE_KEYS)
ROOT = Path(__file__).resolve().parent.parent


def assert_forecast_shape(d: dict):
    assert d["schema_version"] == "v4.0"
    assert isinstance(d["demo_mode"], bool)
    assert len(d["history"]) == HISTORY
    for h in d["history"]:
        assert set(h["features"]) == FEATSET
        assert {"window_idx", "ts", "label", "surprise", "is_empty"} <= set(h)

    f = d["forecast"]
    assert f["horizon"] == HORIZON and f["n_samples"] == N_SAMPLES
    assert len(f["p_mean"]) == len(f["p_frac"]) == len(f["spread"]) == HORIZON
    assert len(f["samples"]) == N_SAMPLES
    assert all(len(s) == HORIZON for s in f["samples"])
    assert len(f["trajectory_mean"]) == HORIZON
    assert set(f["trajectory_mean"][0]["features"]) == FEATSET
    assert all(0.0 <= x <= 1.0 for x in f["p_frac"])

    assert len(d["explain"]["attention"]) == HISTORY
    assert abs(sum(d["explain"]["attention"]) - 1.0) < 0.05
    assert set(d["explain"]["feature_surprise"]) == FEATSET

    for key in ("do_nothing", "isolate_host", "rate_limit"):
        assert len(d["counterfactuals"][key]["p_frac"]) == HORIZON

    m = d["mitre"]
    assert len(m["stage_timeline"]) == HORIZON
    assert {"current_stage", "predicted_stage", "predicted_at_step", "note"} <= set(m)

    assert d["alert"]["default_threshold"] == 0.30
    assert {"fired", "fired_at_step", "tier", "recommended_command"} <= set(d["alert"]["reference"])


def test_live_forecast_matches_contract(live):
    from horizon_api import predict

    d = predict.forecast("ids2017-thursday", "192.168.10.15", 40)
    assert_forecast_shape(d)
    assert d["demo_mode"] is True
    assert d["ground_truth"]["attack_class"] == "Infiltration"


def test_live_forecast_adhoc_host(live):
    from horizon_api import predict

    d = predict.forecast("ids2017-tuesday", "10.0.0.7", 40)
    assert_forecast_shape(d)
    assert d["demo_mode"] is False
    assert "ground_truth" not in d


def test_live_hosts_lists_all(live):
    from horizon_api import predict

    doc = predict.hosts_doc()
    keys = {(h["capture"], h["host"]) for h in doc["hosts"]}
    assert ("ids2017-thursday", "192.168.10.15") in keys
    assert ("ids2017-tuesday", "10.0.0.7") in keys


def test_live_surprise_shape(live):
    from horizon_api import predict

    doc = predict.surprise_doc("ids2017-thursday", "192.168.10.15")
    assert doc["series"]
    assert {"window_idx", "surprise", "label"} <= set(doc["series"][0])


def test_stub_serves_demo_hosts(stub):
    from horizon_api import predict

    d = predict.forecast("ids2017-thursday", "192.168.10.15", 40)
    assert_forecast_shape(d)


def test_stub_rejects_adhoc(stub):
    from horizon_api import predict, stub as stubmod

    with pytest.raises(stubmod.StubUnavailable):
        predict.forecast("ids2017-tuesday", "10.0.0.7", 40)


def test_stub_output_equals_live_shape(stub):
    """The two modes cannot diverge in shape - guard against drift."""
    from horizon_api import predict

    assert_forecast_shape(predict.forecast("ids2017-friday", "192.168.10.50", 30))
