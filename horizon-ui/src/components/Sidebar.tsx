import { useStore } from '@/store'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { cn } from 'cn'

const SCENARIO_LABEL: Record<string, string> = {
  infiltration: 'Infiltration kill chain',
  botnet: 'Botnet C2 beacon',
  portscan: 'Port scan → DDoS',
  benign: 'Benign host (control)',
}

const weekday = (capture: string) => capture.replace(/^ids2017-/, '')

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--bronze)]">{label}</div>
      {children}
    </div>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-[var(--border-lit)] bg-[var(--accent)] text-[var(--amber-hot)]'
          : 'text-[var(--cream-dim)] hover:text-[var(--cream)]',
      )}
    >
      {children}
    </button>
  )
}

export function Sidebar() {
  const s = useStore()

  return (
    <aside className="z-20 flex w-[248px] flex-none flex-col gap-5 overflow-y-auto border-r bg-[var(--surface)] p-4">
      <Field label="Host">
        <Select
          value={`${s.capture}|${s.host}`}
          onValueChange={(v) => {
            const [cap, h] = v.split('|')
            s.selectHost(cap, h)
          }}
        >
          <SelectTrigger className="w-full text-[12px]">
            <SelectValue placeholder="pick a host…" />
          </SelectTrigger>
          <SelectContent>
            {[...new Set(s.hosts.map((h) => h.capture))].sort().map((cap) => (
              <SelectGroup key={cap}>
                <SelectLabel>{weekday(cap)}</SelectLabel>
                {s.hosts
                  .filter((h) => h.capture === cap)
                  .sort((a, b) => Number(b.scenario !== 'adhoc') - Number(a.scenario !== 'adhoc'))
                  .map((h) => (
                    <SelectItem key={`${h.capture}|${h.host}`} value={`${h.capture}|${h.host}`}>
                      {h.host}
                      {h.scenario !== 'adhoc' && ` · ${SCENARIO_LABEL[h.scenario] ?? h.scenario}`}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[9px] leading-snug text-[var(--dim)]">
          Any host in the 5 weekday captures. Type an IP to jump to it. Full list: docs/available-hosts.md
        </p>
      </Field>

      {(s.current?.available_t.length ?? 0) > 1 && (
        <Field label="Time position">
          <div className="flex gap-2">
            {s.current!.available_t.map((t) => (
              <Toggle key={t} active={s.t === t} onClick={() => s.setT(t)}>
                window {t}
              </Toggle>
            ))}
          </div>
        </Field>
      )}

      <Field label={`Alert threshold · ${(s.threshold * 100).toFixed(0)}%`}>
        <Slider
          min={0.05}
          max={0.9}
          step={0.01}
          value={[s.threshold]}
          onValueChange={([v]) => s.setThreshold(v)}
        />
        <p className="text-[9px] leading-snug text-[var(--dim)]">
          Drag it. Lead time and the alert marker move live, the trade-off stays visible.
        </p>
      </Field>

      <Field label="Samples in cone">
        <div className="flex gap-2">
          {[25, 50, 100].map((n) => (
            <Toggle key={n} active={s.nSamples === n} onClick={() => s.setNSamples(n)}>
              {n}
            </Toggle>
          ))}
        </div>
      </Field>

      {s.current?.has_counterfactual && (
        <Field label="Counterfactual action">
          <Select value={s.cfAction} onValueChange={(v) => s.setCfAction(v as never)}>
            <SelectTrigger className="w-full text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="isolate_host">Isolate host</SelectItem>
              <SelectItem value="rate_limit">Rate-limit source</SelectItem>
              <SelectItem value="do_nothing">Do nothing</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      {s.surprise?.held_out_class && (
        <Field label="Surprise channel">
          <Toggle active={s.showHeldOut} onClick={() => s.setShowHeldOut(!s.showHeldOut)}>
            {s.showHeldOut ? 'showing ' : 'show '}
            {s.surprise.held_out_class.removed_class} held-out
          </Toggle>
        </Field>
      )}

      <Field label="Mode">
        <Toggle active={s.demoMode} onClick={() => s.setDemoMode(!s.demoMode)}>
          demo mode {s.demoMode ? 'on' : 'off'} · ground truth {s.demoMode ? 'shown' : 'hidden'}
        </Toggle>
      </Field>

      <div className="mt-auto space-y-1 border-t pt-3 text-[8.5px] font-mono text-[var(--dim)]">
        <div>TRAIN · CIC-IDS2017 (5 weekday captures)</div>
        <div>CROSS-DOMAIN · held-out weekday</div>
        <div>OFFLINE · weights local, no cloud calls</div>
      </div>
    </aside>
  )
}
