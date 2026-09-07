import { Header } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { SceneCard } from '@/components/scene/SceneCard'
import { HeroPanel } from '@/components/panels/HeroPanel'
import { TrajectoryPanel } from '@/components/panels/TrajectoryPanel'
import { SurprisePanel } from '@/components/panels/SurprisePanel'
import { MitrePanel } from '@/components/panels/MitrePanel'
import { ResponsePanel } from '@/components/panels/ResponsePanel'
import { MetricsPanel } from '@/components/panels/MetricsPanel'
import { FocusOverlay } from '@/components/FocusOverlay'
import { IntroScreen } from '@/components/IntroScreen'
import { useStore } from '@/store'

export function App() {
  const { forecast, loading } = useStore()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="relative min-w-0 flex-1 overflow-hidden bg-[var(--bg)]">
          {loading && !forecast ? (
            <div className="relative grid h-full place-items-center text-[var(--cream-dim)]">
              loading forecast…
            </div>
          ) : (
            <>
              <div className="absolute left-4 top-4 bottom-4 flex w-[250px] flex-col gap-3 overflow-y-auto">
                <MitrePanel />
                <TrajectoryPanel />
              </div>

              <div className="absolute right-4 top-4 bottom-4 flex w-[244px] flex-col gap-3 overflow-y-auto">
                <MetricsPanel />
                <SurprisePanel />
                <ResponsePanel />
              </div>

              <div className="absolute left-[270px] right-[264px] top-4 bottom-4 flex flex-col gap-3">
                <SceneCard />
                <div className="min-h-0 flex-1">
                  <HeroPanel />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <FocusOverlay />
      <IntroScreen />
    </div>
  )
}
