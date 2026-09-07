import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { HeroPanel } from '@/components/panels/HeroPanel'
import { MitrePanel } from '@/components/panels/MitrePanel'
import { TrajectoryPanel } from '@/components/panels/TrajectoryPanel'
import { SurprisePanel } from '@/components/panels/SurprisePanel'
import { MetricsPanel } from '@/components/panels/MetricsPanel'
import { ResponsePanel } from '@/components/panels/ResponsePanel'
import { SceneCard } from '@/components/scene/SceneCard'
import { FOCUS_CLUSTER, PANEL_INFO, setFocus, useFocus, type PanelId } from '@/lib/panels'

function render(id: PanelId): ReactNode {
  switch (id) {
    case 'forecast':
      return <HeroPanel initialView="forecast" />
    case 'counterfactual':
      return <HeroPanel initialView="counterfactual" />
    case 'scene':
      return <SceneCard big noExpand />
    case 'mitre':
      return <MitrePanel />
    case 'trajectory':
      return <TrajectoryPanel />
    case 'surprise':
      return <SurprisePanel />
    case 'metrics':
      return <MetricsPanel />
    case 'response':
      return <ResponsePanel />
  }
}

export function FocusOverlay() {
  const focus = useFocus()

  useEffect(() => {
    if (!focus) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [focus])

  if (!focus) return null
  const [featured, ...siblings] = FOCUS_CLUSTER[focus]

  return (
    <div
      className="fixed inset-0 z-50 flex bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-sm"
      onClick={() => setFocus(null)}
    >
      <div
        className="m-auto flex h-[92vh] w-[94vw] max-w-[1600px] gap-4 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative min-w-0 flex-[1.7]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setFocus(null)}
            className="absolute -top-1 right-1 z-10 grid h-7 w-7 place-items-center rounded-md border bg-[var(--surface)] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
          >
            <X size={14} />
          </button>
          <div className="h-full overflow-hidden [&>*]:h-full">{render(featured)}</div>
        </div>
        <div className="flex w-[340px] flex-none flex-col gap-4 overflow-y-auto">
          {siblings.map((id) => (
            <div key={id} className="flex-1">
              <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                {PANEL_INFO[id].title}
              </div>
              {render(id)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
