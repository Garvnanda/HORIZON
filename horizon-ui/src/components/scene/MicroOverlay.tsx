import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getFlows } from '@/lib/api'
import { useStore } from '@/store'
import type { FlowRow, FlowsDoc } from '@/lib/types'

/** Micro (per-host) view: the selected node's real flows around the playhead window. */
export function MicroOverlay() {
  const { network, capture, selectedNode, setSelectedNode, playhead, forecast } = useStore()
  const [doc, setDoc] = useState<FlowsDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setDoc(null)
    setErr(null)
    if (!selectedNode || selectedNode.startsWith('ext')) return
    let alive = true
    getFlows(capture, selectedNode)
      .then((d) => alive && setDoc(d))
      .catch(() => alive && setErr('no flow sample exported for this host'))
    return () => {
      alive = false
    }
  }, [capture, selectedNode])

  if (!selectedNode) return null
  const node = network?.nodes.find((n) => n.host === selectedNode)

  // map the forecast playhead (0..horizon) onto the host's window range
  const t = forecast?.t ?? 0
  const win = t + playhead
  const near = doc?.flows.filter((f) => Math.abs(f.window_idx - win) <= 1) ?? []
  const shown = near.length ? near : (doc?.flows.slice(-14) ?? [])

  return (
    <div className="absolute bottom-2 right-2 z-20 w-[260px] rounded-lg border border-[#22304a] bg-[#0c1626]/95 p-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold text-[#cfe0f5]">{selectedNode}</span>
        <span className="text-[8px] uppercase tracking-wider text-[#6f86a6]">{node?.kind}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setSelectedNode(null)}
          className="ml-auto grid h-4 w-4 place-items-center rounded text-[#6f86a6] hover:text-[#cfe0f5]"
        >
          <X size={11} />
        </button>
      </div>

      {node && (
        <div className="mt-1 flex gap-3 font-mono text-[8.5px] text-[#7f97b8]">
          <span>{node.n_flows.toLocaleString()} flows</span>
          <span>{node.n_windows} windows</span>
        </div>
      )}

      {err ? (
        <p className="mt-2 text-[9px] leading-snug text-[#6f86a6]">{err}</p>
      ) : (
        <>
          <div className="mt-2 text-[8px] uppercase tracking-wider text-[#6f86a6]">
            flows near window +{playhead}
          </div>
          <div className="mt-1 max-h-[128px] space-y-[3px] overflow-y-auto pr-0.5">
            {shown.length === 0 && <div className="text-[9px] text-[#6f86a6]">no flows</div>}
            {shown.map((f, i) => (
              <FlowLine key={i} f={f} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FlowLine({ f }: { f: FlowRow }) {
  const mal = f.label !== 'benign'
  return (
    <div className="flex items-center gap-1.5 font-mono text-[8.5px]">
      <span className={mal ? 'text-[#f0594e]' : 'text-[#57c98a]'}>●</span>
      <span className="w-[92px] truncate text-[#a9bdd6]">{f.dst_ip}</span>
      <span className="w-[34px] text-[#7f97b8]">:{f.dst_port}</span>
      <span className="ml-auto text-[#6f86a6]">{fmtBytes(f.bytes_out + f.bytes_in)}</span>
    </div>
  )
}

function fmtBytes(n: number): string {
  if (n > 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n > 1e3) return `${(n / 1e3).toFixed(0)}k`
  return `${n}`
}
