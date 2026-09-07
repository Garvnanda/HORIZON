// Panel identity: the explain text (for the (i) popover + docs/dashboard-guide.md),
// the focus-mode cluster (what to show fullscreen alongside), and a tiny store for
// which panel is currently expanded.

import { useSyncExternalStore } from 'react'

export type PanelId =
  | 'forecast'
  | 'counterfactual'
  | 'scene'
  | 'mitre'
  | 'trajectory'
  | 'surprise'
  | 'metrics'
  | 'response'

export interface PanelInfo {
  title: string
  what: string
  say: string
}

export const PANEL_INFO: Record<PanelId, PanelInfo> = {
  forecast: {
    title: 'Forecast cone',
    what: '50 futures sampled from the world model, 20 minutes ahead. The blue line is the fraction of futures that look attack-like at each step; the band is their spread. Threshold and NOW are marked.',
    say: 'We do not classify the present. We roll the learned dynamics forward 50 times and read the risk off the futures. The alert fires on the forecast, before the attack lands.',
  },
  counterfactual: {
    title: 'Counterfactual',
    what: 'The same history rolled out under three choices: do nothing, isolate the host, rate-limit it. Two curves, one axis. The drop is the modelled benefit of acting now.',
    say: 'This is the only screen that answers "should I act". No classifier can produce it. It is a structured what-if on learned dynamics, not a causally validated estimate, and we say that first.',
  },
  scene: {
    title: 'Network scene',
    what: 'The real host-communication graph for this capture. Nodes are machines, edges are observed traffic. Risk spreads from the selected host along the forecast; picking an intervention cuts it visibly. Scrub the playhead to any minute.',
    say: 'Macro view is the real topology. The attack you see spreading is the forecast, not a canned animation. When I isolate the host, watch the edges cut and the spread stop.',
  },
  mitre: {
    title: 'ATT&CK stage',
    what: 'A deterministic heuristic overlay mapping the predicted attack class to an ATT&CK tactic timeline. Presented as trajectory stage estimation, not technique identification.',
    say: 'The dataset labels do not map one-to-one to ATT&CK, so this is a stated heuristic. It gives the judge a stage name for where the forecast is heading.',
  },
  trajectory: {
    title: 'Predicted trajectory',
    what: 'The model’s predicted feature rows for the next steps, in original units, beside what actually happened. Diverging cells are highlighted.',
    say: 'This is what makes "world model" concrete. The model wrote down 47 distinct ports and a 0.71 failure rate for a minute that had not happened yet.',
  },
  surprise: {
    title: 'Surprise timeline',
    what: 'Per-window negative log-likelihood of the actual next state under the model, standardised per host. Spikes mark behaviour the model of normality cannot account for. The overlay shows an attack class removed from training entirely.',
    say: 'Surprise is the novel-attack channel. Even with this class deleted from training, the surprise line still spikes where the attack begins.',
  },
  metrics: {
    title: 'Evaluation',
    what: 'Lead-time-vs-false-alarm curve, persistence gate, held-out-weekday drop, calibration, per-class F1. MOCK badge until the notebook run wires real numbers.',
    say: 'Every number here comes from the eval harness, not a notebook cell pasted into a slide. The lead-time curve is on shared axes with the baselines.',
  },
  response: {
    title: 'Response recommendation',
    what: 'Threat tier, a filled-in command for this host, Approve / Dismiss, and a decision log. It never executes anything.',
    say: 'Decision support, not autonomous response. The analyst approves; the system logs. It fills the command, it never runs it.',
  },
}

export const FOCUS_CLUSTER: Record<PanelId, PanelId[]> = {
  forecast: ['forecast', 'counterfactual', 'response'],
  counterfactual: ['counterfactual', 'forecast', 'response'],
  scene: ['scene', 'mitre', 'trajectory'],
  mitre: ['mitre', 'scene', 'trajectory'],
  trajectory: ['trajectory', 'forecast', 'scene'],
  surprise: ['surprise', 'metrics'],
  metrics: ['metrics', 'surprise'],
  response: ['response', 'counterfactual'],
}

// ── focus store ──
let focus: PanelId | null = null
const listeners = new Set<() => void>()

export function getFocus(): PanelId | null {
  return focus
}
export function setFocus(id: PanelId | null) {
  if (id === focus) return
  focus = id
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useFocus(): PanelId | null {
  return useSyncExternalStore(subscribe, getFocus, getFocus)
}
