// Kill-chain order for the forecast overlay. Heuristic mapping, see api-contract.md.
// Kept in sync with horizon-api/horizon_api/mitre.py.

export interface KillChainStage {
  stage: string
  tactic: string
  short: string
}

export const KILL_CHAIN: KillChainStage[] = [
  { stage: 'Reconnaissance', tactic: 'TA0043', short: 'Recon' },
  { stage: 'Initial Access', tactic: 'TA0001', short: 'Access' },
  { stage: 'Execution', tactic: 'TA0002', short: 'Exec' },
  { stage: 'Privilege Escalation', tactic: 'TA0004', short: 'PrivEsc' },
  { stage: 'Persistence', tactic: 'TA0003', short: 'Persist' },
  { stage: 'Lateral Movement', tactic: 'TA0008', short: 'Lateral' },
  { stage: 'Command & Control', tactic: 'TA0011', short: 'C2' },
  { stage: 'Exfiltration', tactic: 'TA0010', short: 'Exfil' },
]

export function stageIndex(stage: string): number {
  return KILL_CHAIN.findIndex((s) => s.stage === stage)
}

// CIC-IDS2017 attack class -> current ATT&CK tactic. Deterministic overlay.
export const CLASS_TO_STAGE: Record<string, string> = {
  PortScan: 'Reconnaissance',
  BruteForce: 'Initial Access',
  'FTP-Patator': 'Initial Access',
  'SSH-Patator': 'Initial Access',
  WebAttack: 'Initial Access',
  'Web Attack': 'Initial Access',
  'SQL Injection': 'Execution',
  Heartbleed: 'Initial Access',
  Infiltration: 'Initial Access',
  Bot: 'Initial Access',
  Botnet: 'Initial Access',
  DoS: 'Execution',
  DDoS: 'Execution',
  benign: 'Benign',
}
