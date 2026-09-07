// Kill-chain order for the forecast overlay. Heuristic mapping — see api-contract.md.

export interface KillChainStage {
  stage: string
  tactic: string
  short: string
}

export const KILL_CHAIN: KillChainStage[] = [
  { stage: 'Reconnaissance', tactic: 'TA0043', short: 'Recon' },
  { stage: 'Initial Access', tactic: 'TA0001', short: 'Access' },
  { stage: 'Lateral Movement', tactic: 'TA0008', short: 'Lateral' },
  { stage: 'Command & Control', tactic: 'TA0011', short: 'C2' },
  { stage: 'Exfiltration', tactic: 'TA0010', short: 'Exfil' },
]

export function stageIndex(stage: string): number {
  return KILL_CHAIN.findIndex((s) => s.stage === stage)
}

// CIC-IDS2017 attack class -> ATT&CK tactic(s). Deterministic overlay.
export const CLASS_TO_STAGE: Record<string, string> = {
  PortScan: 'Reconnaissance',
  BruteForce: 'Initial Access',
  'FTP-Patator': 'Initial Access',
  'SSH-Patator': 'Initial Access',
  WebAttack: 'Initial Access',
  'Web Attack': 'Initial Access',
  Infiltration: 'Lateral Movement',
  Bot: 'Command & Control',
  Botnet: 'Command & Control',
  DoS: 'Command & Control',
  DDoS: 'Command & Control',
  benign: 'Benign',
}
