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
  // Dark: the value end is lit brighter than the hue (neon cap); light: the hue itself.
  const end = theme.mode === 'light' ? color : shade(color, 0.3);
  return { type: 'linear', ...box, colorStops: [{ offset: 0, color: end }, { offset: 0.35, color }, { offset: 1, color: alpha(color, fadeTo) }] };
}

/**
 * Neon outer glow in the mark's own colour. `strength` 1 = resting, 2 = hover/alert.
 * Dark mode blooms; light mode keeps a tight tinted shadow (a bloom reads as smudge on white).
 */
export function glow(theme: ResolvedTheme, color: string, strength = 1): Opt {
  if (!theme.effects.glow) return {};
  if (theme.mode === 'light') {
    return { shadowBlur: Math.round(6 * strength), shadowColor: alpha(color, Math.min(0.45, 0.22 * strength)), shadowOffsetX: 0, shadowOffsetY: Math.round(strength) };
  }
  return { shadowBlur: Math.round(14 * strength), shadowColor: alpha(color, Math.min(0.95, 0.6 * strength)), shadowOffsetX: 0, shadowOffsetY: 0 };
}

/**
 * Neon tube core: the stroke is drawn brighter than its hue while `glow()` blooms in the
 * base hue, so lines read as lit tubes. Identity (legend, tooltip marker) keeps the base hue.
 */
export function neonCore(theme: ResolvedTheme, color: string, amount = 0.38): string {
  return theme.mode === 'light' || !theme.effects.glow ? color : shade(color, amount);
}

/**
 * Holographic fill for area marks of radial forms (pie, polar, gauge rings, bubbles):
 * translucent body, bright rim, bloom. Light mode: solid body with a white rim.
 */
export function holo(theme: ResolvedTheme, color: string, body = 0.62): Opt {
  if (theme.mode === 'light' || !theme.effects.glow) {
    return { color, borderColor: theme.tokens.bgSurface, borderWidth: 2 };
  }
  return {
    color: theme.effects.gradient
      ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: alpha(shade(color, 0.25), body + 0.2) }, { offset: 1, color: alpha(color, body - 0.22) }] }
      : alpha(color, body),
    borderColor: shade(color, 0.5),
    borderWidth: 1.2,
    ...glow(theme, color, 0.9),
  };
}

/**
 * HUD rings around a radial chart: a thin halo ring and a dashed tick ring (static decoration).
 * One silent `fx:` custom series, so it never joins the legend, tooltips or events.
 * `outer` = the chart's outer radius in % of half the shorter side.
 */
export function hudRings(theme: ResolvedTheme, _motion: ResolvedMotion, center: [string, string], outer: number): Opt[] {
  if (!theme.effects.glow) return [];
  const light = theme.mode === 'light';
  const tint = light ? theme.tokens.axisLine : theme.tokens.accentCyan;
  const pct = (v: string, size: number) => (parseFloat(v) / 100) * size;
  const TICKS = 36;
  return [{
    id: 'fx:hud', type: 'custom', coordinateSystem: 'none', silent: true, tooltip: { show: false }, z: 0,
    data: [[0]],
    renderItem: (_params: Opt, api: Opt) => {
      const w = api.getWidth(), h = api.getHeight();
      const cx = pct(center[0], w), cy = pct(center[1], h);
      const base = Math.min(w, h) / 2;
      const halo = ((outer + 4) / 100) * base;
      const ring = ((outer + 8) / 100) * base;
      return {
        type: 'group',
        children: [
          { type: 'circle', shape: { cx, cy, r: halo }, style: { fill: 'none', stroke: alpha(tint, light ? 0.8 : 0.34), lineWidth: 1.2, ...glow(theme, tint, 0.5) } },
          {
            type: 'group',
            children: Array.from({ length: TICKS }, (_, j) => ({
              type: 'arc',
              shape: { cx, cy, r: ring, startAngle: (j / TICKS) * Math.PI * 2, endAngle: ((j + 0.45) / TICKS) * Math.PI * 2 },
              style: { fill: 'none', stroke: alpha(tint, j % 9 === 0 ? 0.85 : light ? 0.5 : 0.26), lineWidth: j % 9 === 0 ? 3 : 2 },
            })),
          },
        ],
      };
    },
  }];
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
export const STAGGER_WINDOW_MS = 1500;
/** Extra entrance offset between consecutive series. */
export const SERIES_STAGGER_MS = 260;

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

/**
 * Hover state for organic forms (bubbles, words): glow harder and come to the front.
 * Size and motion are not part of the state; the adapter runs them (see `driftStart`, `focusIn`).
 */
export function swell(theme: ResolvedTheme, color: string): Opt {
  return { z2: 10, style: theme.effects.glow ? { shadowBlur: theme.mode === 'light' ? 10 : 24, shadowColor: alpha(color, theme.mode === 'light' ? 0.45 : 0.9) } : {} };
}

/** Series that drift while hovered (bubble groups and the word cloud). */
export const BREATHING_SERIES = (id: unknown) => typeof id === 'string' && (id.startsWith('bubble:') || id === 'word-cloud');

/** Minimal zrender element surface used by the ambient drift (duck-typed for tests). */
export interface DriftTarget {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  animate(path: string, loop: boolean): { when(time: number, props: Opt): unknown; start(easing?: string): unknown };
  animateTo(props: Opt, cfg: Opt): void;
  stopAnimation(scope?: string, forwardToLast?: boolean): void;
  getBoundingRect?(): { width: number; height: number };
}

/**
 * Organic "mochi" motion while the pointer is on a bubble / word cloud: every item drifts on
 * its own small Lissajous path (x and y on different periods and phases), sampled as a true
 * sine so the movement never turns mechanical. The hovered item also swells and glows.
 */
export const DRIFT = { samples: 24, minPx: 1.2, maxPx: 3.5, focus: 1.12, focusMs: 380, settleMs: 600 } as const;

/** Deterministic per-item parameters (period, phase, amplitude) so neighbours never sync. */
export function driftPlan(k: number, size: number) {
  const amp = Math.max(DRIFT.minPx, Math.min(DRIFT.maxPx, size * 0.06));
  return {
    amp,
    tx: 3200 + ((k * 733) % 1400),
    ty: 2800 + ((k * 397) % 1300),
    px: ((k * 0.618) % 1) * Math.PI * 2,
    py: ((k * 0.382 + 0.25) % 1) * Math.PI * 2,
  };
}

function loopAxis(el: DriftTarget, axis: 'x' | 'y', base: number, amp: number, period: number, phase: number) {
  const anim = el.animate('', true) as { when(t: number, p: Opt): unknown; start(e?: string): unknown };
  const n = DRIFT.samples;
  for (let i = 0; i <= n; i++) anim.when((i / n) * period, { [axis]: base + amp * (Math.sin((i / n) * Math.PI * 2 + phase) - Math.sin(phase)) });
  anim.start('linear');
}

/** Start drifting from the element's resting position. Returns the rest pose to settle back to. */
export function driftStart(el: DriftTarget, k: number): { x: number; y: number } {
  const rest = { x: el.x, y: el.y };
  const box = el.getBoundingRect?.();
  const plan = driftPlan(k, box ? Math.min(box.width, box.height) : 30);
  loopAxis(el, 'x', rest.x, plan.amp, plan.tx, plan.px);
  loopAxis(el, 'y', rest.y, plan.amp * 0.8, plan.ty, plan.py);
  return rest;
}

/** Glide back to rest (position and size) when the pointer leaves the chart. */
export function driftSettle(el: DriftTarget, rest: { x: number; y: number }): void {
  el.stopAnimation();
  el.animateTo({ x: rest.x, y: rest.y, scaleX: 1, scaleY: 1 }, { duration: DRIFT.settleMs, easing: 'cubicOut' });
}

/** Hovered item swells (drift keeps running on x/y). */
export function focusIn(el: DriftTarget): void {
  el.animateTo({ scaleX: DRIFT.focus, scaleY: DRIFT.focus }, { duration: DRIFT.focusMs, easing: 'cubicOut' });
}
export function focusOut(el: DriftTarget): void {
  el.animateTo({ scaleX: 1, scaleY: 1 }, { duration: DRIFT.focusMs, easing: 'cubicOut' });
}

/** Series-level state transition used with swell(): a calm ease for the glow (no overshoot). */
export function hoverSpring(motion: ResolvedMotion): Opt {
  return { stateAnimation: { duration: motion.enabled ? 300 : 0, easing: 'cubicOut' } };
}

/**
 * A — landing flash: when a bar finishes growing, its value end flashes once (bright cap +
 * bloom). Entrance only (the builder adds it on structural renders), one silent custom series
 * per visible bar series, geometry from `api.barLayout` like the bars themselves.
 */
export function landingFlash(theme: ResolvedTheme, motion: ResolvedMotion, bars: { name: string; color: string; values: (number | null)[]; delay: number | ((i: number) => number) }[], opts: { horizontal: boolean; barMaxWidth: number; barGap: string; barCategoryGap: string; hidden?: ReadonlySet<string> }): Opt[] {
  if (!motion.enabled || !theme.effects.glow) return [];
  const visible = bars.filter((b) => !opts.hidden?.has(b.name));
  const born = Date.now();
  return visible.map((bar, vi) => {
    const tone = theme.mode === 'light' ? bar.color : shade(bar.color, 0.7);
    return {
      id: `fx:land:${bar.name}`, name: bar.name, type: 'custom', coordinateSystem: 'cartesian2d', silent: true, tooltip: { show: false }, z: 4,
      data: bar.values.map((v, c) => (opts.horizontal ? [v ?? 0, c] : [c, v ?? 0])),
      renderItem: (params: Opt, api: Opt) => {
        const v = bar.values[params.dataIndex];
        if (v == null || v <= 0) return null;
        const lay = api.barLayout({ count: visible.length, barMaxWidth: opts.barMaxWidth, barGap: opts.barGap, barCategoryGap: opts.barCategoryGap })[vi];
        if (!lay) return null;
        const c = params.dataIndex;
        const end = api.coord(opts.horizontal ? [v, c] : [c, v]);
        const base = api.coord(opts.horizontal ? [0, c] : [c, 0]);
        const start = typeof bar.delay === 'function' ? bar.delay(c) : bar.delay;
        if (Date.now() > born + start + motion.entranceMs + 1200) return null; // one-shot
        const cap = opts.horizontal
          ? { x: end[0] - 3, y: base[1] + lay.offset - 2, width: 4, height: lay.width + 4 }
          : { x: base[0] + lay.offset - 2, y: end[1] - 1, width: lay.width + 4, height: 4 };
        return {
          type: 'rect', shape: { ...cap, r: 2 },
          style: { fill: tone, opacity: 0, shadowBlur: 18, shadowColor: alpha(bar.color, 0.95) },
          keyframeAnimation: {
            duration: 760, delay: start + Math.round(motion.entranceMs * 0.88), loop: false,
            keyframes: [
              { percent: 0, style: { opacity: 0 } },
              { percent: 0.18, style: { opacity: 1 }, easing: 'cubicOut' },
              { percent: 1, style: { opacity: 0 }, easing: 'cubicIn' },
            ],
          },
        };
      },
    };
  });
}

/**
 * F — leading edge: during the pie's entrance a bright radius rides the sweep front, in sync
 * with the single `expansion` sweep (same duration and easing), then fades out.
 * `outer` = pie outer radius in % of half the shorter side.
 */
export function sweepEdge(theme: ResolvedTheme, motion: ResolvedMotion, center: [string, string], outer: number, durationMs: number): Opt[] {
  if (!motion.enabled || !theme.effects.glow) return [];
  const pct = (v: string, size: number) => (parseFloat(v) / 100) * size;
  const tone = theme.mode === 'light' ? theme.tokens.accentBlue : shade(theme.tokens.accentCyan, 0.5);
  // One-shot: a redraw after the sweep (hover readouts, resizes) must not replay it.
  const until = Date.now() + durationMs + 400;
  return [{
    id: 'fx:sweep', type: 'custom', coordinateSystem: 'none', silent: true, tooltip: { show: false }, z: 5,
    data: [[0]],
    renderItem: (_params: Opt, api: Opt) => {
      if (Date.now() > until) return null;
      const w = api.getWidth(), h = api.getHeight();
      const cx = pct(center[0], w), cy = pct(center[1], h);
      const r = (outer / 100) * (Math.min(w, h) / 2);
      return {
        type: 'group', originX: cx, originY: cy,
        // Clockwise from 12 o'clock (zrender rotation is counter-clockwise, hence negative).
        keyframeAnimation: { duration: durationMs, loop: false, keyframes: [{ percent: 0, rotation: 0 }, { percent: 1, rotation: -Math.PI * 2, easing: 'cubicOut' }] },
        children: [
          {
            type: 'line', shape: { x1: cx, y1: cy, x2: cx, y2: cy - r - 4 },
            style: { stroke: tone, lineWidth: 2, opacity: 0, shadowBlur: 14, shadowColor: alpha(tone, 0.95) },
            keyframeAnimation: { duration: durationMs + 260, loop: false, keyframes: [{ percent: 0, style: { opacity: 0 } }, { percent: 0.06, style: { opacity: 1 } }, { percent: 0.82, style: { opacity: 0.9 } }, { percent: 1, style: { opacity: 0 } }] },
          },
          {
            type: 'circle', shape: { cx, cy: cy - r - 4, r: 3 },
            style: { fill: tone, opacity: 0, shadowBlur: 12, shadowColor: tone },
            keyframeAnimation: { duration: durationMs + 260, loop: false, keyframes: [{ percent: 0, style: { opacity: 0 } }, { percent: 0.06, style: { opacity: 1 } }, { percent: 0.82, style: { opacity: 1 } }, { percent: 1, style: { opacity: 0 } }] },
          },
        ],
      };
    },
  }];
}

/** E/G — hovered slice pops outward by this many px; the others shrink to this scale. */
export const PIE_HOVER = { popPx: 5, recede: 0.97, ms: 280, liftPx: 8, liftOutPx: 4, recede3d: 0.97 } as const;

/** Offset that pushes a sector outward along its mid-angle (zrender sector shape, canvas angles). */
export function popOffset(shape: { startAngle: number; endAngle: number }, px: number = PIE_HOVER.popPx): { x: number; y: number } {
  const mid = (shape.startAngle + shape.endAngle) / 2;
  return { x: Math.cos(mid) * px, y: Math.sin(mid) * px };
}

/**
 * Pie body: one disc cut into slices, not a collage. Solid slice colour (no per-slice gradient,
 * which lit every slice from its own corner) separated by thin dark seams; the shared light comes
 * from `discSheen`. Light mode: solid colour with white seams.
 */
export function pieSlice(theme: ResolvedTheme, color: string): Opt {
  // Opaque slices that touch: the seam is a thin line in a darker shade of the slice itself,
  // never the background colour, so the disc reads as one solid piece instead of separated wedges.
  return { color, borderColor: shade(color, theme.mode === 'light' ? -0.3 : -0.45), borderWidth: 1, borderJoin: 'round' };
}

/**
 * One light source for the whole disc: a soft highlight from the upper left plus a faint rim,
 * drawn once over all slices (silent `fx:` custom series). `tilt` < 1 squashes it for the 3D disc.
 * `size` returns the disc in pixels for the current canvas size.
 */
export function discSheen(theme: ResolvedTheme, size: (w: number, h: number) => { cx: number; cy: number; r: number; r0?: number; tilt?: number }, z2 = 150): Opt[] {
  if (!theme.effects.glow) return [];
  const light = theme.mode === 'light';
  return [{
    id: 'fx:sheen', type: 'custom', coordinateSystem: 'none', silent: true, tooltip: { show: false }, z: 3,
    data: [[0]],
    renderItem: (_p: Opt, api: Opt) => {
      const { cx, cy, r, r0 = 0, tilt = 1 } = size(api.getWidth(), api.getHeight());
      return {
        type: 'group', x: cx, y: cy, scaleY: tilt,
        children: [
          {
            type: 'sector', z2, shape: { cx: 0, cy: 0, r, r0, startAngle: 0, endAngle: Math.PI * 2 },
            style: { fill: { type: 'radial', x: 0.32, y: 0.26, r: 0.75, colorStops: [{ offset: 0, color: `rgba(255,255,255,${light ? 0.22 : 0.16})` }, { offset: 1, color: 'rgba(255,255,255,0)' }] } },
          },
          { type: 'circle', z2, shape: { cx: 0, cy: 0, r }, style: { fill: 'none', stroke: `rgba(255,255,255,${light ? 0.5 : 0.18})`, lineWidth: 1 } },
        ],
      };
    },
  }];
}

/**
 * 3D side wall of one slice: the visible (front) part of its outer edge as a curved band,
 * lit like a cylinder — brightest facing the viewer, darker toward the sides (global gradient
 * across the disc so neighbouring slices continue the same light).
 */
export function wallPolygons(a0: number, a1: number, cx: number, cy: number, R: number, tilt: number, D: number): number[][][] {
  const runs: number[][][] = [];
  let run: number[][] = [];
  const steps = Math.max(2, Math.ceil((a1 - a0) / 0.04));
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    if (Math.sin(t) >= -0.01) run.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R * tilt]);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1).map((top) => [...top, ...[...top].reverse().map(([x, y]) => [x!, y! + D])]);
}
