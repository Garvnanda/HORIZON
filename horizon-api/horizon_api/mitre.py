"""Heuristic MITRE ATT&CK stage overlay (technical.md 3.8, HORIZON_Dev_Doc_v4 3.8).

Deterministic label -> tactic map. Presented as trajectory stage estimation, not
technique identification.
"""
from __future__ import annotations

from . import HORIZON

# 8-stage kill chain, kept in sync with horizon-ui/src/lib/mitre.ts
TACTIC = {
    "Reconnaissance": "TA0043",
    "Initial Access": "TA0001",
    "Execution": "TA0002",
    "Persistence": "TA0003",
    "Privilege Escalation": "TA0004",
    "Lateral Movement": "TA0008",
    "Command & Control": "TA0011",
    "Exfiltration": "TA0010",
    "Benign": "-",
}

# dataset attack class -> (current stage, escalated stage)
CLASS_TO_STAGES = {
    "benign": ("Benign", "Benign"),
    "PortScan": ("Reconnaissance", "Lateral Movement"),
    "Infiltration": ("Initial Access", "Lateral Movement"),
    "Bot": ("Initial Access", "Command & Control"),
    "Botnet": ("Initial Access", "Command & Control"),
    "DoS": ("Execution", "Execution"),
    "DDoS": ("Execution", "Execution"),
    "DoS Hulk": ("Execution", "Execution"),
    "BruteForce": ("Initial Access", "Privilege Escalation"),
    "FTP-Patator": ("Initial Access", "Privilege Escalation"),
    "SSH-Patator": ("Initial Access", "Privilege Escalation"),
    "WebAttack": ("Initial Access", "Execution"),
    "Web Attack \x96 Brute Force": ("Initial Access", "Execution"),
    "SQL Injection": ("Execution", "Exfiltration"),
    "Heartbleed": ("Initial Access", "Exfiltration"),
    "Exfiltration": ("Command & Control", "Exfiltration"),
}

NOTE = (
    "Heuristic overlay. Dataset attack classes do not map 1:1 to ATT&CK tactics; "
    "presented as trajectory stage estimation, not technique identification."
)


def _stages_for(attack_class: str | None) -> tuple[str, str]:
    if not attack_class:
        return ("Benign", "Benign")
    return CLASS_TO_STAGES.get(attack_class, ("Initial Access", "Lateral Movement"))


def overlay(p_frac, attack_class: str | None, threshold: float = 0.5) -> dict:
    """Build the mitre block. `p_frac` drives when the escalated stage begins:
    the first horizon step where p_frac crosses `threshold`.
    """
    cur, nxt = _stages_for(attack_class)
    escalate_at = next((k + 1 for k, p in enumerate(p_frac) if p >= threshold), None)
    if cur == nxt:
        escalate_at = None

    timeline = []
    for k in range(1, HORIZON + 1):
        stage = nxt if (escalate_at is not None and k >= escalate_at) else cur
        timeline.append({"step": k, "stage": stage, "tactic": TACTIC[stage]})

    predicted_stage = nxt if escalate_at is not None else cur
    return {
        "current_stage": cur,
        "current_tactic": TACTIC[cur],
        "predicted_stage": predicted_stage,
        "predicted_tactic": TACTIC[predicted_stage],
        "predicted_at_step": escalate_at,
        "stage_timeline": timeline,
        "note": NOTE,
    }
