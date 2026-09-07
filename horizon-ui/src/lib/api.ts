import type { ForecastDoc, HostsDoc, MetricsDoc, SurpriseDoc } from './types'

/**
 * Demo transport: static JSON under public/mock/ (see api-contract.md §1).
 * Every function is shaped like the eventual GET endpoint so a live FastAPI
 * can be dropped in later with no frontend change.
 */

const BASE = `${import.meta.env.BASE_URL}mock`

async function getJSON<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}/${file}`)
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  return res.json() as Promise<T>
}

/** GET /api/hosts */
export function getHosts(): Promise<HostsDoc> {
  return getJSON<HostsDoc>('hosts.json')
}

/** GET /api/forecast?host=&capture=&t= */
export function getForecast(capture: string, host: string, t: number): Promise<ForecastDoc> {
  return getJSON<ForecastDoc>(`forecast_${capture}_${host}_t${t}.json`)
}

/** GET /api/surprise?host=&capture= */
export function getSurprise(capture: string, host: string): Promise<SurpriseDoc> {
  return getJSON<SurpriseDoc>(`surprise_${capture}_${host}.json`)
}

/** GET /api/metrics */
export function getMetrics(): Promise<MetricsDoc> {
  return getJSON<MetricsDoc>('metrics.json')
}

// ── decision log: localStorage in the demo, never executes anything ──
const LOG_KEY = 'horizon.decisionLog'

export interface DecisionEntry {
  ts: string
  host: string
  capture: string
  t: number
  decision: 'approve' | 'dismiss'
  tier: string
  command: string
}

/** POST /api/decision */
export function postDecision(e: Omit<DecisionEntry, 'ts'>): DecisionEntry {
  const entry: DecisionEntry = { ...e, ts: new Date().toISOString() }
  const log = getDecisionLog()
  log.unshift(entry)
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 50)))
  } catch {
    /* private mode / disabled storage — demo still runs */
  }
  return entry
}

/** GET /api/decision-log */
export function getDecisionLog(): DecisionEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as DecisionEntry[]
  } catch {
    return []
  }
}
