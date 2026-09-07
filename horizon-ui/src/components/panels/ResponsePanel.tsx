import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/Panel'
import { useStore } from '@/store'
import { TIER_META } from '@/lib/alert'
import { postDecision, getDecisionLog } from '@/lib/api'

export function ResponsePanel() {
  const { forecast, alert, current, t } = useStore()
  const [logCount, setLogCount] = useState(() => getDecisionLog().length)
  if (!forecast) return null

  const tier = alert?.tier ?? 'monitor'
  const meta = TIER_META[tier]
  const cmd = forecast.alert.reference.recommended_command.replace(/\{ip\}/g, forecast.host)

  const decide = (decision: 'approve' | 'dismiss') => {
    postDecision({
      host: forecast.host,
      capture: forecast.capture,
      t,
      decision,
      tier,
      command: cmd,
    })
    setLogCount(getDecisionLog().length)
    toast(decision === 'approve' ? 'Mitigation approved' : 'Alert dismissed', {
      description: decision === 'approve' ? 'Logged to audit trail. Nothing executed.' : 'Override recorded.',
    })
  }

  return (
    <Panel
      label="Response recommendation"
      right={<span className="font-mono text-[10px] text-[var(--dim)]">{logCount} logged</span>}
    >
      <div
        className="mb-2.5 flex items-center gap-2 rounded-lg border px-2.5 py-2"
        style={{ borderColor: meta.color }}
      >
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: meta.color }} />
        <span className="text-[11.5px] font-bold" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--dim)]">
          {alert?.peak != null ? `${(alert.peak * 100).toFixed(0)}% · ` : ''}
          {current?.true_class ?? '—'}
        </span>
      </div>

      <pre
        className="cursor-pointer overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-[rgba(6,7,10,0.85)] p-2 font-mono text-[8.5px] leading-relaxed text-[rgba(240,185,58,0.85)]"
        onClick={() => {
          navigator.clipboard?.writeText(cmd)
          toast('Command copied')
        }}
      >
        {cmd}
      </pre>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => decide('approve')}
          className="flex-1 rounded-md border border-[rgba(78,153,100,0.4)] py-1.5 text-[10.5px] font-semibold text-[var(--safe)] transition-colors hover:bg-[rgba(78,153,100,0.12)]"
        >
          ✓ Approve
        </button>
        <button
          onClick={() => decide('dismiss')}
          className="flex-1 rounded-md border py-1.5 text-[10.5px] font-semibold text-[var(--cream-dim)] transition-colors hover:border-[var(--amber)] hover:text-[var(--cream)]"
        >
          ✗ Dismiss
        </button>
      </div>
      <p className="mt-1.5 text-[8px] text-[var(--dim)]">Fills the command. Analyst approves. Never executes.</p>
    </Panel>
  )
}
