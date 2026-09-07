import { useEffect, useRef } from 'react'
import { activePalette } from '@/lib/palette'
import { drawCrosshair, gridColor, withAlpha } from '@/lib/chartkit'
import { useTheme } from '@/lib/theme'

export interface Curve {
  label: string
  values: number[]
  color: string
  dashed?: boolean
}

interface Props {
  curves: Curve[]
  threshold?: number
  appliedAtStep?: number | null
  /** fixed pixel height; omit to fill the parent */
  height?: number
}

/** Small shared-axis probability chart (0..1). Used for the counterfactual comparison. */
export function MiniCurves({ curves, threshold, appliedAtStep, height }: Props) {
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
      const dpr = window.devicePixelRatio || 1
      const rect = cv.getBoundingClientRect()
      cv.width = rect.width * dpr
      cv.height = rect.height * dpr
      const W = cv.width
      const H = cv.height
      ctx.clearRect(0, 0, W, H)

      const padL = 34 * dpr
      const padR = 10 * dpr
      const padT = 10 * dpr
      const padB = 16 * dpr
      const plotH = H - padT - padB
      const plotW = W - padL - padR
      const K = Math.max(...curves.map((c) => c.values.length), 1)
      const yOf = (p: number) => padT + plotH - Math.max(0, Math.min(1, p)) * plotH
      const xOf = (k: number) => padL + (k / (K - 1)) * plotW

      ctx.font = `${8.5 * dpr}px Consolas, monospace`
      ctx.fillStyle = P.inkFaint
      ctx.textAlign = 'right'
      for (const p of [0, 0.5, 1]) {
        const y = yOf(p)
        ctx.strokeStyle = gridColor()
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
        ctx.fillText(`${p * 100}%`, padL - 5 * dpr, y + 3 * dpr)
      }

      if (threshold != null) {
        const ty = yOf(threshold)
        ctx.strokeStyle = withAlpha(P.ink, 0.3)
        ctx.setLineDash([4 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(padL, ty)
        ctx.lineTo(W - padR, ty)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (appliedAtStep != null) {
        const ax = xOf(appliedAtStep)
        ctx.strokeStyle = withAlpha(P.teal, 0.53)
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = P.tealDeep
        ctx.textAlign = 'left'
        ctx.fillText('action', ax + 3 * dpr, padT + 9 * dpr)
      }

      for (const c of curves) {
        ctx.beginPath()
        c.values.forEach((v, k) => ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(v)))
        ctx.strokeStyle = c.color
        ctx.lineWidth = 2.2 * dpr
        ctx.lineJoin = 'round'
        if (c.dashed) ctx.setLineDash([5 * dpr, 3 * dpr])
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = P.inkFaint
      ctx.textAlign = 'center'
      for (let k = 0; k < K; k += 5) ctx.fillText(`+${k}`, xOf(k), H - 4 * dpr)

      const hk = hoverK.current
      if (hk != null && hk >= 0 && hk < K) {
        const entries = [{ label: `+${hk} min`, value: '', color: P.ink }]
        for (const c of curves) {
          const v = c.values[Math.min(hk, c.values.length - 1)]
          if (v != null) entries.push({ label: c.label, value: `${(v * 100).toFixed(0)}%`, color: c.color })
          ctx.fillStyle = c.color
          ctx.beginPath()
          ctx.arc(xOf(hk), yOf(v ?? 0), 3 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
        drawCrosshair(ctx, xOf(hk), padT, padT + plotH, entries, dpr, W)
      }
    }

    drawRef.current = draw
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [curves, threshold, appliedAtStep, theme])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const K = Math.max(...curves.map((c) => c.values.length), 1)
    const frac = (e.clientX - rect.left - 34) / (rect.width - 44)
    const k = Math.round(frac * (K - 1))
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
      style={{ height: height ?? '100%', width: '100%', display: 'block' }}
      className="touch-none"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    />
  )
}
