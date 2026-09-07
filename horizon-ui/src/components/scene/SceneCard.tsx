import { useEffect, useRef, useState } from 'react'
import { Info, Maximize2 } from 'lucide-react'
import { NetworkScene } from '@/components/scene/NetworkScene'
import { MicroOverlay } from '@/components/scene/MicroOverlay'
import { PlayheadBar } from '@/components/scene/PlayheadBar'
import { useStore } from '@/store'
import { PANEL_INFO, setFocus } from '@/lib/panels'

/**
 * The network scene card: header (explain + expand), the macro graph, the micro
 * overlay, and the playhead control. `big` fills the parent (focus overlay).
 */
export function SceneCard({ big = false, noExpand = false }: { big?: boolean; noExpand?: boolean }) {
  const { cfAction, alert, forecast, playhead } = useStore()
  const [showInfo, setShowInfo] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const info = PANEL_INFO.scene

  useEffect(() => {
    if (!showInfo) return
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showInfo])

  const peak = forecast ? Math.max(...forecast.forecast.p_frac) : 0
  const active = peak > 0.12
  const acting = cfAction !== 'do_nothing' && alert?.fired
  const caption = !active
    ? 'no predicted intrusion for this host'
    : acting
      ? `defence acts · ${cfAction === 'isolate_host' ? 'isolate' : 'rate-limit'} at +${alert?.firedAtStep}m`
      : `no action · forecast reaches the crown jewel at +${playhead}m`

  return (
    <div
      className={
        'group/scene relative flex flex-col overflow-hidden rounded-xl border border-[#1c2c44] bg-[#0b1424] ' +
        (big ? 'h-full' : 'h-[340px] flex-none') +
        ' shadow-[0_1px_2px_rgba(16,36,58,0.04),0_8px_24px_rgba(16,36,58,0.07)]'
      }
    >
      <div className="relative z-10 flex items-center gap-2 px-3 pt-2.5">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-[#7f97b8]">
          Network · predicted kill chain
        </span>
        <button
          type="button"
          aria-label="About: network scene"
          onClick={() => setShowInfo((v) => !v)}
          className="grid h-4 w-4 place-items-center rounded text-[#5f7290] transition-colors hover:text-[#9fd0ff]"
        >
          <Info size={11} />
        </button>
        <span className="ml-auto truncate font-mono text-[8px] text-[#5f7290]">{caption}</span>
        {!noExpand && (
          <button
            type="button"
            aria-label="Expand network scene"
            onClick={() => setFocus('scene')}
            className="grid h-4 w-4 flex-none place-items-center rounded text-[#5f7290] opacity-0 transition-opacity hover:text-[#9fd0ff] group-hover/scene:opacity-100"
          >
            <Maximize2 size={11} />
          </button>
        )}
        {showInfo && (
          <div
            ref={popRef}
            className="absolute left-3 top-8 z-40 w-[260px] rounded-lg border border-[#22304a] bg-[#0e1a2e] p-3 text-left shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
          >
            <div className="text-[10px] font-bold text-[#cfe0f5]">{info.title}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-[#8fa6c4]">{info.what}</p>
            <p className="mt-2 border-t border-[#22304a] pt-2 text-[10px] italic leading-relaxed text-[#8fa6c4]">
              Say: “{info.say}”
            </p>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <NetworkScene />
        <MicroOverlay />
      </div>
      <PlayheadBar />
    </div>
  )
}
