"""Network topology + flow-sample views for the macro/micro scene.

`network(capture)` -> internal host-communication graph (nodes + edges).
`flows(capture, host)` -> a sample of that host's real flows for the micro view.

Both come from files the training notebook writes (`network_<capture>.json`,
`flows_<capture>_<host>.json`); `states.parquet` does not keep peer identity, so
in live mode without those files `network` falls back to nodes-only and `flows`
is unavailable.
"""
from __future__ import annotations

from . import SCHEMA_VERSION
from . import artifacts as _art
from . import stub as _stub


class FlowsUnavailable(ValueError):
    """No flow sample exported for this host."""


def _node_kind(n_peers: int, in_deg: int, out_deg: int) -> str:
    if n_peers >= 15 or (out_deg > 0 and in_deg / max(out_deg, 1) > 3):
        return "gateway"
    if in_deg >= 8 and in_deg > out_deg:
        return "server"
    return "workstation"


def network(capture: str) -> dict:
    if _art.mode() == "stub":
        return _stub.network(capture)

    doc = _art.load_json(f"network_{capture}.json")
    if doc is not None:
        doc.setdefault("schema_version", SCHEMA_VERSION)
        return doc

    # fallback: nodes only, derived from states.parquet
    _, _, states = _art.load_bundle()
    g = states[states["capture"] == capture]
    if g.empty:
        raise FlowsUnavailable(f"no rows for capture {capture}")
    agg = g.groupby("host").agg(n_flows=("n_flows", "sum"), n_windows=("window_idx", "count")).reset_index()
    demo_hosts = {h for c, h in _stub.DEMO_SCENARIOS if c == capture}
    nodes = [
        {
            "host": str(r.host),
            "subnet": str(r.host).rsplit(".", 1)[0],
            "n_flows": int(r.n_flows),
            "n_windows": int(r.n_windows),
            "kind": "workstation",
            "is_demo": str(r.host) in demo_hosts,
        }
        for r in agg.itertuples()
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "capture": capture,
        "nodes": nodes,
        "edges": [],
        "note": "Edges unavailable: network_<capture>.json not exported. Run the notebook with the topology cell.",
    }


def flows(capture: str, host: str) -> dict:
    if _art.mode() == "stub":
        return _stub.flows(capture, host)

    doc = _art.load_json(f"flows_{capture}_{host}.json")
    if doc is None:
        raise FlowsUnavailable(
            f"no flow sample for {host} on {capture}; the notebook exports it only for demo hosts"
        )
    doc.setdefault("schema_version", SCHEMA_VERSION)
    return doc
