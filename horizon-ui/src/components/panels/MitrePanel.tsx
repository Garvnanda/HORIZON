import { Panel } from '@/components/Panel'
import { useStore } from '@/store'
import { KILL_CHAIN, stageIndex } from '@/lib/mitre'
import { cn } from 'cn'

export function MitrePanel() {
  const { forecast, alert } = useStore()
  if (!forecast) return null
  const m = forecast.mitre
  const curIdx = stageIndex(m.current_stage)
  const predIdx = stageIndex(m.predicted_stage)
  const peak = forecast.forecast.p_frac.length
    ? Math.max(...forecast.forecast.p_frac)
    : 0

  return (
    <Panel label="Kill-chain forecast · ATT&CK overlay" live>
      <div className="flex flex-col gap-1">
        {KILL_CHAIN.map((st, i) => {
          const done = curIdx >= 0 && i <= curIdx
          const pred = predIdx >= 0 && i > curIdx && i <= predIdx
          return (
            <div
              key={st.tactic}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                done && 'bg-[rgba(218,165,32,0.08)] text-[var(--cream)]',
                pred && 'text-[var(--amber-hot)]',
                !done && !pred && 'text-[var(--cream-dim)]',
              )}
            >
              <span
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{
                  background: done ? 'var(--amber)' : pred ? 'var(--amber-hot)' : 'rgba(238,221,200,0.14)',
                  boxShadow: done || pred ? '0 0 9px var(--amber-hot)' : 'none',
                  animation: pred ? 'pip 1s infinite' : 'none',
                }}
              />
              {st.stage}
              <span className="ml-auto font-mono text-[8.5px] text-[var(--dim)]">{st.tactic}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 border-t pt-3">
        <div className="flex justify-between text-[10px] text-[var(--cream-dim)]">
          <span>Infiltration probability</span>
          <b className="font-mono text-[12px] text-[var(--amber-hot)]">{(peak * 100).toFixed(0)}%</b>
        </div>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded bg-[rgba(255,255,255,0.05)]">
          <div
            className="h-full rounded transition-[width] duration-500"
            style={{
              width: `${peak * 100}%`,
              background: 'linear-gradient(90deg,var(--safe),var(--amber),var(--threat))',
            }}
          />
        </div>
        <div className="mt-1.5 font-mono text-[9px] leading-snug text-[var(--dim)]">
          next stage <b className="text-[var(--amber-hot)]">{m.predicted_stage}</b>
          {m.predicted_at_step != null && ` +${m.predicted_at_step}m`}
          {alert?.fired && alert.leadTimeWindows != null && (
            <> · lead <b className="text-[var(--safe)]">+{alert.leadTimeWindows}m</b></>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[8px] leading-snug text-[var(--dim)]">
        Heuristic overlay — trajectory stage estimation, not technique identification.
      </p>
    </Panel>
  )
}
