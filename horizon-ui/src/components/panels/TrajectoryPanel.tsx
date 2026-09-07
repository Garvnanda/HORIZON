import { Panel } from '@/components/Panel'
import { useStore } from '@/store'
import { FEATURE_KEYS } from '@/lib/types'
import { FEATURE_LABEL, fmtFeature } from '@/lib/format'
import { cn } from 'cn'

const STEPS = 4

export function TrajectoryPanel() {
  const { forecast, demoMode } = useStore()
  if (!forecast) return null
  const steps = forecast.forecast.trajectory_mean.slice(0, STEPS)

  return (
    <Panel label="Predicted trajectory · what the model wrote down" live id="trajectory">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[9.5px]">
          <thead>
            <tr className="text-[var(--cream-dim)]">
              <th className="py-1 pr-2 text-left font-medium">feature</th>
              {steps.map((s) => (
                <th key={s.step} className="px-1.5 py-1 text-right font-mono font-medium">
                  +{s.step}m
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_KEYS.map((key) => (
              <tr key={key} className="border-t border-[var(--border)]">
                <td className="py-[3px] pr-2 text-[var(--cream-dim)]">{FEATURE_LABEL[key]}</td>
                {steps.map((s) => {
                  const pred = s.features[key]
                  const act = s.actual?.[key]
                  const diverge =
                    demoMode && act != null && Math.abs(pred - act) / (Math.abs(act) + 1e-6) > 0.5
                  return (
                    <td
                      key={s.step}
                      className={cn(
                        'px-1.5 py-[3px] text-right font-mono',
                        diverge ? 'text-[var(--amber-hot)]' : 'text-[var(--cream)]',
                      )}
                      title={demoMode && act != null ? `actual ${fmtFeature(key, act)}` : undefined}
                    >
                      {fmtFeature(key, pred)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {demoMode && (
        <p className="mt-1.5 border-t pt-1.5 text-[8.5px] text-[var(--dim)]">
          Amber = predicted &gt;50% off actual. Hover a cell for the actual value.
        </p>
      )}
    </Panel>
  )
}
