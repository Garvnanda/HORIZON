import { useEffect, useRef } from 'react'

/**
 * 2D canvas fallback for NetworkScene — used when WebGL is unavailable or the
 * context is lost (projectors, VMs, locked-down machines). Same kill-chain,
 * same palette, no GPU dependency.
 */

interface Node {
  id: string
  label: string
  x: number
  y: number
  type: 'threat' | 'edge' | 'host' | 'jewel'
  anno?: string
}

const NODES: Node[] = [
  { id: 'atk', label: 'Attacker', x: 0.08, y: 0.5, type: 'threat' },
  { id: 'gw', label: 'Gateway', x: 0.24, y: 0.46, type: 'edge' },
  { id: 'ws1', label: 'WS-A', x: 0.4, y: 0.24, type: 'host', anno: 'Dropbox ↓' },
  { id: 'ws2', label: 'WS-B', x: 0.4, y: 0.72, type: 'host' },
  { id: 'srv', label: 'Server', x: 0.58, y: 0.3, type: 'host', anno: 'NMAP scan' },
  { id: 'dc', label: 'DC', x: 0.58, y: 0.66, type: 'host' },
  { id: 'c2', label: 'C2 relay', x: 0.76, y: 0.46, type: 'host', anno: 'beacon' },
  { id: 'core', label: 'Crown Jewel', x: 0.93, y: 0.5, type: 'jewel' },
]
const EDGES: [string, string][] = [
  ['atk', 'gw'], ['gw', 'ws1'], ['gw', 'ws2'], ['ws1', 'srv'],
  ['ws2', 'dc'], ['srv', 'c2'], ['dc', 'c2'], ['c2', 'core'],
]
const KILL_PATH = ['atk', 'gw', 'ws1', 'srv', 'c2', 'core']
const COLOR = { threat: '#c8422e', edge: '#cd7f32', host: '#8a6f45', jewel: '#5a8fc4' }
const byId = (id: string) => NODES.find((n) => n.id === id)!

interface Props {
  progression: number
  shielded: boolean
}

export function NetworkSceneFallback({ progression, shielded }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const frontIndex = Math.round(progression * (KILL_PATH.length - 2))

    const draw = (time: number) => {
      const dpr = window.devicePixelRatio || 1
      const rect = cv.getBoundingClientRect()
      cv.width = rect.width * dpr
      cv.height = rect.height * dpr
      const W = cv.width
      const H = cv.height
      const pad = 60 * dpr
      const px = (n: Node) => pad + n.x * (W - 2 * pad)
      const py = (n: Node) => pad + n.y * (H - 2 * pad)
      ctx.clearRect(0, 0, W, H)

      for (const [a, b] of EDGES) {
        const A = byId(a)
        const B = byId(b)
        const ia = KILL_PATH.indexOf(a)
        const ib = KILL_PATH.indexOf(b)
        const onPath = ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1
        const hot = onPath && Math.min(ia, ib) < frontIndex && !shielded
        const pred = onPath && Math.min(ia, ib) >= frontIndex && !shielded
        ctx.beginPath()
        ctx.moveTo(px(A), py(A))
        ctx.lineTo(px(B), py(B))
        ctx.strokeStyle = hot ? '#f0b93a' : pred ? '#8a6020' : '#33280f'
        ctx.lineWidth = (hot ? 2.4 : pred ? 1.6 : 0.9) * dpr
        if (pred) ctx.setLineDash([5 * dpr, 4 * dpr])
        ctx.stroke()
        ctx.setLineDash([])

        // travelling particle on hot / path edges
        if (hot || onPath) {
          const t = (time / (hot ? 1400 : 3200) + ia * 0.13) % 1
          const x = px(A) + (px(B) - px(A)) * t
          const y = py(A) + (py(B) - py(A)) * t
          ctx.beginPath()
          ctx.arc(x, y, (hot ? 3 : 1.8) * dpr, 0, Math.PI * 2)
          ctx.fillStyle = hot ? '#f0b93a' : 'rgba(201,180,140,0.5)'
          ctx.fill()
        }
      }

      const hotNodes = new Set(KILL_PATH.slice(0, Math.max(0, frontIndex + 1)))
      const predNodes = new Set(KILL_PATH.slice(frontIndex + 1, frontIndex + 3))
      for (const n of NODES) {
        const isHot = (hotNodes.has(n.id) || predNodes.has(n.id)) && !shielded
        const isShield = shielded && n.type === 'jewel'
        const base = n.type === 'jewel' ? 13 : n.type === 'threat' ? 11 : 9
        const pulse = 1 + 0.08 * Math.sin(time / 500 + n.x * 8)
        const r = base * dpr * pulse
        const c = isShield ? '#4e9964' : isHot ? '#f0b93a' : COLOR[n.type]

        const g = ctx.createRadialGradient(px(n), py(n), r * 0.3, px(n), py(n), r * 3)
        g.addColorStop(0, `${c}${isHot || isShield ? '55' : '22'}`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px(n), py(n), r * 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.arc(px(n), py(n), r, 0, Math.PI * 2)
        ctx.fillStyle = c
        ctx.fill()
        ctx.strokeStyle = isHot || isShield ? c : 'rgba(140,100,30,0.4)'
        ctx.lineWidth = 1.4 * dpr
        ctx.stroke()

        ctx.font = `${10 * dpr}px ui-monospace, monospace`
        ctx.textAlign = 'center'
        ctx.fillStyle = isHot ? '#f0b93a' : 'rgba(201,189,166,0.6)'
        ctx.fillText(n.label, px(n), py(n) + r + 15 * dpr)
        if (n.anno && isHot) {
          ctx.fillStyle = '#e0a355'
          ctx.font = `italic ${9 * dpr}px ui-monospace, monospace`
          ctx.fillText(n.anno, px(n), py(n) - r - 8 * dpr)
        }
      }

      raf.current = requestAnimationFrame(draw)
    }

    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [progression, shielded])

  return <canvas ref={ref} className="h-full w-full" />
}
