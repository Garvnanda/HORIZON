import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { closeIntro, useIntroOpen } from '@/lib/intro'

interface Slide {
  kicker: string
  title: string
  body: string
  points?: string[]
}

const SLIDES: Slide[] = [
  {
    kicker: 'The problem',
    title: 'Detection fires too late, and misses what it has not seen',
    body: 'Every deployed intrusion detector answers one question: is this traffic malicious? By the time it answers yes, the attacker is already inside. And an attack pattern absent from the training data produces no alert at all.',
  },
  {
    kicker: 'The idea',
    title: 'Forecast the next 20 minutes. Do not classify the present.',
    body: 'HORIZON learns how each machine behaves over time, then rolls that behaviour forward, 50 times, to imagine what the machine is about to do. It scores the imagined futures for danger and alerts on the forecast. This is a world model, the structure the problem statement asks for.',
  },
  {
    kicker: 'Why it beats a classifier',
    title: 'Three things no classifier can produce',
    body: 'All three come from having a model that simulates forward rather than one that labels the present.',
    points: [
      'A probability curve over the next 20 minutes, with measurable warning time',
      'Surprise: divergence from the forecast flags attacks absent from training',
      'Counterfactual: roll out "isolate this host now" versus "do nothing", side by side',
    ],
  },
  {
    kicker: 'The demo',
    title: 'One real host, from history to forecast to decision',
    body: 'You are looking at one machine on a corporate network. History on the left, 50 imagined futures on the right, the alert, the counterfactual, and the attack class we deleted from training and still caught.',
  },
]

export function IntroScreen() {
  const open = useIntroOpen()
  const [i, setI] = useState(0)
  if (!open) return null
  const s = SLIDES[i]
  const last = i === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-3 px-8 pt-7">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,var(--blue),var(--teal))' }}
        >
          <span className="h-3 w-3 rounded-sm bg-white/90" />
        </div>
        <div className="text-[15px] font-bold tracking-wide text-[var(--ink)]">HORIZON</div>
        <button
          type="button"
          onClick={closeIntro}
          className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
        >
          Skip intro
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--blue)]">
          {s.kicker}
        </div>
        <h1 className="mt-3 text-[30px] font-bold leading-tight text-[var(--ink)]">{s.title}</h1>
        <p className="mt-4 max-w-[620px] text-[14px] leading-relaxed text-[var(--ink-dim)]">{s.body}</p>
        {s.points && (
          <ul className="mt-5 space-y-2.5">
            {s.points.map((p) => (
              <li key={p} className="flex gap-3 text-[13px] leading-snug text-[var(--ink)]">
                <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--teal)]" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-8 pb-10">
        <div className="flex gap-1.5">
          {SLIDES.map((_, k) => (
            <span
              key={k}
              className={
                'h-1.5 rounded-full transition-all ' +
                (k === i ? 'w-6 bg-[var(--blue)]' : 'w-1.5 bg-[var(--line-strong)]')
              }
            />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {i > 0 && (
            <button
              type="button"
              onClick={() => setI((v) => v - 1)}
              className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[12px] font-semibold text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? closeIntro() : setI((v) => v + 1))}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--blue)] px-5 py-2 text-[12px] font-semibold text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            {last ? 'Enter dashboard' : 'Next'} {!last && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}
