import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Maximize2 } from 'lucide-react'
import { cn } from 'cn'
import { PANEL_INFO, setFocus, type PanelId } from '@/lib/panels'

interface Props {
  label: string
  live?: boolean
  className?: string
  right?: ReactNode
  children: ReactNode
  /** enables the (i) explain popover and the expand-to-fullscreen control */
  id?: PanelId
  /** hide the expand control (e.g. when already rendered inside the focus overlay) */
  noExpand?: boolean
}

export function Panel({ label, live, className, right, children, id, noExpand }: Props) {
  const info = id ? PANEL_INFO[id] : null
  const [showInfo, setShowInfo] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showInfo) return
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setShowInfo(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [showInfo])

  return (
    <div
      className={cn(
        'group/panel rounded-xl border bg-[var(--surface)] p-4',
        'shadow-[0_1px_2px_rgba(16,36,58,0.04),0_8px_24px_rgba(16,36,58,0.07)]',
        'transition-colors hover:border-[var(--line-strong)]',
        className,
      )}
    >
      <div className="relative mb-3 flex items-center gap-2">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-[var(--bronze)]">
          {label}
        </span>

        {info && (
          <button
            type="button"
            aria-label={`About: ${info.title}`}
            onClick={() => setShowInfo((v) => !v)}
            className="grid h-4 w-4 place-items-center rounded text-[var(--ink-faint)] transition-colors hover:text-[var(--blue)]"
          >
            <Info size={11} />
          </button>
        )}

        {right}

        <div className="ml-auto flex items-center gap-1.5">
          {live && (
            <span
              className="h-[5px] w-[5px] rounded-full bg-[var(--teal)]"
              style={{ boxShadow: '0 0 0 3px var(--teal-soft)', animation: 'pip 1.4s infinite' }}
            />
          )}
          {id && !noExpand && (
            <button
              type="button"
              aria-label={`Expand ${info?.title ?? label}`}
              onClick={() => setFocus(id)}
              className="grid h-4 w-4 place-items-center rounded text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--blue)] group-hover/panel:opacity-100"
            >
              <Maximize2 size={11} />
            </button>
          )}
        </div>

        {showInfo && info && (
          <div
            ref={popRef}
            className="absolute left-0 top-6 z-40 w-[260px] rounded-lg border bg-[var(--surface)] p-3 text-left shadow-[0_8px_28px_rgba(16,36,58,0.18)]"
          >
            <div className="text-[10px] font-bold text-[var(--ink)]">{info.title}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-dim)]">{info.what}</p>
            <p className="mt-2 border-t pt-2 text-[10px] italic leading-relaxed text-[var(--ink-dim)]">
              Say: “{info.say}”
            </p>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
