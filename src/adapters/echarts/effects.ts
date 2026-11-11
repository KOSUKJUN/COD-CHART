/**
 * CODVIL effect layer — the shared design/motion vocabulary applied on top of
 * plain ECharts options so every chart type enters, updates, highlights and
 * glows the same way:
 *
 * 1. Sequential entrance  — `stagger()` per data item / series.
 * 2. Smooth value change  — update tweens + `valueAnimation` on readouts.
 * 3. Live event emphasis  — `pulseSeries()` ripples on the latest point and on
 *                           threshold breaches.
 * 4. Gauge sweep          — `motion.sweepMs` / `sweepUpdateMs` (see buildGauge).
 * 5. Hover detail         — glow on emphasis + richer tooltips (see build.ts).
 * 6. Dark gradient & glow — `fillGradient()` / `glow()`, switchable per theme.
 *
 * Pure functions only; no DOM access.
 */
import type { ResolvedMotion } from '../../core/animation';
import type { ResolvedTheme } from '../../core/theme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Opt = Record<string, any>;

/** Hex → rgba with alpha. Non-hex literals (already rgb/rgba) are returned unchanged. */
export function alpha(color: string, a: number): string {
  if (!color.startsWith('#')) return color;
  const h = color.slice(1);
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Linear fill from the data end (full colour) to the baseline (faded), so marks
 * read as "lit" from their value end on the dark surface.
 * `towards`: the direction the mark grows (value end).
 */
export function fillGradient(theme: ResolvedTheme, color: string, towards: 'up' | 'right' | 'down', fadeTo = 0.42): string | Opt {
  if (!theme.effects.gradient) return color;
  const box = towards === 'right' ? { x: 1, y: 0, x2: 0, y2: 0 } : towards === 'up' ? { x: 0, y: 0, x2: 0, y2: 1 } : { x: 0, y: 1, x2: 0, y2: 0 };
  return { type: 'linear', ...box, colorStops: [{ offset: 0, color }, { offset: 1, color: alpha(color, fadeTo) }] };
}

/** Soft outer glow in the mark's own colour. `strength` 1 = resting, 2 = hover/alert. */
export function glow(theme: ResolvedTheme, color: string, strength = 1): Opt {
  if (!theme.effects.glow) return {};
  return { shadowBlur: Math.round(10 * strength), shadowColor: alpha(color, Math.min(0.85, 0.38 * strength)), shadowOffsetX: 0, shadowOffsetY: 0 };
}

// ── 3D style (theme.effects.depth) ─────────────────────────────────────────
// Pseudo-3D on the regular 2D renderer: every chart type keeps its interactions,
// accessibility and export, and no WebGL dependency is needed.

/** Extrusion depth (px) of 3D bars; scaled down for thin bars. */
export const DEPTH_PX = 8;

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. Non-hex input is returned unchanged. */
export function shade(color: string, amount: number): string {
  if (!color.startsWith('#')) return color;
  const h = color.slice(1);
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const hex = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${hex(mix((n >> 16) & 255))}${hex(mix((n >> 8) & 255))}${hex(mix(n & 255))}`;
}

/** Drop shadow cast down-right, so marks read as raised off the surface. Empty unless depth is on. */
export function depthShadow(theme: ResolvedTheme, strength = 1): Opt {
  if (!theme.effects.depth) return {};
  return { shadowBlur: Math.round(10 * strength), shadowOffsetX: Math.round(2 * strength), shadowOffsetY: Math.round(5 * strength), shadowColor: 'rgba(0, 0, 0, 0.55)' };
}

/** Lit-sphere fill (highlight top-left, shadowed bottom-right) for scatter/bubble points. */
export function sphere(color: string, opacity = 1): Opt {
  return {
    type: 'radial', x: 0.36, y: 0.32, r: 0.75,
    colorStops: [
      { offset: 0, color: alpha(shade(color, 0.45), opacity) },
      { offset: 0.55, color: alpha(color, opacity) },
      { offset: 1, color: alpha(shade(color, -0.45), opacity) },
    ],
  };
}

/** Max entrance spread so a dashboard settles quickly regardless of item count. */
export const STAGGER_WINDOW_MS = 480;
/** Extra entrance offset between consecutive series. */
export const SERIES_STAGGER_MS = 90;

/**
 * Sequential entrance: item i of `count` starts at i·step (+ series offset), the
 * whole sequence fitting inside STAGGER_WINDOW_MS. 0 when motion is off.
 */
export function stagger(motion: ResolvedMotion, count: number, seriesIndex = 0): number | ((i: number) => number) {
  if (!motion.enabled) return 0;
  const step = Math.min(motion.staggerMs, STAGGER_WINDOW_MS / Math.max(1, count - 1));
  const offset = seriesIndex * SERIES_STAGGER_MS;
  return step === 0 ? offset : (i: number) => Math.round(offset + Math.min(i, count) * step);
}

export interface PulsePoint {
  /** Coordinates in the series' coordinate system ([x, y] or [category, value]). */
  value: unknown[];
  color: string;
}

/**
 * Event-emphasis overlay: an effectScatter ripple (or, without motion, a static
 * ring) drawn over the given points. Silent and tooltip-less — it decorates, it
 * never becomes a data series. Sharing the parent's `name` makes legend toggles
 * hide the pulse together with its series.
 */
export function pulseSeries(theme: ResolvedTheme, motion: ResolvedMotion, id: string, name: string, points: PulsePoint[], size = 9): Opt {
  const animated = motion.enabled;
  return {
    id: `fx:${id}`,
    name,
    type: animated ? 'effectScatter' : 'scatter',
    silent: true,
    tooltip: { show: false },
    z: 5,
    symbolSize: size,
    ...(animated ? { showEffectOn: 'render', rippleEffect: { brushType: 'stroke', scale: 3.2, period: 2.4, number: 2 } } : {}),
    // Overlays appear after the marks they decorate have drawn in.
    animationDelay: animated ? motion.entranceMs : 0,
    data: points.map((p) => ({
      value: p.value,
      itemStyle: { color: p.color, borderColor: theme.tokens.bgSurface, borderWidth: 2, ...glow(theme, p.color, 1.6) },
    })),
    emphasis: { disabled: true },
  };
}

export const isEffectSeries = (p: { seriesId?: string }) => typeof p.seriesId === 'string' && p.seriesId.startsWith('fx:');

/** "▲ 12.4%" / "▼ 3%" / "0%" change vs. the previous value, or '' when not computable. */
export function deltaText(cur: unknown, prev: unknown, locale: string): string {
  if (typeof cur !== 'number' || typeof prev !== 'number' || prev === 0 || !Number.isFinite(cur) || !Number.isFinite(prev)) return '';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 }).format(Math.abs(pct));
  return `${pct > 0 ? '▲' : pct < 0 ? '▼' : ''} ${text}%`.trim();
}
