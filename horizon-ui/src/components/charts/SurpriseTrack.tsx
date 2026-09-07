import { useEffect, useRef } from 'react'
import type { SurpriseSeriesPoint } from '@/lib/types'
import { activePalette } from '@/lib/palette'
import { drawCrosshair, withAlpha } from '@/lib/chartkit'
import { useTheme } from '@/lib/theme'

interface Props {
  series: SurpriseSeriesPoint[]
  heldOut?: { removed_class: string; series: SurpriseSeriesPoint[] } | null
  showHeldOut: boolean
  height?: number
}

/** Surprise (prediction error) over observed history. Attack region shaded; held-out overlay optional. */
export function SurpriseTrack({ series, heldOut, showHeldOut, height = 130 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hoverI = useRef<number | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const theme = useTheme()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const P = activePalette()
      const dpr = window.devicePixelRatio || 1
      const rect = cv.getBoundingClientRect()
      cv.width = rect.width * dpr
      cv.height = rect.height * dpr
      const W = cv.width
      const H = cv.height
      ctx.clearRect(0, 0, W, H)

      const active = showHeldOut && heldOut ? heldOut.series : series
      const all = [...series.map((p) => p.surprise), ...(heldOut?.series.map((p) => p.surprise) ?? [])]
      const mx = Math.max(...all, 1)
      const padT = 8 * dpr
      const padB = 14 * dpr
      const padL = 8 * dpr
      const padR = 8 * dpr
      const plotH = H - padT - padB
      const plotW = W - padL - padR
      const n = active.length
      const xOf = (i: number) => padL + (i / (n - 1)) * plotW
      const yOf = (s: number) => padT + plotH - (s / mx) * plotH
      const lineColor = showHeldOut ? P.teal : P.blue

      const firstAtk = active.findIndex((p) => p.label !== 'benign')
      if (firstAtk >= 0) {
        ctx.fillStyle = withAlpha(P.threat, 0.08)
        ctx.fillRect(xOf(firstAtk), padT, W - padR - xOf(firstAtk), plotH)
        ctx.strokeStyle = withAlpha(P.threat, 0.4)
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(xOf(firstAtk), padT)
        ctx.lineTo(xOf(firstAtk), padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (showHeldOut && heldOut) {
        ctx.strokeStyle = withAlpha(P.ink, 0.18)
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        series.forEach((p, i) => {
          const x = padL + (i / (series.length - 1)) * plotW
          ctx[i ? 'lineTo' : 'moveTo'](x, yOf(p.surprise))
        })
        ctx.stroke()
      }

      ctx.beginPath()
      active.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(p.surprise)))
      ctx.lineTo(xOf(n - 1), padT + plotH)
      ctx.lineTo(xOf(0), padT + plotH)
      ctx.closePath()
      ctx.fillStyle = withAlpha(lineColor, 0.1)
      ctx.fill()

      ctx.beginPath()
      active.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(p.surprise)))
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1.8 * dpr
      ctx.lineJoin = 'round'
      ctx.stroke()

      const thr = mx * 0.6
      ctx.fillStyle = P.threat
      active.forEach((p, i) => {
        if (p.surprise >= thr) {
          ctx.beginPath()
          ctx.arc(xOf(i), yOf(p.surprise), 2.2 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      const hi = hoverI.current
      if (hi != null && hi >= 0 && hi < n) {
        const p = active[hi]
        ctx.fillStyle = lineColor
        ctx.beginPath()
        ctx.arc(xOf(hi), yOf(p.surprise), 3 * dpr, 0, Math.PI * 2)
        ctx.fill()
        drawCrosshair(
          ctx,
          xOf(hi),
          padT,
          padT + plotH,
          [
            { label: `window ${p.window_idx}`, value: '', color: P.ink },
            { label: 'surprise', value: p.surprise.toFixed(2), color: lineColor },
            { label: 'label', value: p.label, color: p.label === 'benign' ? P.safe : P.threat },
          ],
          dpr,
          W,
        )
      }
    }

    drawRef.current = draw
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [series, heldOut, showHeldOut, theme])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const active = showHeldOut && heldOut ? heldOut.series : series
    const frac = (e.clientX - rect.left - 8) / (rect.width - 16)
    const i = Math.round(frac * (active.length - 1))
    const clamped = Math.max(0, Math.min(active.length - 1, i))
    if (clamped !== hoverI.current) {
      hoverI.current = clamped
      drawRef.current()
    }
  }
  const onLeave = () => {
    if (hoverI.current !== null) {
      hoverI.current = null
      drawRef.current()
    }
  }

  return (
    <canvas
      ref={ref}
      style={{ height, width: '100%', display: 'block' }}
      className="touch-none"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    />
  )
}
