import { Panel } from '@/components/Panel'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store'

function Row({ k, v, tone }: { k: string; v: string; tone?: 'amber' | 'safe' | 'threat' }) {
  const color =
    tone === 'amber' ? 'var(--amber-hot)' : tone === 'safe' ? 'var(--safe)' : tone === 'threat' ? 'var(--threat)' : 'var(--cream)'
  return (
    <div className="flex items-baseline justify-between py-[3px]">
      <span className="text-[10px] text-[var(--cream-dim)]">{k}</span>
      <span className="font-mono text-[12px] font-semibold" style={{ color }}>
        {v}
      </span>
    </div>
  )
}

const n2 = (x: unknown): string => (typeof x === 'number' && !Number.isNaN(x) ? x.toFixed(2) : '—')

export function MetricsPanel() {
  const { metrics } = useStore()
  if (!metrics) return null
  const mock = metrics.status === 'MOCK'
  const std = metrics.standard ?? {}
  const g = metrics.generalisation ?? {}
  const hoc = g.held_out_capture ?? {}
  const hocls = g.held_out_class ?? {}
  const pcf = std.per_class_f1 ?? {}
  const pcl = std.per_class_lead_windows

  const dropPts =
    typeof hoc.macro_f1_in === 'number' && typeof hoc.macro_f1_out === 'number'
      ? `${Math.round((hoc.macro_f1_in - hoc.macro_f1_out) * 100)} pts`
      : '—'
  const hoClsAuc = Object.values(hocls)[0]?.surprise_auc
  const surpriseAuc = metrics.surprise_auc ?? undefined
  // a "lead" of tens of windows is the eval metric mis-crediting a host that fires
  // continuously; only show a lead figure that is physically plausible (<= 30 windows).
  const plausibleLead = (w: unknown) => typeof w === 'number' && w > 0 && w <= 30
  const leadAt = metrics.lead_time_vs_fpr?.find(
    (r) => r.fpr <= 0.05 && plausibleLead(r.lead_windows.HORIZON),
  )
  const showPcl = !!pcl && Object.values(pcl).every((w) => typeof w === 'number' && Math.abs(w) <= 30)
  const weakClasses = Object.entries(pcf)
    .filter(([, f1]) => f1 < 0.6)
    .map(([c]) => c)
    .slice(0, 3)

  return (
    <Panel
      label="Evaluation"
      id="metrics"
      right={
        mock && (
          <Badge variant="outline" className="border-[var(--threat)] text-[9px] text-[var(--threat)]">
            MOCK
          </Badge>
        )
      }
    >
      <Row k="Macro-F1 · HORIZON" v={n2(std.HORIZON?.macro_f1)} tone="amber" />
      <Row k="Macro-F1 · logistic reg." v={n2(std.logreg?.macro_f1)} />
      {leadAt && (
        <Row
          k={`Lead @ ${(leadAt.fpr * 100).toFixed(1)}% FPR`}
          v={`${leadAt.lead_windows.HORIZON ?? '—'} min`}
          tone="safe"
        />
      )}
      <div className="my-1.5 h-px bg-[var(--border)]" />
      <Row k="Held-out weekday drop" v={dropPts} />
      {typeof hoClsAuc === 'number' && (
        <Row k="Held-out class · surprise AUC" v={hoClsAuc.toFixed(2)} tone="amber" />
      )}
      {typeof surpriseAuc === 'number' && (
        <Row k="Surprise AUC" v={surpriseAuc.toFixed(2)} tone="amber" />
      )}
      {typeof metrics.divergence_auc === 'number' && (
        <Row k="Divergence AUC" v={metrics.divergence_auc.toFixed(2)} />
      )}
      <Row
        k="Beats persistence"
        v={metrics.reconstruction?.persistence_beaten ? 'yes' : 'NO'}
        tone={metrics.reconstruction?.persistence_beaten ? 'safe' : 'threat'}
      />
      {Object.keys(pcf).length > 0 && (
        <p className="mt-2 text-[8.5px] leading-snug text-[var(--dim)]">
          Per-class F1: {Object.entries(pcf).map(([c, f]) => `${c} ${f.toFixed(2)}`).join(' · ')}
          {showPcl && pcl && ` — lead: ${Object.entries(pcl).map(([c, w]) => `${c} +${w}m`).join(' · ')}`}
          {weakClasses.length > 0 && ` — weak: ${weakClasses.join(', ')}`}
        </p>
      )}
      <p className="mt-2 text-[8.5px] leading-snug text-[var(--dim)]">
        Lead time is a curve against false-alarm rate, every baseline on the same axes, not a single
        number.
      </p>
    </Panel>
  )
}
