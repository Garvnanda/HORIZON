import type { AlertTier, ComputedAlert } from './types'

export function tierFor(peak: number): AlertTier {
  if (peak >= 0.9) return 'critical'
  if (peak >= 0.66) return 'elevated'
  if (peak >= 0.4) return 'suspicious'
  return 'monitor'
}

/**
 * Alert state is a pure function of (p_frac, threshold, first attack window).
 * Recomputed on every threshold-slider move, never fetched. See api-contract.md section 1.
 */
export function computeAlert(
  pFrac: number[],
  threshold: number,
  firstAttackWindow: number | null | undefined,
): ComputedAlert {
  const firedAtStep = pFrac.findIndex((p) => p >= threshold)
  const fired = firedAtStep !== -1
  const peak = pFrac.length ? Math.max(...pFrac) : 0
  return {
    fired,
    firedAtStep: fired ? firedAtStep : null,
    leadTimeWindows:
      fired && firstAttackWindow != null ? firstAttackWindow - firedAtStep : null,
    peak,
    tier: tierFor(peak),
  }
}

export const TIER_META: Record<
  AlertTier,
  { label: string; color: string; action: string }
> = {
  monitor: { label: 'Monitor', color: '#2c7a4b', action: 'log only' },
  suspicious: { label: 'Suspicious', color: '#d1932b', action: 'verbose logging' },
  elevated: { label: 'Elevated', color: '#e0742e', action: 'rate-limit source' },
  critical: { label: 'Critical', color: '#e5484d', action: 'isolate host' },
}
