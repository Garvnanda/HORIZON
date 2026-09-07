// Shared canvas-chart helpers: theme-aware colours + a hover crosshair readout.

import { activePalette } from './palette'

/** hex (#rgb / #rrggbb) + 0..1 alpha -> rgba() string. */
export function withAlpha(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Faint grid line colour for the active theme. */
export const gridColor = (a = 0.09) => withAlpha(activePalette().ink, a)

export interface CrosshairEntry {
  label: string
  value: string
  color: string
}

/**
 * Draw a vertical guide at px `x` plus a readout box listing `entries`.
 * Call last, after the series. Coordinates are device pixels; pass `dpr`.
 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
  entries: CrosshairEntry[],
  dpr: number,
  W: number,
) {
  const P = activePalette()
  ctx.save()
  ctx.strokeStyle = withAlpha(P.ink, 0.4)
  ctx.setLineDash([3 * dpr, 3 * dpr])
  ctx.lineWidth = 1 * dpr
  ctx.beginPath()
  ctx.moveTo(x, yTop)
  ctx.lineTo(x, yBottom)
  ctx.stroke()
  ctx.setLineDash([])

  const pad = 6 * dpr
  const lh = 13 * dpr
  ctx.font = `${9.5 * dpr}px Consolas, monospace`
  const bw = Math.max(...entries.map((e) => ctx.measureText(`${e.label} ${e.value}`).width)) + pad * 2 + 8 * dpr
  const bh = entries.length * lh + pad * 2
  let bx = x + 8 * dpr
  if (bx + bw > W) bx = x - 8 * dpr - bw
  const by = yTop + 4 * dpr

  ctx.fillStyle = withAlpha(P.surface, 0.96)
  ctx.strokeStyle = withAlpha(P.ink, 0.18)
  ctx.lineWidth = 1 * dpr
  roundRect(ctx, bx, by, bw, bh, 4 * dpr)
  ctx.fill()
  ctx.stroke()

  ctx.textAlign = 'left'
  entries.forEach((e, i) => {
    const ty = by + pad + lh * i + lh * 0.72
    ctx.fillStyle = e.color
    ctx.fillRect(bx + pad, ty - 6 * dpr, 5 * dpr, 5 * dpr)
    ctx.fillStyle = P.inkDim
    ctx.fillText(e.label, bx + pad + 10 * dpr, ty)
    ctx.fillStyle = P.ink
    ctx.textAlign = 'right'
    ctx.fillText(e.value, bx + bw - pad, ty)
    ctx.textAlign = 'left'
  })
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
