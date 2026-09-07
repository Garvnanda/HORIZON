import { useState } from 'react'
import { Panel } from '@/components/Panel'
import { ConeChart } from '@/components/charts/ConeChart'
import { MiniCurves } from '@/components/charts/MiniCurves'
import { useStore } from '@/store'
import { cn } from 'cn'

const ACTION_LABEL: Record<string, string> = {
  isolate_host: 'Isolate host',
  rate_limit: 'Rate-limit source',
  do_nothing: 'Do nothing',
}

type View = 'forecast' | 'counterfactual'

export function HeroPanel() {
  const { forecast, threshold, alert, nSamples, demoMode, cfAction, current } = useStore()
  const [view, setView] = useState<View>('forecast')
  if (!forecast) return null
  const f = forecast.forecast
  const onset = forecast.ground_truth?.first_attack_window ?? null
  const doNothing = forecast.counterfactuals.do_nothing.p_frac
  const branch = forecast.counterfactuals[cfAction]
  const drop = Math.round((Math.max(...doNothing) - Math.max(...branch.p_frac)) * 100)

  const tabs: { id: View; label: string; show: boolean }[] = [
    { id: 'forecast', label: 'Forecast cone', show: true },
    { id: 'counterfactual', label: 'Counterfactual', show: !!current?.has_counterfactual },
  ]

  return (
    <Panel
      label={view === 'forecast' ? 'Forecast · 50 imagined futures' : 'Counterfactual · should I act?'}
      live
      className="flex h-full flex-col"
      right={
        <div className="flex gap-1">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cn(
                  'rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors',
                  view === t.id
                    ? 'bg-[var(--accent)] text-[var(--amber-hot)]'
                    : 'text-[var(--cream-dim)] hover:text-[var(--cream)]',
                )}
              >
                {t.label}
              </button>
            ))}
        </div>
      }
    >
      <div className="min-h-0 flex-1">
        {view === 'forecast' ? (
          <ConeChart
            samples={f.samples}
            pFrac={f.p_frac}
            spread={f.spread}
            threshold={threshold}
            firedAtStep={alert?.firedAtStep ?? null}
            attackOnset={onset}
            historySurprise={forecast.history.map((h) => h.surprise)}
            nSamples={nSamples}
            demoMode={demoMode}
          />
        ) : (
          <MiniCurves
            threshold={threshold}
            appliedAtStep={branch.applied_at_step ?? null}
            curves={[
              { label: 'do nothing', values: doNothing, color: '#c8422e' },
              {
                label: ACTION_LABEL[cfAction],
                values: branch.p_frac,
                color: cfAction === 'do_nothing' ? '#c8422e' : '#5a8fc4',
                dashed: cfAction !== 'do_nothing',
              },
            ]}
          />
        )}
      </div>

      <div className="mt-2 flex items-center gap-4 text-[10px] text-[var(--cream-dim)]">
        {view === 'forecast' ? (
          <>
            <Legend color="#4e9964" label="stays quiet" />
            <Legend color="#f0b93a" label="escalating" />
            <Legend color="#c8422e" label="attack-like" />
            <span className="ml-auto font-mono">
              divergence {f.divergence.toFixed(2)} ·{' '}
              {alert?.fired
                ? `alert +${alert.firedAtStep}m${
                    alert.leadTimeWindows != null ? ` · ${alert.leadTimeWindows}m early` : ''
                  }`
                : 'no alert at this threshold'}
            </span>
          </>
        ) : (
          <>
            <span className="text-[var(--threat)]">do nothing → {(Math.max(...doNothing) * 100).toFixed(0)}%</span>
            {cfAction !== 'do_nothing' && (
              <span className="text-[var(--info)]">
                {ACTION_LABEL[cfAction].toLowerCase()} → {(Math.max(...branch.p_frac) * 100).toFixed(0)}%
              </span>
            )}
            {cfAction !== 'do_nothing' && (
              <span className="ml-auto font-mono text-[var(--safe)]">−{drop} pts</span>
            )}
          </>
        )}
      </div>
      {view === 'counterfactual' && (
        <p className="mt-1.5 text-[8.5px] leading-snug text-[var(--dim)]">
          Model-predicted outcome under intervention. Not causally validated — no intervention ground
          truth exists for this data.
        </p>
      )}
    </Panel>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[3px] w-4 rounded" style={{ background: color }} />
      {label}
    </span>
  )
}
