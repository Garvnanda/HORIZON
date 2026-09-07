"""forecast(capture, host, t) -> dict matching docs/api-contract.md 3.2.

Live mode: real rollout from the trained model. Stub mode: the scripted demo
bundle. Same return shape either way - the frontend cannot tell.
"""
from __future__ import annotations

import numpy as np
import torch

from . import (
    FEATURE_KEYS,
    HISTORY,
    HORIZON,
    N_SAMPLES,
    SCHEMA_VERSION,
)
from . import artifacts as _art
from . import scenarios as _scen
from . import stub as _stub
from .features import HistoryError, next_actual, slice_history
from .mitre import overlay as mitre_overlay
from .rollout import make_intervention, rollout

DEFAULT_THRESHOLD = 0.30
_CF_KEYS = ["do_nothing", "isolate_host", "rate_limit"]


class ForecastError(ValueError):
    pass


def _round_list(a, n=4):
    return [round(float(x), n) for x in np.asarray(a).ravel()]


def _feat_dict(vec) -> dict:
    return {k: round(float(v), 4) for k, v in zip(FEATURE_KEYS, np.asarray(vec).ravel())}


def _tier(peak: float) -> str:
    return (
        "critical" if peak >= 0.90
        else "elevated" if peak >= 0.66
        else "suspicious" if peak >= 0.40
        else "monitor"
    )


def _command(host: str, fired: bool) -> str:
    if not fired:
        return f"# monitor only\nlog --level INFO --src {host}"
    return (
        f"iptables -A INPUT -s {host} -m limit --limit 5/min -j ACCEPT\n"
        f"iptables -A INPUT -s {host} -j DROP"
    )


def _alert_reference(host: str, p_frac, first_attack_window):
    fired_at = next((k for k, p in enumerate(p_frac) if p >= DEFAULT_THRESHOLD), None)
    fired = fired_at is not None
    peak = float(max(p_frac))
    lead = (
        first_attack_window - fired_at
        if (fired and first_attack_window is not None)
        else None
    )
    return {
        "fired": fired,
        "fired_at_step": fired_at,
        "tier": _tier(peak),
        "lead_time_windows": lead,
        "recommended_command": _command(host, fired),
    }


def forecast(capture: str, host: str, t: int) -> dict:
    if _art.mode() == "stub":
        return _stub.forecast(capture, host, t)
    return _forecast_live(capture, host, t)


def hosts_doc() -> dict:
    """api-contract 3.1. Stub -> scripted 3. Live -> every (capture, host) in states."""
    if _art.mode() == "stub":
        return _stub.hosts()

    _, _, states = _art.load_bundle()
    counts = (
        states.groupby(["capture", "host"])["window_idx"]
        .agg(["count", "min", "max"])
        .reset_index()
    )
    hosts = []
    for _, row in counts.iterrows():
        cap, host = str(row["capture"]), str(row["host"])
        n = int(row["count"])
        demo = _scen.meta(cap, host)
        lo, hi = int(row["min"]) + HISTORY, int(row["max"])
        if demo:
            available_t = demo.get("available_t") or [lo, (lo + hi) // 2, hi]
            true_class = demo.get("true_class", "unknown")
            scenario = demo.get("scenario", "adhoc")
        else:
            available_t = sorted({t for t in (lo, (lo + hi) // 2, hi) if t >= lo}) or [lo]
            true_class = "unknown"
            scenario = "adhoc"
        hosts.append({
            "host": host,
            "capture": cap,
            "scenario": scenario,
            "true_class": true_class,
            "n_windows": n,
            "available_t": available_t,
            "peak_p_frac": 0.0,  # unknown until /api/forecast is called for this host
            "has_counterfactual": True,
        })
    return {"schema_version": SCHEMA_VERSION, "hosts": hosts}


def surprise_doc(capture: str, host: str) -> dict:
    from .surprise import doc as _doc

    return _doc(capture, host)


@torch.no_grad()
def _forecast_live(capture: str, host: str, t: int) -> dict:
    model, scaler, states = _art.load_bundle()

    try:
        raw_hist, win = slice_history(states, capture, host, t)
    except HistoryError as e:
        raise ForecastError(str(e)) from e

    z_hist = scaler.transform(raw_hist)  # (20, 10)

    demo = _scen.meta(capture, host)
    demo_mode = demo is not None
    attack_class = demo["true_class"] if demo_mode else None
    first_attack_window = demo["first_attack_window"] if demo_mode else None

    # -- 3 rollouts: do_nothing / isolate_host / rate_limit --------------
    results = {}
    for i, name in enumerate(_CF_KEYS):
        iv = make_intervention(name, z_hist)
        results[name] = rollout(model, z_hist, intervention=iv, seed=1000 + i)
    base = results["do_nothing"]
    p_frac = base.p_frac.tolist()

    # -- history block with per-window surprise (one pass) --------------
    x_hist = np.concatenate([z_hist, np.zeros((HISTORY, 1))], axis=1)
    xt = torch.tensor(x_hist, dtype=torch.float32).unsqueeze(0)
    step_states, _, _, _ = model.encode_all(xt)
    step_states = step_states[0]  # (20, H)
    hist_surprise = [0.0]
    for i in range(1, HISTORY):
        tgt = torch.tensor(z_hist[i], dtype=torch.float32).unsqueeze(0)
        hist_surprise.append(float(model.mdn.nll(step_states[i - 1 : i], tgt)))
    hist_surprise[0] = hist_surprise[1] if len(hist_surprise) > 1 else 0.0

    ts_col = win["ts"].astype(str).tolist()
    labels = win["label"].astype(str).tolist()
    empties = (
        win["is_empty"].astype(bool).tolist()
        if "is_empty" in win.columns
        else [False] * HISTORY
    )
    history = []
    for i in range(HISTORY):
        history.append({
            "window_idx": int(win["window_idx"].iloc[i]),
            "ts": ts_col[i],
            "features": _feat_dict(raw_hist[i]),
            "label": labels[i],
            "surprise": round(hist_surprise[i], 3),
            "is_empty": empties[i],
        })

    # -- trajectory_mean in original units ----------------------------
    traj_mean_z = base.trajectory_mean_z()  # (20, 10)
    traj_mean_raw = scaler.inverse_transform(traj_mean_z)
    trajectory_mean = []
    for k in range(HORIZON):
        actual_raw = next_actual(states, capture, host, t, k + 1) if demo_mode else None
        trajectory_mean.append({
            "step": k + 1,
            "features": _feat_dict(traj_mean_raw[k]),
            "actual": _feat_dict(actual_raw) if actual_raw is not None else None,
        })

    # -- explain: attention + per-feature surprise of the actual next state
    actual_next = next_actual(states, capture, host, t, 1)
    if actual_next is None:
        # fall back to the last observed transition in the history
        last_state = step_states[HISTORY - 2 : HISTORY - 1]
        tgt = torch.tensor(z_hist[HISTORY - 1], dtype=torch.float32).unsqueeze(0)
    else:
        last_state, *_ = model.encode(xt)
        tgt = torch.tensor(scaler.transform(actual_next[None, :])[0], dtype=torch.float32).unsqueeze(0)
    pf_nll = model.mdn.per_feature_nll(last_state, tgt)[0].cpu().numpy()
    feature_surprise = {k: round(float(max(0.0, v)), 3) for k, v in zip(FEATURE_KEYS, pf_nll)}

    # -- alert reference ---------------------------------------------
    reference = _alert_reference(host, p_frac, first_attack_window)

    doc = {
        "schema_version": SCHEMA_VERSION,
        "host": host,
        "capture": capture,
        "demo_mode": demo_mode,
        "window_seconds": 60,
        "t": int(t),
        "window_start_ts": ts_col[-1],
        "history": history,
        "forecast": {
            "horizon": HORIZON,
            "n_samples": N_SAMPLES,
            "p_mean": _round_list(base.p_mean),
            "p_frac": _round_list(p_frac),
            "spread": _round_list(base.spread),
            "divergence": round(base.divergence, 4),
            "samples": [_round_list(row) for row in base.p_curves],
            "trajectory_mean": trajectory_mean,
        },
        "explain": {
            "attention": _round_list(base.attention),
            "feature_surprise": feature_surprise,
        },
        "mitre": mitre_overlay(p_frac, attack_class),
        "counterfactuals": {
            "do_nothing": {"p_frac": _round_list(results["do_nothing"].p_frac)},
            "isolate_host": {
                "applied_at_step": 1,
                "p_frac": _round_list(results["isolate_host"].p_frac),
                "clamped_features": ["n_distinct_dst_ip", "n_distinct_dst_port", "bytes_out", "external_ratio"],
            },
            "rate_limit": {
                "applied_at_step": 1,
                "p_frac": _round_list(results["rate_limit"].p_frac),
            },
        },
        "alert": {"default_threshold": DEFAULT_THRESHOLD, "reference": reference},
    }
    if demo_mode and first_attack_window is not None:
        doc["ground_truth"] = {
            "attack_class": attack_class,
            "first_attack_window": first_attack_window,
        }
    return doc
