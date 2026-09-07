"""Endpoint smoke tests via TestClient."""
from fastapi.testclient import TestClient

from test_contract import assert_forecast_shape


def _client(monkeypatch, tmp_path, art_dir):
    from horizon_api import artifacts as art
    from horizon_api import server

    monkeypatch.setattr(art, "artifacts_dir", lambda: art_dir)
    monkeypatch.setattr(server, "_DECISION_LOG", tmp_path / "decision_log.jsonl")
    art.reset_cache()
    return TestClient(server.app)


def test_health_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["mode"] == "live"


def test_forecast_endpoint_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/forecast", params={"capture": "ids2017-thursday", "host": "192.168.10.15", "t": 40})
    assert r.status_code == 200
    assert_forecast_shape(r.json())


def test_forecast_adhoc_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/forecast", params={"capture": "ids2017-tuesday", "host": "10.0.0.7", "t": 45})
    assert r.status_code == 200


def test_forecast_bad_t_rejected(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/forecast", params={"capture": "ids2017-thursday", "host": "192.168.10.15", "t": 5})
    assert r.status_code == 422


def test_hosts_endpoint_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/hosts")
    assert r.status_code == 200 and len(r.json()["hosts"]) >= 5


def test_surprise_endpoint_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/surprise", params={"capture": "ids2017-monday", "host": "192.168.10.8"})
    assert r.status_code == 200 and r.json()["series"]


def test_metrics_endpoint(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/metrics")
    assert r.status_code == 200 and "status" in r.json()


def test_network_endpoint_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/network", params={"capture": "ids2017-thursday"})
    assert r.status_code == 200
    d = r.json()
    assert d["nodes"] and {"host", "kind", "is_demo"} <= set(d["nodes"][0])
    assert isinstance(d["edges"], list)


def test_network_fallback_nodes_only(monkeypatch, tmp_path, fixtures_dir):
    # a capture with no network_<cap>.json fixture -> nodes-only fallback from states
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/network", params={"capture": "ids2017-tuesday"})
    assert r.status_code == 200
    d = r.json()
    assert d["nodes"] and d["edges"] == [] and "note" in d


def test_flows_endpoint_live(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/flows", params={"capture": "ids2017-thursday", "host": "192.168.10.15"})
    assert r.status_code == 200
    assert r.json()["flows"] and {"dst_ip", "dst_port", "label"} <= set(r.json()["flows"][0])


def test_flows_missing_422(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.get("/api/flows", params={"capture": "ids2017-tuesday", "host": "10.0.0.7"})
    assert r.status_code == 422


def test_network_stub(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, tmp_path)  # empty -> stub
    r = c.get("/api/network", params={"capture": "ids2017-thursday"})
    assert r.status_code == 200 and r.json()["nodes"]
    r2 = c.get("/api/network", params={"capture": "nope"})
    assert r2.status_code == 503


def test_decision_roundtrip(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    payload = {
        "host": "192.168.10.15", "capture": "ids2017-thursday", "t": 40,
        "decision": "approve", "tier": "elevated", "command": "iptables ...",
    }
    r = c.post("/api/decision", json=payload)
    assert r.status_code == 200 and r.json()["logged"] is True
    log = c.get("/api/decision-log").json()
    assert log["entries"][0]["decision"] == "approve"


def test_decision_rejects_bad_verb(monkeypatch, tmp_path, fixtures_dir):
    c = _client(monkeypatch, tmp_path, fixtures_dir)
    r = c.post("/api/decision", json={
        "host": "h", "capture": "c", "t": 40, "decision": "nuke", "tier": "x", "command": "y",
    })
    assert r.status_code == 422


def test_stub_mode_adhoc_503(monkeypatch, tmp_path):
    c = _client(monkeypatch, tmp_path, tmp_path)  # empty dir -> stub
    assert c.get("/api/health").json()["mode"] == "stub"
    r = c.get("/api/forecast", params={"capture": "x", "host": "y", "t": 40})
    assert r.status_code == 503
