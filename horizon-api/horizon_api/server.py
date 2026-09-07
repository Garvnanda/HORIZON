"""HORIZON FastAPI backend. Serves docs/api-contract.md from the trained model.

Run:  uvicorn horizon_api.server:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import SCHEMA_VERSION, __version__
from . import artifacts as _art
from . import network as _network
from . import predict as _predict
from . import stub as _stub

app = FastAPI(title="HORIZON inference API", version=__version__)

_origins = os.environ.get("HORIZON_CORS_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    # any localhost port in dev (vite hops ports); set HORIZON_CORS_ORIGINS in prod
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_DECISION_LOG = _art.artifacts_dir() / "decision_log.jsonl"


# ----------------------------------------------------------------- health
@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "mode": _art.mode(),
        "schema_version": SCHEMA_VERSION,
        "version": __version__,
        "artifacts_dir": str(_art.artifacts_dir()),
    }


# ----------------------------------------------------------------- hosts
@app.get("/api/hosts")
def get_hosts() -> dict:
    try:
        return _predict.hosts_doc()
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e


# -------------------------------------------------------------- forecast
@app.get("/api/forecast")
def get_forecast(
    host: str = Query(...),
    capture: str = Query(...),
    t: int = Query(..., ge=20),
) -> dict:
    try:
        return _predict.forecast(capture, host, t)
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except _predict.ForecastError as e:
        raise HTTPException(422, str(e)) from e


# -------------------------------------------------------------- surprise
@app.get("/api/surprise")
def get_surprise(host: str = Query(...), capture: str = Query(...)) -> dict:
    try:
        return _predict.surprise_doc(capture, host)
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


# --------------------------------------------------------------- network
@app.get("/api/network")
def get_network(capture: str = Query(...)) -> dict:
    try:
        return _network.network(capture)
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except _network.FlowsUnavailable as e:
        raise HTTPException(422, str(e)) from e


@app.get("/api/flows")
def get_flows(host: str = Query(...), capture: str = Query(...)) -> dict:
    try:
        return _network.flows(capture, host)
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except _network.FlowsUnavailable as e:
        raise HTTPException(422, str(e)) from e


# --------------------------------------------------------------- metrics
@app.get("/api/metrics")
def get_metrics() -> dict:
    live = _art.load_metrics()
    if live is not None:
        return live
    try:
        return _stub.metrics()
    except _stub.StubUnavailable as e:
        raise HTTPException(503, str(e)) from e


# -------------------------------------------------------------- decisions
class DecisionIn(BaseModel):
    host: str
    capture: str
    t: int
    decision: str = Field(pattern="^(approve|dismiss)$")
    tier: str
    command: str
    analyst: str = "demo"


@app.post("/api/decision")
def post_decision(d: DecisionIn) -> dict:
    """Log an Approve/Dismiss. NEVER executes the command."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        **d.model_dump(),
    }
    _DECISION_LOG.parent.mkdir(parents=True, exist_ok=True)
    with _DECISION_LOG.open("a") as fh:
        fh.write(json.dumps(entry) + "\n")
    return {"logged": True, "ts": entry["ts"], "decision_log_size": _log_size()}


@app.get("/api/decision-log")
def get_decision_log() -> dict:
    return {"schema_version": SCHEMA_VERSION, "entries": _read_log()}


def _read_log() -> list[dict]:
    if not _DECISION_LOG.exists():
        return []
    rows = [json.loads(ln) for ln in _DECISION_LOG.read_text().splitlines() if ln.strip()]
    rows.reverse()  # newest first
    return rows


def _log_size() -> int:
    return len(_read_log())
