import { Panel } from '@/components/Panel'
import { SurpriseTrack } from '@/components/charts/SurpriseTrack'
import { useStore } from '@/store'

export function SurprisePanel() {
  const { surprise, showHeldOut } = useStore()
  if (!surprise) return null
  const ho = surprise.held_out_class

  return (
    <Panel
      label="Surprise timeline · deviation from learned normal"
      live
      id="surprise"
      right={
        ho && (
          <span className="font-mono text-[10px] text-[var(--info)]">
            {showHeldOut ? `${ho.removed_class} held-out of training` : ''}
          </span>
        )
      }
    >
      <SurpriseTrack
        series={surprise.series}
        heldOut={ho ?? null}
        showHeldOut={showHeldOut}
        height={120}
      />
      <p className="mt-1.5 border-t pt-1.5 text-[8.5px] leading-snug text-[var(--dim)]">
        {showHeldOut && ho
          ? ho.note
          : 'Spikes flag behaviour the model of normal cannot account for, labelled or not.'}
      </p>
    </Panel>
  )
}
