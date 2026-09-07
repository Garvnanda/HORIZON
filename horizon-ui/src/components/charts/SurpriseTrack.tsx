import { useEffect, useRef } from 'react'
import type { SurpriseSeriesPoint } from '@/lib/types'

interface Props {
  series: SurpriseSeriesPoint[]
  heldOut?: { removed_class: string; series: SurpriseSeriesPoint[] } | null
  showHeldOut: boolean
  height?: number
}

/** Surprise (prediction error) over observed history. Attack region shaded; held-out overlay optional. */
export function SurpriseTrack({ series, heldOut, showHeldOut, height = 130 }: Props) {
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

      // attack region shading
      const firstAtk = active.findIndex((p) => p.label !== 'benign')
      if (firstAtk >= 0) {
        ctx.fillStyle = 'rgba(200,66,46,0.08)'
        ctx.fillRect(xOf(firstAtk), padT, W - padR - xOf(firstAtk), plotH)
        ctx.strokeStyle = 'rgba(200,66,46,0.4)'
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(xOf(firstAtk), padT)
        ctx.lineTo(xOf(firstAtk), padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // faint baseline series when overlay is on
      if (showHeldOut && heldOut) {
        ctx.strokeStyle = 'rgba(238,221,200,0.18)'
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        series.forEach((p, i) => {
          const x = padL + (i / (series.length - 1)) * plotW
          ctx[i ? 'lineTo' : 'moveTo'](x, yOf(p.surprise))
        })
        ctx.stroke()
      }

      // main series (area + line)
      ctx.beginPath()
      active.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(p.surprise)))
      ctx.lineTo(xOf(n - 1), padT + plotH)
      ctx.lineTo(xOf(0), padT + plotH)
      ctx.closePath()
      ctx.fillStyle = 'rgba(240,185,58,0.08)'
      ctx.fill()

      ctx.beginPath()
      active.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(p.surprise)))
      ctx.strokeStyle = showHeldOut ? '#5a8fc4' : '#f0b93a'
      ctx.lineWidth = 1.8 * dpr
      ctx.lineJoin = 'round'
      ctx.stroke()

      // spike dots
      const thr = mx * 0.6
      ctx.fillStyle = '#c8422e'
      active.forEach((p, i) => {
        if (p.surprise >= thr) {
          ctx.beginPath()
          ctx.arc(xOf(i), yOf(p.surprise), 2.2 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [series, heldOut, showHeldOut])

  return <canvas ref={ref} style={{ height, width: '100%', display: 'block' }} />
}
