import { useEffect, useState } from 'react'
import { HelpCircle, Moon, Sun } from 'lucide-react'
import { useStore } from '@/store'
import { TIER_META } from '@/lib/alert'
import { clockFromSeconds } from '@/lib/format'
import { toggleTheme, useTheme } from '@/lib/theme'
import { openIntro } from '@/lib/intro'

export function Header() {
  const { alert, current, forecast } = useStore()
  const theme = useTheme()
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const tier = alert?.tier ?? 'monitor'
  const meta = TIER_META[tier]
  const postureLabel =
    tier === 'critical' ? 'CRITICAL' : tier === 'elevated' ? 'ELEVATED' : tier === 'suspicious' ? 'WATCH' : 'SECURE'

  return (
    <header className="relative z-30 flex flex-none items-center gap-6 border-b bg-[var(--surface)] px-6 py-3">
      <div className="flex items-center gap-3">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,var(--blue),var(--teal))' }}
        >
          <span className="h-3 w-3 rounded-sm bg-white/90" />
        </div>
        <div>
          <div className="text-[17px] font-bold tracking-wide text-[var(--ink)]">HORIZON</div>
          <div className="mt-px text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--bronze)]">
            World-Model Predictive Defence · NTRO
          </div>
        </div>
      </div>

      <div className="ml-6 flex gap-6 border-l pl-6 text-[10.5px] text-[var(--cream-dim)]">
        <Stat k="Capture" v={current?.capture ?? 'n/a'} />
        <Stat k="Host" v={current?.host ?? 'n/a'} />
        <Stat k="Model" v="LSTM+MDN · K=20" />
        <Stat k="Split" v="(capture, host) LF" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button
          type="button"
          onClick={openIntro}
          title="Replay intro"
          aria-label="Replay intro"
          className="grid h-7 w-7 place-items-center rounded-md border text-[var(--cream-dim)] transition-colors hover:text-[var(--ink)]"
        >
          <HelpCircle size={14} />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle theme"
          className="grid h-7 w-7 place-items-center rounded-md border text-[var(--cream-dim)] transition-colors hover:text-[var(--ink)]"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <span className="font-mono text-[11px] text-[var(--cream-dim)]">{clockFromSeconds(secs)}</span>
        <div
          className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider"
          style={{ borderColor: meta.color, color: meta.color, background: `${meta.color}14` }}
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: 'currentColor', boxShadow: '0 0 9px currentColor', animation: 'pip 1.5s infinite' }}
          />
          {postureLabel}
          {forecast && alert?.fired && alert.leadTimeWindows != null && (
            <span className="font-mono font-normal opacity-80">+{alert.leadTimeWindows}m lead</span>
          )}
        </div>
      </div>
    </header>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      {k}
      <b className="mt-0.5 block font-mono text-[13px] font-semibold text-[var(--cream)]">{v}</b>
    </div>
  )
}
