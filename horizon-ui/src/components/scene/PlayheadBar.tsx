import { Pause, Play, RotateCcw } from 'lucide-react'
import { useStore } from '@/store'

/** Scrub / play control for the scene, shared with the forecast cone marker. */
export function PlayheadBar() {
  const { forecast, playhead, playing, setPlayhead, setPlaying } = useStore()
  const horizon = forecast?.forecast.horizon ?? 20
  const atEnd = playhead >= horizon - 1

  return (
    <div className="flex items-center gap-2.5 border-t border-[#1c2c44] px-3 py-1.5">
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => {
          if (atEnd) setPlayhead(0)
          setPlaying(!playing)
        }}
        className="grid h-6 w-6 place-items-center rounded text-[#9fd0ff] transition-colors hover:bg-white/5"
      >
        {playing ? <Pause size={13} /> : atEnd ? <RotateCcw size={12} /> : <Play size={13} />}
      </button>
      <input
        type="range"
        min={0}
        max={horizon - 1}
        value={playhead}
        onChange={(e) => {
          setPlaying(false)
          setPlayhead(Number(e.target.value))
        }}
        className="h-1 flex-1 cursor-pointer accent-[#e0a53a]"
      />
      <span className="w-[62px] flex-none text-right font-mono text-[9px] text-[#7f97b8]">
        +{playhead} / {horizon - 1} min
      </span>
    </div>
  )
}
