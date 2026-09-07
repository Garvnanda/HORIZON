import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getForecast, getHosts, getMetrics, getSurprise } from '@/lib/api'
import { computeAlert } from '@/lib/alert'
import type {
  ComputedAlert,
  CounterfactualAction,
  ForecastDoc,
  HostEntry,
  MetricsDoc,
  SurpriseDoc,
} from '@/lib/types'

interface StoreValue {
  // selection
  capture: string
  host: string
  t: number
  threshold: number
  nSamples: number
  demoMode: boolean
  cfAction: CounterfactualAction
  showHeldOut: boolean
  // data
  hosts: HostEntry[]
  current?: HostEntry
  forecast?: ForecastDoc
  surprise?: SurpriseDoc
  metrics?: MetricsDoc
  loading: boolean
  // derived
  alert?: ComputedAlert
  // setters
  selectHost: (capture: string, host: string) => void
  setT: (t: number) => void
  setThreshold: (v: number) => void
  setNSamples: (n: number) => void
  setDemoMode: (v: boolean) => void
  setCfAction: (a: CounterfactualAction) => void
  setShowHeldOut: (v: boolean) => void
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<HostEntry[]>([])
  const [metrics, setMetrics] = useState<MetricsDoc>()
  const [capture, setCapture] = useState('ids2017-thursday')
  const [host, setHost] = useState('192.168.10.15')
  const [t, setT] = useState(40)
  const [threshold, setThreshold] = useState(0.3)
  const [nSamples, setNSamples] = useState(50)
  const [demoMode, setDemoMode] = useState(true)
  const [cfAction, setCfAction] = useState<CounterfactualAction>('isolate_host')
  const [showHeldOut, setShowHeldOut] = useState(false)

  const [forecast, setForecast] = useState<ForecastDoc>()
  const [surprise, setSurprise] = useState<SurpriseDoc>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHosts().then((d) => setHosts(d.hosts)).catch(console.error)
    getMetrics().then(setMetrics).catch(console.error)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getForecast(capture, host, t), getSurprise(capture, host)])
      .then(([f, s]) => {
        if (!alive) return
        setForecast(f)
        setSurprise(s)
      })
      .catch(console.error)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [capture, host, t])

  const current = useMemo(
    () => hosts.find((h) => h.host === host && h.capture === capture),
    [hosts, host, capture],
  )

  const selectHost = useCallback(
    (cap: string, h: string) => {
      setCapture(cap)
      setHost(h)
      const entry = hosts.find((x) => x.host === h && x.capture === cap)
      if (entry?.available_t.length) setT(entry.available_t[0])
      setShowHeldOut(false)
    },
    [hosts],
  )

  const alert = useMemo(() => {
    if (!forecast) return undefined
    return computeAlert(
      forecast.forecast.p_frac,
      threshold,
      forecast.ground_truth?.first_attack_window,
    )
  }, [forecast, threshold])

  const value: StoreValue = {
    capture,
    host,
    t,
    threshold,
    nSamples,
    demoMode,
    cfAction,
    showHeldOut,
    hosts,
    current,
    forecast,
    surprise,
    metrics,
    loading,
    alert,
    selectHost,
    setT,
    setThreshold,
    setNSamples,
    setDemoMode,
    setCfAction,
    setShowHeldOut,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
