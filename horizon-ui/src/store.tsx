import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getForecast, getHosts, getMetrics, getNetwork, getSurprise } from '@/lib/api'
import { computeAlert } from '@/lib/alert'
import type {
  ComputedAlert,
  CounterfactualAction,
  ForecastDoc,
  HostEntry,
  MetricsDoc,
  NetworkDoc,
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
  network?: NetworkDoc
  loading: boolean
  // derived
  alert?: ComputedAlert
  // scene playhead + selection
  playhead: number
  playing: boolean
  selectedNode: string | null
  // setters
  selectHost: (capture: string, host: string) => void
  setT: (t: number) => void
  setThreshold: (v: number) => void
  setNSamples: (n: number) => void
  setDemoMode: (v: boolean) => void
  setCfAction: (a: CounterfactualAction) => void
  setShowHeldOut: (v: boolean) => void
  setPlayhead: (k: number) => void
  setPlaying: (v: boolean) => void
  setSelectedNode: (h: string | null) => void
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<HostEntry[]>([])
  const [metrics, setMetrics] = useState<MetricsDoc>()
  const [capture, setCapture] = useState('ids2017-friday')
  const [host, setHost] = useState('172.16.0.1')
  const [t, setT] = useState(30)
  const [threshold, setThreshold] = useState(0.3)
  const [nSamples, setNSamples] = useState(50)
  const [demoMode, setDemoMode] = useState(true)
  const [cfAction, setCfAction] = useState<CounterfactualAction>('isolate_host')
  const [showHeldOut, setShowHeldOut] = useState(false)

  const [forecast, setForecast] = useState<ForecastDoc>()
  const [surprise, setSurprise] = useState<SurpriseDoc>()
  const [network, setNetwork] = useState<NetworkDoc>()
  const [loading, setLoading] = useState(true)

  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  useEffect(() => {
    getHosts()
      .then((d) => {
        setHosts(d.hosts)
        // snap to a real host if the compiled-in default is absent in this backend
        const present = d.hosts.some((h) => h.host === host && h.capture === capture)
        if (!present && d.hosts.length) {
          const known = ['portscan', 'infiltration', 'botnet']
          const pick =
            known.map((s) => d.hosts.find((h) => h.scenario === s)).find(Boolean) ?? d.hosts[0]
          setCapture(pick.capture)
          setHost(pick.host)
          // land on the last available frame (past onset for the attack scenarios)
          setT(pick.available_t[pick.available_t.length - 1] ?? pick.available_t[0] ?? 30)
        }
      })
      .catch(console.error)
    getMetrics().then(setMetrics).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setPlayhead(0)
    setPlaying(false)
    setSelectedNode(null)
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

  useEffect(() => {
    let alive = true
    getNetwork(capture)
      .then((n) => alive && setNetwork(n))
      .catch(() => alive && setNetwork(undefined))
    return () => {
      alive = false
    }
  }, [capture])

  // playhead animation
  useEffect(() => {
    if (!playing) return
    const horizon = forecast?.forecast.horizon ?? 20
    const id = setInterval(() => {
      setPlayhead((k) => {
        if (k >= horizon - 1) {
          setPlaying(false)
          return horizon - 1
        }
        return k + 1
      })
    }, 420)
    return () => clearInterval(id)
  }, [playing, forecast])

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
    network,
    loading,
    alert,
    playhead,
    playing,
    selectedNode,
    selectHost,
    setT,
    setThreshold,
    setNSamples,
    setDemoMode,
    setCfAction,
    setShowHeldOut,
    setPlayhead,
    setPlaying,
    setSelectedNode,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
