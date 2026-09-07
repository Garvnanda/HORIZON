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

export function MetricsPanel() {
  const { metrics } = useStore()
  if (!metrics) return null
  const mock = metrics.status === 'MOCK'
  const h = metrics.standard.HORIZON
  const lr = metrics.standard.logreg
  const g = metrics.generalisation

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
      <Row k="Macro-F1 · HORIZON" v={h.macro_f1.toFixed(2)} tone="amber" />
      <Row k="Macro-F1 · logistic reg." v={lr.macro_f1.toFixed(2)} />
      <Row k="False-positive rate" v={`${(h.fpr * 100).toFixed(2)}%`} tone="safe" />
      <div className="my-1.5 h-px bg-[var(--border)]" />
      <Row
        k="Held-out capture drop"
        v={`${((g.held_out_capture.macro_f1_in - g.held_out_capture.macro_f1_out) * 100).toFixed(0)} pts`}
      />
      <Row
        k="Held-out class · surprise AUC"
        v={Object.values(g.held_out_class)[0].surprise_auc.toFixed(2)}
        tone="amber"
      />
      <Row k="Beats persistence" v={metrics.reconstruction.persistence_beaten ? 'yes' : 'NO'} tone={metrics.reconstruction.persistence_beaten ? 'safe' : 'threat'} />
      <p className="mt-2 text-[8.5px] leading-snug text-[var(--dim)]">
        Lead time is a curve against false-alarm rate, every baseline on the same axes, not a single
        number.
      </p>
    </Panel>
  )
}
