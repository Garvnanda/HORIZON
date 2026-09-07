import { Header } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { NetworkScene } from '@/components/scene/NetworkScene'
import { HeroPanel } from '@/components/panels/HeroPanel'
import { TrajectoryPanel } from '@/components/panels/TrajectoryPanel'
import { SurprisePanel } from '@/components/panels/SurprisePanel'
import { MitrePanel } from '@/components/panels/MitrePanel'
import { ResponsePanel } from '@/components/panels/ResponsePanel'
import { MetricsPanel } from '@/components/panels/MetricsPanel'
import { useStore } from '@/store'

export function App() {
  const { forecast, loading, cfAction } = useStore()

  const progression = forecast ? Math.min(1, Math.max(...forecast.forecast.p_frac)) : 0
  const shielded = cfAction === 'isolate_host'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="relative min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_90%_80%_at_50%_35%,rgba(26,19,7,0.5),var(--bg))]">
          {loading && !forecast ? (
            <div className="relative grid h-full place-items-center text-[var(--cream-dim)]">
              loading forecast…
            </div>
          ) : (
            <>
              {/* left rail */}
              <div className="absolute left-4 top-4 bottom-4 flex w-[250px] flex-col gap-3 overflow-y-auto">
                <MitrePanel />
                <TrajectoryPanel />
              </div>

              {/* right rail */}
              <div className="absolute right-4 top-4 bottom-4 flex w-[244px] flex-col gap-3 overflow-y-auto">
                <MetricsPanel />
                <SurprisePanel />
                <ResponsePanel />
              </div>

              {/* centre column: framed 3D scene above, forecast hero below */}
              <div className="absolute left-[270px] right-[264px] top-4 bottom-4 flex flex-col gap-3">
                <div className="relative h-[320px] flex-none overflow-hidden rounded-2xl border bg-[rgba(10,9,7,0.35)]">
                  <NetworkScene progression={progression} shielded={shielded} />
                  <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[var(--bronze)]">
                      Predicted kill chain
                    </div>
                    <div className="mt-0.5 font-mono text-[8px] text-[var(--dim)]">
                      amber compromised · pulsing forecast · green isolated
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <HeroPanel />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
