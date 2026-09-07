import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const draw = () => {
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

      ctx.font = `${8.5 * dpr}px ui-monospace, monospace`
      ctx.fillStyle = 'rgba(238,221,200,0.26)'
      ctx.textAlign = 'right'
      for (const p of [0, 0.5, 1]) {
        const y = yOf(p)
        ctx.strokeStyle = 'rgba(188,130,36,0.09)'
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
        ctx.fillText(`${p * 100}%`, padL - 5 * dpr, y + 3 * dpr)
      }

      if (threshold != null) {
        const ty = yOf(threshold)
        ctx.strokeStyle = 'rgba(238,221,200,0.35)'
        ctx.setLineDash([4 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(padL, ty)
        ctx.lineTo(W - padR, ty)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (appliedAtStep != null) {
        const ax = xOf(appliedAtStep)
        ctx.strokeStyle = 'rgba(90,143,196,0.5)'
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(90,143,196,0.8)'
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

      ctx.fillStyle = 'rgba(238,221,200,0.26)'
      ctx.textAlign = 'center'
      for (let k = 0; k < K; k += 5) ctx.fillText(`+${k}`, xOf(k), H - 4 * dpr)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [curves, threshold, appliedAtStep])

  return <canvas ref={ref} style={{ height: height ?? '100%', width: '100%', display: 'block' }} />
}
