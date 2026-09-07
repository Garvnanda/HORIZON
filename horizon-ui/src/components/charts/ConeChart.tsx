import { useEffect, useRef } from 'react'
import { activePalette } from '@/lib/palette'
import { drawCrosshair, gridColor, withAlpha } from '@/lib/chartkit'
import { useTheme } from '@/lib/theme'

interface Props {
  samples: number[][]
  pFrac: number[]
  spread: number[]
  threshold: number
  firedAtStep: number | null
  attackOnset?: number | null
  historySurprise?: number[]
  nSamples: number
  demoMode: boolean
  /** shared scene playhead, forecast-step index; draws a marker */
  playhead?: number | null
}

function laneColor(v: number, P: ReturnType<typeof activePalette>): string {
  if (v > 0.66) return P.threat
  if (v > 0.33) return '#e0872e'
  return P.safe
}

/** The forecast cone: the centrepiece. History (left), now, 50 imagined futures (right). */
export function ConeChart({
  samples,
  pFrac,
  spread,
  threshold,
  firedAtStep,
  attackOnset,
  historySurprise = [],
  nSamples,
  demoMode,
  playhead,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hoverK = useRef<number | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const theme = useTheme()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const P = activePalette()
      const CURVE = P.blue
      const ACCENT = P.teal
      const DIM = P.inkFaint
      const dpr = window.devicePixelRatio || 1
      const rect = cv.getBoundingClientRect()
      cv.width = rect.width * dpr
      cv.height = rect.height * dpr
      const W = cv.width
      const H = cv.height
      ctx.clearRect(0, 0, W, H)

      const padT = 18 * dpr
      const padB = 26 * dpr
      const padL = 44 * dpr
      const padR = 14 * dpr
      const plotH = H - padT - padB
      const nowX = padL + (W - padL - padR) * 0.3
      const fW = W - padR - nowX
      const K = pFrac.length

      const yOf = (p: number) => padT + plotH - Math.max(0, Math.min(1, p)) * plotH
      const xOf = (k: number) => nowX + (k / (K - 1)) * fW

      ctx.font = `${9 * dpr}px ui-monospace, monospace`
      ctx.fillStyle = DIM
      ctx.textAlign = 'right'
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const y = yOf(p)
        ctx.strokeStyle = gridColor()
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
        ctx.fillText(`${(p * 100).toFixed(0)}%`, padL - 6 * dpr, y + 3 * dpr)
      }

      // forecast region tint
      ctx.fillStyle = withAlpha(CURVE, 0.04)
      ctx.fillRect(nowX, padT, fW, plotH)

      // history surprise context (left of now)
      if (historySurprise.length > 1) {
        const mx = Math.max(...historySurprise, 1)
        ctx.strokeStyle = DIM
        ctx.lineWidth = 1.4 * dpr
        ctx.beginPath()
        historySurprise.forEach((s, i) => {
          const x = padL + (i / (historySurprise.length - 1)) * (nowX - padL)
          const y = padT + plotH - (s / mx) * plotH * 0.6
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        })
        ctx.stroke()
        ctx.fillStyle = DIM
        ctx.textAlign = 'left'
        ctx.fillText('observed · surprise', padL, padT - 6 * dpr)
      }

      // spread band around p_frac
      ctx.beginPath()
      for (let k = 0; k < K; k++) ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(pFrac[k] + (spread[k] ?? 0)))
      for (let k = K - 1; k >= 0; k--) ctx.lineTo(xOf(k), yOf(pFrac[k] - (spread[k] ?? 0)))
      ctx.closePath()
      ctx.fillStyle = withAlpha(CURVE, 0.12)
      ctx.fill()

      // sample trajectories
      const shown = samples.slice(0, nSamples)
      const op = Math.max(0.04, Math.min(0.12, 4.5 / shown.length))
      for (const traj of shown) {
        ctx.beginPath()
        traj.forEach((v, k) => ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(v)))
        ctx.strokeStyle = laneColor(traj[traj.length - 1], P)
        ctx.globalAlpha = op
        ctx.lineWidth = 1 * dpr
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // p_frac headline curve
      ctx.beginPath()
      pFrac.forEach((v, k) => ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(v)))
      ctx.strokeStyle = CURVE
      ctx.lineWidth = 2.8 * dpr
      ctx.lineJoin = 'round'
      ctx.stroke()

      // threshold
      const ty = yOf(threshold)
      ctx.strokeStyle = withAlpha(P.ink, 0.35)
      ctx.setLineDash([5 * dpr, 4 * dpr])
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(nowX, ty)
      ctx.lineTo(W - padR, ty)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = P.inkDim
      ctx.textAlign = 'left'
      ctx.fillText(`threshold ${(threshold * 100).toFixed(0)}%`, nowX + 4 * dpr, ty - 4 * dpr)

      // now divider
      ctx.strokeStyle = P.ink
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      ctx.moveTo(nowX, padT)
      ctx.lineTo(nowX, padT + plotH)
      ctx.stroke()
      ctx.fillStyle = P.ink
      ctx.textAlign = 'center'
      ctx.fillText('NOW', nowX, padT + plotH + 14 * dpr)

      // attack onset marker (demo)
      if (demoMode && attackOnset != null && attackOnset < K) {
        const ax = xOf(attackOnset)
        ctx.strokeStyle = withAlpha(P.threat, 0.55)
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = withAlpha(P.threat, 0.85)
        ctx.fillText('attack begins', ax, padT + plotH + 14 * dpr)
      }

      // alert marker + lead-time annotation
      if (firedAtStep != null) {
        const fx = xOf(firedAtStep)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.moveTo(fx, padT)
        ctx.lineTo(fx, padT + plotH)
        ctx.stroke()
        ctx.fillStyle = ACCENT
        ctx.beginPath()
        ctx.arc(fx, yOf(pFrac[firedAtStep]), 4.5 * dpr, 0, Math.PI * 2)
        ctx.fill()
        if (demoMode && attackOnset != null) {
          const lead = attackOnset - firedAtStep
          ctx.fillStyle = ACCENT
          ctx.textAlign = 'center'
          ctx.font = `700 ${10 * dpr}px Calibri, sans-serif`
          ctx.fillText(
            lead > 0 ? `alert fired ${lead} min early` : 'alert fired',
            (fx + xOf(attackOnset)) / 2,
            padT + 10 * dpr,
          )
        }
      }

      // shared playhead marker
      if (playhead != null && playhead >= 0 && playhead < K) {
        const px = xOf(playhead)
        ctx.strokeStyle = withAlpha(P.ink, 0.55)
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        ctx.moveTo(px, padT)
        ctx.lineTo(px, padT + plotH)
        ctx.stroke()
        ctx.fillStyle = P.ink
        ctx.beginPath()
        ctx.moveTo(px - 4 * dpr, padT)
        ctx.lineTo(px + 4 * dpr, padT)
        ctx.lineTo(px, padT + 5 * dpr)
        ctx.closePath()
        ctx.fill()
      }

      // x ticks
      ctx.fillStyle = DIM
      ctx.font = `${9 * dpr}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (let k = 0; k < K; k += 5) ctx.fillText(`+${k}`, xOf(k), padT + plotH + 14 * dpr)

      // hover crosshair
      const hk = hoverK.current
      if (hk != null && hk >= 0 && hk < K) {
        const entries = [
          { label: `+${hk} min`, value: '', color: P.ink },
          { label: 'p_frac', value: `${(pFrac[hk] * 100).toFixed(0)}%`, color: CURVE },
          { label: 'spread', value: `±${((spread[hk] ?? 0) * 100).toFixed(0)}%`, color: DIM },
          { label: 'threshold', value: `${(threshold * 100).toFixed(0)}%`, color: withAlpha(P.ink, 0.5) },
        ]
        ctx.fillStyle = CURVE
        ctx.beginPath()
        ctx.arc(xOf(hk), yOf(pFrac[hk]), 3.5 * dpr, 0, Math.PI * 2)
        ctx.fill()
        drawCrosshair(ctx, xOf(hk), padT, padT + plotH, entries, dpr, W)
      }
    }

    drawRef.current = draw
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [samples, pFrac, spread, threshold, firedAtStep, attackOnset, historySurprise, nSamples, demoMode, playhead, theme])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const fracX = (e.clientX - rect.left) / rect.width
    const K = pFrac.length
    // forecast region starts at 0.3 of the plot (matches nowX)
    const padLfrac = 44 / rect.width
    const nowFrac = padLfrac + (1 - padLfrac - 14 / rect.width) * 0.3
    if (fracX < nowFrac) {
      if (hoverK.current !== null) {
        hoverK.current = null
        drawRef.current()
      }
      return
    }
    const k = Math.round(((fracX - nowFrac) / (1 - nowFrac - 14 / rect.width)) * (K - 1))
    const clamped = Math.max(0, Math.min(K - 1, k))
    if (clamped !== hoverK.current) {
      hoverK.current = clamped
      drawRef.current()
    }
  }

  const onLeave = () => {
    if (hoverK.current !== null) {
      hoverK.current = null
      drawRef.current()
    }
  }

  return (
    <canvas
      ref={ref}
      className="h-full w-full touch-none"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    />
  )
}
