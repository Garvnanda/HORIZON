import type {
  FlowsDoc,
  ForecastDoc,
  HostsDoc,
  MetricsDoc,
  NetworkDoc,
  SurpriseDoc,
} from './types'

/**
 * Two transports, same shapes (see api-contract.md §1, docs/api-endpoints.md):
 *
 *   no base set  -> static JSON under public/mock/ (offline demo).
 *   base set     -> live FastAPI (e.g. http://localhost:8000/api),
 *                   real model inference for any host in the dataset.
 *
 * Base resolution order: ?api=<url> query param (persisted) > localStorage
 * > VITE_API_BASE build env. The query param lets a deployed build point at a
 * fresh Cloudflare quick-tunnel URL without a rebuild:
 * https://<app>.vercel.app/?api=https://xxxx.trycloudflare.com/api
 *
 * The param is only honoured for hosts we actually deploy backends on — localhost
 * or *.trycloudflare.com over https — so a crafted ?api= link cannot redirect a
 * user's dashboard to an arbitrary server.
 */

function allowedApiHost(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const localhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  const tunnel = u.protocol === 'https:' && u.hostname.endsWith('.trycloudflare.com')
  if (!localhost && !tunnel) return null
  if (!localhost && u.protocol !== 'https:') return null
  return u.origin + u.pathname.replace(/\/$/, '')
}

function resolveBase(): string {
  try {
    const q = new URLSearchParams(location.search).get('api')
    if (q !== null) {
      const ok = q ? allowedApiHost(q) : ''
      if (q && ok === null) console.warn('[horizon] ignoring disallowed ?api= host:', q)
      else if (ok) localStorage.setItem('horizon.apiBase', ok)
      else localStorage.removeItem('horizon.apiBase')
    }
    const stored = localStorage.getItem('horizon.apiBase')
    if (stored && allowedApiHost(stored)) return stored
  } catch {
    /* SSR / storage disabled */
  }
  return import.meta.env.VITE_API_BASE ?? ''
}

const LIVE = resolveBase().replace(/\/$/, '')
const MOCK = `${import.meta.env.BASE_URL}mock`

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json() as Promise<T>
}

const q = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

/** GET /api/hosts */
export function getHosts(): Promise<HostsDoc> {
  return fetchJSON<HostsDoc>(LIVE ? `${LIVE}/hosts` : `${MOCK}/hosts.json`)
}

/** GET /api/forecast?host=&capture=&t= */
export function getForecast(capture: string, host: string, t: number): Promise<ForecastDoc> {
  return fetchJSON<ForecastDoc>(
    LIVE
      ? `${LIVE}/forecast?${q({ host, capture, t })}`
      : `${MOCK}/forecast_${capture}_${host}_t${t}.json`,
  )
}

/** GET /api/surprise?host=&capture= */
export function getSurprise(capture: string, host: string): Promise<SurpriseDoc> {
  return fetchJSON<SurpriseDoc>(
    LIVE ? `${LIVE}/surprise?${q({ host, capture })}` : `${MOCK}/surprise_${capture}_${host}.json`,
  )
}

/** GET /api/metrics */
export function getMetrics(): Promise<MetricsDoc> {
  return fetchJSON<MetricsDoc>(LIVE ? `${LIVE}/metrics` : `${MOCK}/metrics.json`)
}

/** GET /api/network?capture= */
export function getNetwork(capture: string): Promise<NetworkDoc> {
  return fetchJSON<NetworkDoc>(
    LIVE ? `${LIVE}/network?${q({ capture })}` : `${MOCK}/network_${capture}.json`,
  )
}

/** GET /api/flows?host=&capture= */
export function getFlows(capture: string, host: string): Promise<FlowsDoc> {
  return fetchJSON<FlowsDoc>(
    LIVE ? `${LIVE}/flows?${q({ host, capture })}` : `${MOCK}/flows_${capture}_${host}.json`,
  )
}

// ── decision log: localStorage, never executes anything ──
// Stays client-side in both transports; the live backend also has POST
// /api/decision (jsonl audit log) but the panel does not need it for the demo.
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
    /* private mode or disabled storage; demo still runs */
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
