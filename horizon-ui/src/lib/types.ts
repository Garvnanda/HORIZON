// Mirrors docs/api-contract.md (v4.0). Frozen with the contract.

export const FEATURE_KEYS = [
  'n_flows',
  'n_distinct_dst_ip',
  'n_distinct_dst_port',
  'new_peer_rate',
  'fail_ratio',
  'bytes_out',
  'bytes_in',
  'io_ratio',
  'mean_duration',
  'external_ratio',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type FeatureVec = Record<FeatureKey, number>

export interface HostEntry {
  host: string
  capture: string
  scenario: 'infiltration' | 'botnet' | 'benign'
  true_class: string
  n_windows: number
  available_t: number[]
  peak_p_frac: number
  has_counterfactual: boolean
}
export interface HostsDoc {
  schema_version: string
  hosts: HostEntry[]
}

export interface HistoryWindow {
  window_idx: number
  ts: string
  features: FeatureVec
  label: string
  surprise: number
  is_empty: boolean
}

export interface TrajStep {
  step: number
  features: FeatureVec
  actual: FeatureVec | null
}

export interface ForecastBlock {
  horizon: number
  n_samples: number
  p_mean: number[]
  p_frac: number[]
  spread: number[]
  divergence: number
  samples: number[][]
  trajectory_mean: TrajStep[]
}

export interface StageMark {
  step: number
  stage: string
  tactic: string
}
export interface MitreBlock {
  current_stage: string
  current_tactic: string
  predicted_stage: string
  predicted_tactic: string
  predicted_at_step: number | null
  stage_timeline: StageMark[]
  note: string
}

export type CounterfactualAction = 'do_nothing' | 'isolate_host' | 'rate_limit'
export interface CounterfactualBranch {
  p_frac: number[]
  applied_at_step?: number
  clamped_features?: string[]
}

export interface AlertReference {
  fired: boolean
  fired_at_step: number | null
  tier: AlertTier
  lead_time_windows: number | null
  recommended_command: string
}

export interface ForecastDoc {
  schema_version: string
  host: string
  capture: string
  demo_mode: boolean
  window_seconds: number
  t: number
  window_start_ts: string
  history: HistoryWindow[]
  forecast: ForecastBlock
  explain: { attention: number[]; feature_surprise: FeatureVec }
  mitre: MitreBlock
  counterfactuals: Record<CounterfactualAction, CounterfactualBranch>
  alert: { default_threshold: number; reference: AlertReference }
  ground_truth?: { attack_class: string; first_attack_window: number }
}

export interface SurpriseSeriesPoint {
  window_idx: number
  ts?: string
  surprise: number
  label: string
}
export interface SurpriseDoc {
  schema_version: string
  host: string
  capture: string
  window_seconds: number
  series: SurpriseSeriesPoint[]
  held_out_class?: {
    removed_class: string
    series: SurpriseSeriesPoint[]
    note: string
  }
}

export interface MetricsDoc {
  schema_version: string
  status: string // "MOCK" or ISO timestamp
  lead_time_vs_fpr: { fpr: number; lead_windows: Record<string, number> }[]
  reconstruction: {
    persistence_beaten: boolean
    per_feature_mse: Record<string, Record<string, number>>
  }
  rollout_error_growth: { step: number; nll: number; mse: number }[]
  generalisation: {
    held_out_capture: { macro_f1_in: number; macro_f1_out: number; lead_time_drop_windows: number }
    held_out_class: Record<string, { surprise_auc: number }>
  }
  standard: Record<string, Record<string, number>> & {
    per_class_f1: Record<string, number>
  }
  calibration: { platt_slope: number; reliability: { p_pred: number; p_obs: number }[] }
  divergence_auc: number
}

export interface NetNode {
  host: string
  subnet: string
  n_flows: number
  n_windows: number
  kind: 'gateway' | 'domain-controller' | 'server' | 'workstation' | 'external'
  is_demo: boolean
  is_target?: boolean
}
export interface NetEdge {
  src: string
  dst: string
  flows: number
  internal: boolean
  attack?: boolean
  stage?: number
}
export interface NetworkDoc {
  schema_version: string
  capture: string
  nodes: NetNode[]
  edges: NetEdge[]
  note?: string
}

export interface FlowRow {
  window_idx: number
  ts: string
  dst_ip: string
  dst_port: number
  bytes_out: number
  bytes_in: number
  label: string
  internal: boolean
}
export interface FlowsDoc {
  schema_version: string
  capture: string
  host: string
  flows: FlowRow[]
}

export type AlertTier = 'monitor' | 'suspicious' | 'elevated' | 'critical'

export interface ComputedAlert {
  fired: boolean
  firedAtStep: number | null
  leadTimeWindows: number | null
  peak: number
  tier: AlertTier
}
