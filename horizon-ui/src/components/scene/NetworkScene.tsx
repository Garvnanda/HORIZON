import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { activeScene } from '@/lib/palette'
import { withAlpha } from '@/lib/chartkit'
import { useTheme } from '@/lib/theme'
import type { NetEdge, NetNode } from '@/lib/types'

const COL: Record<NetNode['kind'], number> = {
  external: 0,
  gateway: 1,
  workstation: 2,
  server: 3,
  'domain-controller': 4,
}

function hashY(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h % 1000) / 1000
}

interface Placed {
  node: NetNode
  x: number
  y: number
  stage: number // 0 = origin, Infinity = not on the attack path
}

/**
 * Macro network scene. Real host-communication graph from /api/network; the
 * attack front advances with the shared playhead, and the counterfactual choice
 * visibly cuts it. Click a node for the micro (per-host) view.
 */
export function NetworkScene() {
  const { network, forecast, alert, cfAction, host, playhead, selectedNode, setSelectedNode } = useStore()
  const theme = useTheme()
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef<() => void>(() => {})
  const [hover, setHover] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)
  hoverRef.current = hover

  const horizon = forecast?.forecast.horizon ?? 20
  const peak = forecast ? Math.max(...forecast.forecast.p_frac) : 0
  const active = peak > 0.12

  // ---- place nodes + compute attack stages ----
  const { placed, edges, maxStage, maxFlows } = useMemo(() => {
    if (!network) return { placed: [] as Placed[], edges: [] as NetEdge[], maxStage: 0, maxFlows: 1 }
    const byCol: Record<number, NetNode[]> = {}
    for (const n of network.nodes) (byCol[COL[n.kind]] ??= []).push(n)

    const stageOf = new Map<string, number>()
    stageOf.set(host, 0)
    const atkEdges = network.edges.filter((e) => e.attack)
    for (const e of atkEdges) {
      const s = e.stage ?? 1
      stageOf.set(e.dst, Math.min(stageOf.get(e.dst) ?? Infinity, s))
      if (!stageOf.has(e.src)) stageOf.set(e.src, Math.max(0, s - 1))
    }
    let ms = 0
    for (const v of stageOf.values()) if (Number.isFinite(v)) ms = Math.max(ms, v)
    // no attack edges: synthesise host -> target
    if (atkEdges.length === 0 && active) {
      const target = network.nodes.find((n) => n.is_target)
      if (target) {
        stageOf.set(target.host, 2)
        ms = 2
      }
    }

    const placed: Placed[] = []
    for (const [colStr, list] of Object.entries(byCol)) {
      const col = Number(colStr)
      const sorted = [...list].sort((a, b) => a.host.localeCompare(b.host))
      sorted.forEach((n, i) => {
        const n0 = sorted.length
        const y = n0 === 1 ? 0.5 : 0.12 + (0.76 * (i + hashY(n.host) * 0.4)) / Math.max(1, n0 - 0.6)
        placed.push({
          node: n,
          x: 0.07 + (col / 4) * 0.86,
          y: Math.min(0.9, Math.max(0.1, y)),
          stage: stageOf.get(n.host) ?? Infinity,
        })
      })
    }
    const maxFlows = Math.max(1, ...network.edges.map((e) => e.flows))
    return { placed, edges: network.edges, maxStage: Math.max(1, ms), maxFlows }
  }, [network, host, active])

  const posOf = useMemo(() => {
    const m = new Map<string, Placed>()
    for (const p of placed) m.set(p.node.host, p)
    return m
  }, [placed])

  // ---- intercept stage from the counterfactual choice ----
  const interceptStage = useMemo(() => {
    if (cfAction === 'do_nothing' || !alert?.fired) return null
    const base = Math.max(1, Math.round(((alert.firedAtStep ?? 0) / horizon) * maxStage))
    return cfAction === 'isolate_host' ? base : Math.min(maxStage, base + 1)
  }, [cfAction, alert, horizon, maxStage])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const S = activeScene()
      const dpr = window.devicePixelRatio || 1
      const rect = cv.getBoundingClientRect()
      cv.width = rect.width * dpr
      cv.height = rect.height * dpr
      const W = cv.width
      const H = cv.height
      const padX = 30 * dpr
      const padY = 24 * dpr
      const PX = (x: number) => padX + x * (W - 2 * padX)
      const PY = (y: number) => padY + y * (H - 2 * padY)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = S.bg
      ctx.fillRect(0, 0, W, H)

      if (!network || placed.length === 0) {
        ctx.fillStyle = S.label
        ctx.font = `${11 * dpr}px Calibri, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('loading network…', W / 2, H / 2)
        drawRef.current = draw
        return
      }

      const progress = active ? (playhead / Math.max(1, horizon - 1)) * (maxStage + 0.4) : 0
      const breach = active && interceptStage == null
      const nodeCut = (stage: number) => interceptStage != null && stage > interceptStage
      const nodeHot = (stage: number) =>
        active && Number.isFinite(stage) && stage <= progress && !nodeCut(stage)
      const nodeFront = (stage: number) =>
        active && Number.isFinite(stage) && !nodeCut(stage) && stage > progress && stage <= progress + 1
      const targetPlaced = placed.find((p) => p.node.is_target)
      const contained = active && interceptStage != null && progress >= maxStage
      const breached = breach && progress >= maxStage

      // ---- edges ----
      for (const e of edges) {
        const a = posOf.get(e.src)
        const b = posOf.get(e.dst)
        if (!a || !b) continue
        const x1 = PX(a.x)
        const y1 = PY(a.y)
        const x2 = PX(b.x)
        const y2 = PY(b.y)
        const isAtk = !!e.attack
        const st = e.stage ?? 1
        const cut = isAtk && interceptStage != null && st > interceptStage
        const hotEdge = isAtk && active && st <= progress && !cut

        ctx.beginPath()
        ctx.moveTo(x1, y1)
        const mx = (x1 + x2) / 2
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2)

        if (cut) {
          ctx.strokeStyle = withAlpha(S.agent, 0.35)
          ctx.setLineDash([2 * dpr, 4 * dpr])
          ctx.lineWidth = 1.4 * dpr
        } else if (hotEdge) {
          ctx.strokeStyle = breach ? S.agent : S.edgeHot
          ctx.setLineDash([])
          ctx.lineWidth = 2.4 * dpr
          ctx.globalAlpha = 0.95
        } else if (isAtk) {
          ctx.strokeStyle = withAlpha(S.edgeHot, 0.3)
          ctx.setLineDash([4 * dpr, 3 * dpr])
          ctx.lineWidth = 1.2 * dpr
        } else {
          ctx.strokeStyle = withAlpha(S.edgeIdle, 0.25 + 0.5 * (e.flows / maxFlows))
          ctx.setLineDash([])
          ctx.lineWidth = 1 * dpr
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1

        // ambient packet on a few benign edges
        if (!isAtk && e.flows / maxFlows > 0.4) {
          const tt = (performance.now() / 2600 + hashY(e.src + e.dst)) % 1
          const px = x1 + (x2 - x1) * tt
          const py = y1 + (y2 - y1) * tt
          ctx.beginPath()
          ctx.arc(px, py, 1.6 * dpr, 0, Math.PI * 2)
          ctx.fillStyle = withAlpha(S.nodeIdle, 0.5)
          ctx.fill()
        }
      }

      // ---- nodes ----
      for (const p of placed) {
        const x = PX(p.x)
        const y = PY(p.y)
        const isOrigin = p.node.host === host
        const isTarget = p.node.is_target
        const hot = nodeHot(p.stage)
        const front = nodeFront(p.stage)
        const shielded = interceptStage != null && isOrigin && progress >= 0.3
        const base =
          p.node.kind === 'gateway' ? 9 : isTarget ? 11 : p.node.kind === 'server' ? 8 : p.node.kind === 'external' ? 7 : 7
        const pulse = front ? 1 + 0.12 * Math.sin(performance.now() / 180) : 1
        const r = base * dpr * pulse

        let c = S.nodeIdle
        if (isTarget) c = breached ? S.agent : contained ? S.jewelSafe : S.jewelIdle
        else if (hot) c = breach ? S.agent : S.nodeHot
        else if (front) c = S.edgeHot
        if (p.node.kind === 'external') c = hot ? S.agent : withAlpha(S.label, 0.7)

        // healing / breach ring on target
        if (isTarget && active && progress >= maxStage - 0.3) {
          const w = (Math.sin(performance.now() / 400) + 1) / 2
          ctx.beginPath()
          ctx.arc(x, y, r + w * 40 * dpr, 0, Math.PI * 2)
          ctx.strokeStyle = breached ? S.agent : S.jewelSafe
          ctx.globalAlpha = (1 - w) * 0.6
          ctx.lineWidth = 2 * dpr
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        // shield on the isolated origin
        if (shielded) {
          ctx.beginPath()
          ctx.arc(x, y, r + 10 * dpr, 0, Math.PI * 2)
          ctx.strokeStyle = S.shield
          ctx.globalAlpha = 0.6 + 0.3 * Math.sin(performance.now() / 120)
          ctx.lineWidth = 2.5 * dpr
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3)
        glow.addColorStop(0, withAlpha(c, 0.42))
        glow.addColorStop(1, withAlpha(c, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, r * 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = c
        ctx.fill()
        if (isOrigin || p.node.host === selectedNode) {
          ctx.strokeStyle = p.node.host === selectedNode ? S.shield : '#ffffff'
          ctx.lineWidth = 1.6 * dpr
          ctx.stroke()
        }

        ctx.font = `${8.5 * dpr}px Consolas, monospace`
        ctx.textAlign = 'center'
        ctx.fillStyle = hot || front ? S.labelHot : S.label
        const short = p.node.host.startsWith('ext') ? 'internet' : p.node.host.split('.').slice(-1)[0]
        ctx.fillText(
          isTarget ? 'CROWN JEWEL' : p.node.kind === 'gateway' ? 'gateway' : `.${short}`,
          x,
          y + r + 12 * dpr,
        )
      }

      // outcome label
      if (contained || breached) {
        const tp = targetPlaced
        if (tp) {
          ctx.fillStyle = breached ? S.agent : S.jewelSafe
          ctx.font = `bold ${12 * dpr}px Calibri, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(breached ? 'BREACH' : 'CONTAINED', PX(tp.x), PY(tp.y) - 34 * dpr)
        }
      }

      // hover tooltip
      const hv = hoverRef.current
      if (hv) {
        const p = posOf.get(hv)
        if (p) {
          const x = PX(p.x)
          const y = PY(p.y)
          const lines = [
            p.node.host,
            `${p.node.kind} · ${p.node.n_flows.toLocaleString()} flows`,
            Number.isFinite(p.stage)
              ? nodeCut(p.stage)
                ? 'on attack path · blocked'
                : nodeHot(p.stage)
                  ? 'compromised'
                  : 'on attack path'
              : `${p.node.n_windows} windows observed`,
          ]
          ctx.font = `${9 * dpr}px Consolas, monospace`
          const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14 * dpr
          const bh = lines.length * 13 * dpr + 10 * dpr
          let bx = x + 12 * dpr
          if (bx + bw > W) bx = x - 12 * dpr - bw
          let by = y - bh - 8 * dpr
          if (by < 0) by = y + 12 * dpr
          ctx.fillStyle = withAlpha('#000000', 0.82)
          ctx.strokeStyle = withAlpha(S.label, 0.4)
          ctx.lineWidth = 1 * dpr
          ctx.beginPath()
          ctx.roundRect(bx, by, bw, bh, 4 * dpr)
          ctx.fill()
          ctx.stroke()
          ctx.textAlign = 'left'
          lines.forEach((l, i) => {
            ctx.fillStyle = i === 0 ? '#ffffff' : S.label
            ctx.fillText(l, bx + 7 * dpr, by + 14 * dpr + i * 13 * dpr)
          })
        }
      }
    }

    drawRef.current = draw
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [network, placed, edges, posOf, active, playhead, horizon, maxStage, maxFlows, interceptStage, host, selectedNode, theme])

  const pick = (e: React.PointerEvent<HTMLCanvasElement>): string | null => {
    const cv = ref.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    // undo the fixed 30px / 24px canvas padding to get plot-space 0..1
    const fx = (e.clientX - rect.left - 30) / Math.max(1, rect.width - 60)
    const fy = (e.clientY - rect.top - 24) / Math.max(1, rect.height - 48)
    let best: string | null = null
    let bd = 0.055
    for (const p of placed) {
      const dist = Math.hypot(fx - p.x, fy - p.y)
      if (dist < bd) {
        bd = dist
        best = p.node.host
      }
    }
    return best
  }

  return (
    <canvas
      ref={ref}
      className="h-full w-full cursor-pointer touch-none"
      onPointerMove={(e) => setHover(pick(e))}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        const h = pick(e)
        setSelectedNode(h === selectedNode ? null : h)
      }}
    />
  )
}
