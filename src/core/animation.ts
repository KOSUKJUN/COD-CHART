import type { AnimationSpec } from './types';

export interface MotionEnvironment {
  /** OS/browser `prefers-reduced-motion: reduce`. */
  reducedMotion?: boolean;
  /** Host product setting (e.g. a "disable animations" user preference). */
  productMotionEnabled?: boolean;
  /** Observed ms between recent data updates (stream/poll); undefined if unknown. */
  updateIntervalMs?: number;
}

export interface ResolvedMotion {
  enabled: boolean;
  entranceMs: number;
  updateMs: number;
  emphasisMs: number;
  easing: 'cubicOut';
  updateEasing: 'cubicInOut';
  /** Max per-item stagger for the entrance (kept short so dashboards settle quickly). */
  staggerMs: number;
}

export const MOTION_DEFAULTS = { entranceMs: 500, updateMs: 400, emphasisMs: 150, staggerMs: 12 } as const;

/** Updates arriving faster than this make update tweens counter-productive. */
export const FAST_UPDATE_THRESHOLD_MS = 1000;

const OFF: ResolvedMotion = {
  enabled: false, entranceMs: 0, updateMs: 0, emphasisMs: 0, easing: 'cubicOut', updateEasing: 'cubicInOut', staggerMs: 0,
};

/**
 * Precedence (highest first): reduced-motion → product setting → definition
 * `enabled: false` / preset `none` → update-rate throttle → preset durations.
 */
export function resolveMotion(spec: AnimationSpec | undefined, env: MotionEnvironment = {}): ResolvedMotion {
  if (env.reducedMotion) return OFF;
  if (env.productMotionEnabled === false) return OFF;
  if (spec?.enabled === false || spec?.preset === 'none') return OFF;

  const scale = spec?.durationMs !== undefined ? spec.durationMs / MOTION_DEFAULTS.updateMs : 1;
  const clamp = (ms: number) => Math.max(0, Math.min(5000, Math.round(ms)));
  let updateMs = clamp(MOTION_DEFAULTS.updateMs * scale);
  // A tween must finish well before the next frame of data arrives, otherwise the
  // chart never shows a settled value. Shrink to 40% of the interval, or disable.
  if (env.updateIntervalMs !== undefined) {
    if (env.updateIntervalMs < 300) updateMs = 0;
    else if (env.updateIntervalMs < FAST_UPDATE_THRESHOLD_MS) updateMs = Math.min(updateMs, Math.round(env.updateIntervalMs * 0.4));
  }
  return {
    enabled: true,
    entranceMs: clamp(MOTION_DEFAULTS.entranceMs * scale),
    updateMs,
    emphasisMs: MOTION_DEFAULTS.emphasisMs,
    easing: 'cubicOut',
    updateEasing: 'cubicInOut',
    staggerMs: MOTION_DEFAULTS.staggerMs,
  };
}

/** Safe in SSR / non-browser contexts. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}
