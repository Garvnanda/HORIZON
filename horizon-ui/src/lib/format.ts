import type { FeatureKey } from './types'

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  n_flows: 'flows',
  n_distinct_dst_ip: 'distinct dst IPs',
  n_distinct_dst_port: 'distinct dst ports',
  new_peer_rate: 'new-peer rate',
  fail_ratio: 'fail ratio',
  bytes_out: 'bytes out',
  bytes_in: 'bytes in',
  io_ratio: 'I/O ratio',
  mean_duration: 'mean duration',
  external_ratio: 'external ratio',
}

export function fmtFeature(key: FeatureKey, v: number): string {
  switch (key) {
    case 'bytes_out':
    case 'bytes_in':
      return fmtBytes(v)
    case 'new_peer_rate':
    case 'fail_ratio':
    case 'external_ratio':
      return `${(v * 100).toFixed(0)}%`
    case 'io_ratio':
      return v.toFixed(2)
    case 'mean_duration':
      return `${v.toFixed(1)}s`
    case 'n_flows':
      return v.toFixed(0)
    default:
      return v.toFixed(0)
  }
}

export function fmtBytes(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} GB`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} MB`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} kB`
  return `${v.toFixed(0)} B`
}

export function fmtPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`
}

export function clockFromSeconds(s: number): string {
  const hh = Math.floor(s / 3600)
  const mm = Math.floor(s / 60) % 60
  const ss = Math.floor(s) % 60
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':')
}
