import { useEffect, useRef } from 'react'

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
}

const AMBER = '#f0b93a'
const THREAT = '#c8422e'
const SAFE = '#4e9964'
const DIM = 'rgba(238,221,200,0.26)'

function laneColor(v: number): string {
  if (v > 0.66) return THREAT
  if (v > 0.33) return AMBER
  return SAFE
}

/** The forecast cone — the centrepiece. History (left) → now → 50 imagined futures (right). */
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
}: Props) {
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

      // y grid + labels
      ctx.font = `${9 * dpr}px ui-monospace, monospace`
      ctx.fillStyle = DIM
      ctx.textAlign = 'right'
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const y = yOf(p)
        ctx.strokeStyle = 'rgba(188,130,36,0.09)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(W - padR, y)
        ctx.stroke()
        ctx.fillText(`${(p * 100).toFixed(0)}%`, padL - 6 * dpr, y + 3 * dpr)
      }

      // forecast region tint
      ctx.fillStyle = 'rgba(218,165,32,0.04)'
      ctx.fillRect(nowX, padT, fW, plotH)

      // history surprise context (left of now), normalised & dimmed
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
      ctx.fillStyle = 'rgba(240,185,58,0.10)'
      ctx.fill()

      // sample trajectories
      const shown = samples.slice(0, nSamples)
      const op = Math.max(0.05, Math.min(0.16, 6 / shown.length))
      for (const traj of shown) {
        ctx.beginPath()
        traj.forEach((v, k) => ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(v)))
        ctx.strokeStyle = laneColor(traj[traj.length - 1])
        ctx.globalAlpha = op
        ctx.lineWidth = 1 * dpr
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // p_frac headline curve
      ctx.beginPath()
      pFrac.forEach((v, k) => ctx[k ? 'lineTo' : 'moveTo'](xOf(k), yOf(v)))
      ctx.strokeStyle = AMBER
      ctx.lineWidth = 2.6 * dpr
      ctx.lineJoin = 'round'
      ctx.shadowColor = AMBER
      ctx.shadowBlur = 8 * dpr
      ctx.stroke()
      ctx.shadowBlur = 0

      // threshold
      const ty = yOf(threshold)
      ctx.strokeStyle = 'rgba(238,221,200,0.4)'
      ctx.setLineDash([5 * dpr, 4 * dpr])
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(nowX, ty)
      ctx.lineTo(W - padR, ty)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(238,221,200,0.5)'
      ctx.textAlign = 'left'
      ctx.fillText(`threshold ${(threshold * 100).toFixed(0)}%`, nowX + 4 * dpr, ty - 4 * dpr)

      // now divider
      ctx.strokeStyle = 'rgba(240,185,58,0.9)'
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      ctx.moveTo(nowX, padT)
      ctx.lineTo(nowX, padT + plotH)
      ctx.stroke()
      ctx.fillStyle = AMBER
      ctx.textAlign = 'center'
      ctx.fillText('NOW', nowX, padT + plotH + 14 * dpr)

      // attack onset marker (demo)
      if (demoMode && attackOnset != null && attackOnset < K) {
        const ax = xOf(attackOnset)
        ctx.strokeStyle = 'rgba(200,66,46,0.55)'
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(200,66,46,0.85)'
        ctx.fillText('attack begins', ax, padT + plotH + 14 * dpr)
      }

      // alert marker + lead-time annotation
      if (firedAtStep != null) {
        const fx = xOf(firedAtStep)
        ctx.fillStyle = AMBER
        ctx.beginPath()
        ctx.arc(fx, yOf(pFrac[firedAtStep]), 4 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(240,185,58,0.5)'
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        ctx.moveTo(fx, padT)
        ctx.lineTo(fx, padT + plotH)
        ctx.stroke()
        if (demoMode && attackOnset != null) {
          const lead = attackOnset - firedAtStep
          ctx.fillStyle = AMBER
          ctx.textAlign = 'center'
          ctx.font = `700 ${10 * dpr}px var(--font-sans, sans-serif)`
          ctx.fillText(
            lead > 0 ? `alert fired ${lead} min early` : 'alert fired',
            (fx + (attackOnset != null ? xOf(attackOnset) : fx)) / 2,
            padT + 10 * dpr,
          )
        }
      }

      // x ticks
      ctx.fillStyle = DIM
      ctx.font = `${9 * dpr}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (let k = 0; k < K; k += 5) ctx.fillText(`+${k}`, xOf(k), padT + plotH + 14 * dpr)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [samples, pFrac, spread, threshold, firedAtStep, attackOnset, historySurprise, nSamples, demoMode])

  return <canvas ref={ref} className="h-full w-full" />
}
