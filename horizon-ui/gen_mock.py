#!/usr/bin/env python3
"""HORIZON v4 mock data generator.

Emits the static JSON the frontend is built against, per docs/api-contract.md.
Deterministic, pure stdlib. Run:  python frontend/gen_mock.py

This is P1's mock generator (implementation.md). P2/P3 later replace the internals
with real model output; the SHAPES defined here are frozen on Day 2.

Self-check at the bottom asserts every emitted file matches the contract shape.
"""
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

OUT = os.path.join(os.path.dirname(__file__), "public", "mock")

FEATURES = [
    "n_flows", "n_distinct_dst_ip", "n_distinct_dst_port", "new_peer_rate",
    "fail_ratio", "bytes_out", "bytes_in", "io_ratio", "mean_duration", "external_ratio",
]
HISTORY = 20
HORIZON = 20
N_SAMPLES = 50

TACTIC = {
    "Reconnaissance": "TA0043", "Initial Access": "TA0001", "Lateral Movement": "TA0008",
    "Command & Control": "TA0011", "Exfiltration": "TA0010", "Benign": "-",
}


def iso(ts):
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def rnd(x, n=3):
    return round(float(x), n)


# ---------------------------------------------------------------- feature rows
def row_benign(r):
    return {
        "n_flows": rnd(r.uniform(4, 28), 1),
        "n_distinct_dst_ip": float(r.randint(1, 5)),
        "n_distinct_dst_port": float(r.randint(2, 8)),
        "new_peer_rate": rnd(r.uniform(0, 0.12)),
        "fail_ratio": rnd(r.uniform(0, 0.05)),
        "bytes_out": rnd(r.uniform(1e3, 9e4), 0),
        "bytes_in": rnd(r.uniform(1e4, 4e5), 0),
        "io_ratio": rnd(r.uniform(0.02, 0.35)),
        "mean_duration": rnd(r.uniform(0.4, 4.5), 2),
        "external_ratio": rnd(r.uniform(0.1, 0.85)),
    }


def row_download(r):  # initial access: big inbound from one external peer
    return {
        "n_flows": rnd(r.uniform(6, 20), 1),
        "n_distinct_dst_ip": 1.0,
        "n_distinct_dst_port": float(r.randint(1, 3)),
        "new_peer_rate": rnd(r.uniform(0.3, 0.8)),
        "fail_ratio": rnd(r.uniform(0, 0.05)),
        "bytes_out": rnd(r.uniform(3e3, 1.5e4), 0),
        "bytes_in": rnd(r.uniform(2e6, 9e6), 0),
        "io_ratio": rnd(r.uniform(0.001, 0.01), 4),
        "mean_duration": rnd(r.uniform(2, 8), 2),
        "external_ratio": rnd(r.uniform(0.85, 1.0)),
    }


def row_scan(r):  # port scan / lateral movement
    return {
        "n_flows": rnd(r.uniform(120, 380), 1),
        "n_distinct_dst_ip": float(r.randint(18, 55)),
        "n_distinct_dst_port": float(r.randint(60, 300)),
        "new_peer_rate": rnd(r.uniform(0.45, 0.9)),
        "fail_ratio": rnd(r.uniform(0.5, 0.85)),
        "bytes_out": rnd(r.uniform(2e4, 2e5), 0),
        "bytes_in": rnd(r.uniform(1e4, 8e4), 0),
        "io_ratio": rnd(r.uniform(1.5, 6)),
        "mean_duration": rnd(r.uniform(0.05, 0.6), 2),
        "external_ratio": rnd(r.uniform(0.0, 0.2)),
    }


def row_c2(r):  # beacon
    return {
        "n_flows": rnd(r.uniform(2, 8), 1),
        "n_distinct_dst_ip": 1.0,
        "n_distinct_dst_port": 1.0,
        "new_peer_rate": rnd(r.uniform(0, 0.4)),
        "fail_ratio": rnd(r.uniform(0, 0.1)),
        "bytes_out": rnd(r.uniform(400, 2500), 0),
        "bytes_in": rnd(r.uniform(300, 1800), 0),
        "io_ratio": rnd(r.uniform(0.8, 2.5)),
        "mean_duration": rnd(r.uniform(0.8, 1.4), 2),
        "external_ratio": 1.0,
    }


ROW = {"benign": row_benign, "download": row_download, "scan": row_scan, "c2": row_c2}
SURPRISE_BASE = {"benign": 0.35, "download": 1.7, "scan": 2.5, "c2": 1.9}


# ---------------------------------------------------------------- curves
def sigmoid_curve(mid, steep, lo, hi):
    return [clamp(lo + (hi - lo) / (1 + math.exp(-steep * (k - mid)))) for k in range(HORIZON)]


def flat_curve(level, r):
    return [clamp(level + r.uniform(-0.015, 0.03) + 0.001 * k) for k in range(HORIZON)]


def build_samples(mean_curve, r, quiet_frac):
    """50 trajectories around the mean; a fraction stay in the 'quiet' mode."""
    rows = []
    for _ in range(N_SAMPLES):
        quiet = r.random() < quiet_frac
        drift = r.uniform(-0.05, 0.05)
        traj = []
        for k, p in enumerate(mean_curve):
            if quiet:
                v = mean_curve[0] + r.uniform(-0.02, 0.05) + 0.003 * k
            else:
                v = p + drift + r.gauss(0, 0.045 + 0.004 * k)
            traj.append(rnd(clamp(v)))
        rows.append(traj)
    return rows


def derive(samples):
    p_mean, p_frac, spread = [], [], []
    for k in range(HORIZON):
        col = [s[k] for s in samples]
        m = sum(col) / len(col)
        var = sum((c - m) ** 2 for c in col) / len(col)
        p_mean.append(rnd(m))
        p_frac.append(rnd(sum(1 for c in col if c > 0.5) / len(col)))
        spread.append(rnd(math.sqrt(var)))
    return p_mean, p_frac, spread


def counterfactual(p_frac, r, factor):
    """factor 1.0 = full isolate (collapse), 0.5 = partial (rate-limit)."""
    out, cur = [], p_frac[0]
    for k in range(HORIZON):
        target = p_frac[k] * (1 - factor) + 0.03 * factor
        cur = cur + 0.5 * (target - cur) + r.uniform(-0.01, 0.01)
        out.append(rnd(clamp(cur)))
    return out


# ---------------------------------------------------------------- scenarios
SCENARIOS = {
    "infiltration": {
        "host": "192.168.10.15", "capture": "ids2017-thursday",
        "true_class": "Infiltration", "n_windows": 180,
        "base_ts": datetime(2017, 7, 6, 13, 0, tzinfo=timezone.utc),
        "hist_kinds": ["benign"] * 17 + ["download"] * 3,
        "future_kinds": ["benign"] * 6 + ["download"] * 3 + ["scan"] * 8 + ["c2"] * 3,
        "curve": dict(mid=6, steep=0.6, lo=0.02, hi=0.88),
        "quiet_frac": 0.28,
        "first_attack_window": 13,
        "mitre": ("Initial Access", "Lateral Movement", 6),
        "feature_surprise": {"new_peer_rate": 1.9, "bytes_in": 2.1, "external_ratio": 1.4,
                             "n_distinct_dst_port": 0.5, "mean_duration": 0.6},
        "attn_peak": 18,
        "held_out": "PortScan",
        "timesteps": [40, 52],
    },
    "botnet": {
        "host": "192.168.10.50", "capture": "ids2017-friday",
        "true_class": "Bot", "n_windows": 210,
        "base_ts": datetime(2017, 7, 7, 10, 0, tzinfo=timezone.utc),
        "hist_kinds": ["benign"] * 20,
        "future_kinds": ["benign"] * 5 + ["c2"] * 15,
        "curve": dict(mid=8, steep=0.5, lo=0.03, hi=0.62),
        "quiet_frac": 0.4,
        "first_attack_window": 12,
        "mitre": ("Initial Access", "Command & Control", 9),
        "feature_surprise": {"external_ratio": 1.8, "mean_duration": 1.2, "n_flows": 0.9,
                             "io_ratio": 0.7, "bytes_out": 0.5},
        "attn_peak": 12,
        "held_out": "Botnet",
        "timesteps": [30],
    },
    "benign": {
        "host": "192.168.10.8", "capture": "ids2017-monday",
        "true_class": "benign", "n_windows": 300,
        "base_ts": datetime(2017, 7, 3, 9, 0, tzinfo=timezone.utc),
        "hist_kinds": ["benign"] * 20,
        "future_kinds": ["benign"] * 20,
        "curve": None,
        "quiet_frac": 0.85,
        "first_attack_window": None,
        "mitre": ("Benign", "Benign", None),
        "feature_surprise": {"n_flows": 0.3, "io_ratio": 0.25, "bytes_in": 0.3},
        "attn_peak": 10,
        "held_out": None,
        "timesteps": [60],
    },
}


def feature_surprise_vec(spec, r):
    v = {f: rnd(r.uniform(0.05, 0.35)) for f in FEATURES}
    for k, val in spec["feature_surprise"].items():
        v[k] = rnd(val + r.uniform(-0.15, 0.15))
    return v


def attention_vec(peak, r):
    raw = [math.exp(-((i - peak) ** 2) / 18) + r.uniform(0, 0.08) for i in range(HISTORY)]
    s = sum(raw)
    return [rnd(x / s, 4) for x in raw]


def stage_timeline(spec):
    cur, nxt, at = spec["mitre"]
    out = []
    for k in range(1, HORIZON + 1):
        stage = cur if (at is None or k < at) else nxt
        out.append({"step": k, "stage": stage, "tactic": TACTIC[stage]})
    return out


def build_forecast(name, spec, t):
    r = random.Random(f"{name}-{t}")
    base = spec["base_ts"]
    t_start = base + timedelta(seconds=60 * t)

    history = []
    for i in range(HISTORY):
        widx = t - HISTORY + 1 + i
        kind = spec["hist_kinds"][i]
        history.append({
            "window_idx": widx,
            "ts": iso(base + timedelta(seconds=60 * widx)),
            "features": ROW[kind](r),
            "label": "benign",
            "surprise": rnd(SURPRISE_BASE[kind] + r.uniform(-0.2, 0.35), 2),
            "is_empty": False,
        })

    if spec["curve"]:
        mean_curve = sigmoid_curve(**spec["curve"])
    else:
        mean_curve = flat_curve(0.04, r)
    samples = build_samples(mean_curve, r, spec["quiet_frac"])
    p_mean, p_frac, spread = derive(samples)
    divergence = rnd(sum(spread) / len(spread) + 0.15)

    # predicted vs actual next-state rows
    traj = []
    for k in range(1, HORIZON + 1):
        akind = spec["future_kinds"][k - 1] if k - 1 < len(spec["future_kinds"]) else "benign"
        actual = ROW[akind](r)  # demo_mode is always True for these mocks
        # predicted: model leans toward the escalated state slightly EARLY
        pkind = akind
        faw = spec["first_attack_window"]
        if faw is not None and spec["curve"] and k >= max(1, faw - 3):
            pkind = "scan" if spec["true_class"] == "Infiltration" else "c2"
        traj.append({
            "step": k,
            "features": ROW[pkind](r),
            "actual": actual,
        })

    cf_iso = counterfactual(p_frac, r, factor=1.0)
    cf_rl = counterfactual(p_frac, r, factor=0.5)

    faw = spec["first_attack_window"]
    fired_at = next((k for k, p in enumerate(p_frac) if p >= 0.30), None)
    ref = {
        "fired": fired_at is not None,
        "fired_at_step": fired_at,
        "tier": ("critical" if max(p_frac) >= 0.9 else "elevated" if max(p_frac) >= 0.66
                 else "suspicious" if max(p_frac) >= 0.4 else "monitor"),
        "lead_time_windows": (faw - fired_at) if (faw is not None and fired_at is not None) else None,
        "recommended_command": (
            "iptables -A INPUT -s {ip} -m limit --limit 5/min -j ACCEPT\n"
            "iptables -A INPUT -s {ip} -j DROP".format(ip=spec["host"])
            if fired_at is not None else "# monitor only\nlog --level INFO --src " + spec["host"]
        ),
    }

    cur_stage, pred_stage, pred_at = spec["mitre"]
    doc = {
        "schema_version": "v4.0",
        "host": spec["host"],
        "capture": spec["capture"],
        "demo_mode": True,
        "window_seconds": 60,
        "t": t,
        "window_start_ts": iso(t_start),
        "history": history,
        "forecast": {
            "horizon": HORIZON,
            "n_samples": N_SAMPLES,
            "p_mean": p_mean,
            "p_frac": p_frac,
            "spread": spread,
            "divergence": divergence,
            "samples": samples,
            "trajectory_mean": traj,
        },
        "explain": {
            "attention": attention_vec(spec["attn_peak"], r),
            "feature_surprise": feature_surprise_vec(spec, r),
        },
        "mitre": {
            "current_stage": cur_stage,
            "current_tactic": TACTIC[cur_stage],
            "predicted_stage": pred_stage,
            "predicted_tactic": TACTIC[pred_stage],
            "predicted_at_step": pred_at,
            "stage_timeline": stage_timeline(spec),
            "note": ("Heuristic overlay. Dataset attack classes do not map 1:1 to ATT&CK "
                     "tactics; presented as trajectory stage estimation, not technique identification."),
        },
        "counterfactuals": {
            "do_nothing": {"p_frac": p_frac},
            "isolate_host": {
                "applied_at_step": 1,
                "p_frac": cf_iso,
                "clamped_features": ["n_distinct_dst_ip", "n_distinct_dst_port", "bytes_out", "external_ratio"],
            },
            "rate_limit": {"applied_at_step": 1, "p_frac": cf_rl},
        },
        "alert": {"default_threshold": 0.30, "reference": ref},
    }
    if faw is not None:
        doc["ground_truth"] = {"attack_class": spec["true_class"], "first_attack_window": faw}
    return doc


def build_surprise(name, spec):
    r = random.Random(f"surprise-{name}")
    base = spec["base_ts"]
    n = min(spec["n_windows"], 130)

    def series(removed):
        out = []
        onset = 63
        for w in range(n):
            if w < onset:
                s = 0.3 + r.uniform(-0.15, 0.25)
            else:
                # attack region: elevated even when its class was held out (a bit lower)
                s = (2.3 if not removed else 1.6) + r.uniform(-0.3, 0.5)
            out.append({
                "window_idx": w,
                "ts": iso(base + timedelta(seconds=60 * w)),
                "surprise": rnd(max(0.0, s), 2),
                "label": "benign" if w < onset else spec["true_class"],
            })
        return out

    doc = {
        "schema_version": "v4.0",
        "host": spec["host"],
        "capture": spec["capture"],
        "window_seconds": 60,
        "series": series(removed=False),
    }
    if spec["held_out"]:
        doc["held_out_class"] = {
            "removed_class": spec["held_out"],
            "series": series(removed=True),
            "note": (f"Model trained with every {spec['held_out']} window removed. "
                     f"Surprise still elevates from window 63, where {spec['held_out']} begins."),
        }
    return doc


def build_hosts():
    hosts = []
    for name, spec in SCENARIOS.items():
        r = random.Random(f"peak-{name}")
        fc = build_forecast(name, spec, spec["timesteps"][0])
        hosts.append({
            "host": spec["host"],
            "capture": spec["capture"],
            "scenario": name,
            "true_class": spec["true_class"],
            "n_windows": spec["n_windows"],
            "available_t": spec["timesteps"],
            "peak_p_frac": max(fc["forecast"]["p_frac"]),
            "has_counterfactual": spec["true_class"] != "benign",
        })
    return {"schema_version": "v4.0", "hosts": hosts}


def build_metrics():
    return {
        "schema_version": "v4.0",
        "status": "MOCK",
        "lead_time_vs_fpr": [
            {"fpr": 0.005, "lead_windows": {"HORIZON": 2.1, "direct_classifier": 2.4, "logreg": 0.0}},
            {"fpr": 0.02, "lead_windows": {"HORIZON": 4.3, "direct_classifier": 4.6, "logreg": 0.4}},
            {"fpr": 0.05, "lead_windows": {"HORIZON": 6.1, "direct_classifier": 6.0, "logreg": 1.1}},
            {"fpr": 0.10, "lead_windows": {"HORIZON": 7.4, "direct_classifier": 7.1, "logreg": 2.0}},
        ],
        "reconstruction": {
            "persistence_beaten": True,
            "per_feature_mse": {
                "HORIZON": {"n_distinct_dst_port": 0.021, "new_peer_rate": 0.018, "fail_ratio": 0.026},
                "persistence": {"n_distinct_dst_port": 0.049, "new_peer_rate": 0.041, "fail_ratio": 0.055},
            },
        },
        "rollout_error_growth": [
            {"step": 1, "nll": 3.1, "mse": 0.03},
            {"step": 5, "nll": 3.8, "mse": 0.07},
            {"step": 10, "nll": 4.9, "mse": 0.14},
            {"step": 20, "nll": 6.7, "mse": 0.28},
        ],
        "generalisation": {
            "held_out_capture": {"macro_f1_in": 0.71, "macro_f1_out": 0.58, "lead_time_drop_windows": 1.4},
            "held_out_class": {"PortScan": {"surprise_auc": 0.82}, "Botnet": {"surprise_auc": 0.74}},
        },
        "standard": {
            "HORIZON": {"macro_f1": 0.71, "precision": 0.69, "recall": 0.74, "fpr": 0.004},
            "direct_classifier": {"macro_f1": 0.70, "precision": 0.68, "recall": 0.73, "fpr": 0.005},
            "logreg": {"macro_f1": 0.63, "precision": 0.60, "recall": 0.61, "fpr": 0.011},
            "per_class_f1": {"Infiltration": 0.55, "Bot": 0.61, "PortScan": 0.88, "DoS": 0.91,
                             "DDoS": 0.93, "BruteForce": 0.80, "WebAttack": 0.49},
        },
        "calibration": {
            "platt_slope": 0.94,
            "reliability": [{"p_pred": 0.1, "p_obs": 0.08}, {"p_pred": 0.3, "p_obs": 0.27},
                            {"p_pred": 0.5, "p_obs": 0.47}, {"p_pred": 0.7, "p_obs": 0.66},
                            {"p_pred": 0.9, "p_obs": 0.86}],
        },
        "divergence_auc": 0.71,
    }


# ---------------------------------------------------------------- emit + self-check
def dump(obj, fname):
    path = os.path.join(OUT, fname)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=1)
    return path


def check_forecast(d):
    assert d["schema_version"] == "v4.0"
    assert len(d["history"]) == HISTORY
    f = d["forecast"]
    assert len(f["samples"]) == N_SAMPLES
    assert all(len(s) == HORIZON for s in f["samples"])
    assert len(f["p_frac"]) == len(f["p_mean"]) == len(f["spread"]) == HORIZON
    assert len(f["trajectory_mean"]) == HORIZON
    assert set(f["trajectory_mean"][0]["features"]) == set(FEATURES)
    assert len(d["explain"]["attention"]) == HISTORY
    assert set(d["explain"]["feature_surprise"]) == set(FEATURES)
    for key in ("do_nothing", "isolate_host", "rate_limit"):
        assert len(d["counterfactuals"][key]["p_frac"]) == HORIZON
    assert abs(sum(d["explain"]["attention"]) - 1.0) < 0.05


def main():
    os.makedirs(OUT, exist_ok=True)
    written = []

    written.append(dump(build_hosts(), "hosts.json"))
    written.append(dump(build_metrics(), "metrics.json"))

    for name, spec in SCENARIOS.items():
        cap, host = spec["capture"], spec["host"]
        for t in spec["timesteps"]:
            fc = build_forecast(name, spec, t)
            check_forecast(fc)
            written.append(dump(fc, f"forecast_{cap}_{host}_t{t}.json"))
        written.append(dump(build_surprise(name, spec), f"surprise_{cap}_{host}.json"))

    print(f"wrote {len(written)} files to {OUT}")
    for p in written:
        print("  ", os.path.basename(p))
    print("self-check passed")


if __name__ == "__main__":
    main()
