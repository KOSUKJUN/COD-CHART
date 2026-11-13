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

/** Border flow: one lap of the comet around the ring. */
export const BORDER_FLOW_PERIOD_MS = 8000;
/** Flow lights stay soft: a faint glow that hints at motion without pulling the eye off the data. */
const FLOW_SOFT = { opacity: 0.55, blur: 4, dotR: 1.8 } as const;

/**
 * Border flow: after the entrance sweep, one soft streak of light (no head dot, fading tail) runs
 * clockwise around the HUD halo ring just outside the pie/donut, forever. Flat (2D) pies only.
 * The lap position comes from the clock, so a redraw (hover readout, resize, data update)
 * carries on where the comet was instead of jumping back to 12 o'clock.
 * `outer` = ring radius in % of half the shorter side; `startDelayMs` = when the comet fades in.
 */
export function borderFlow(theme: ResolvedTheme, motion: ResolvedMotion, center: [string, string], outer: number, startDelayMs: number): Opt[] {
  if (!motion.enabled || !theme.effects.glow) return [];
  const pct = (v: string, size: number) => (parseFloat(v) / 100) * size;
  const tone = theme.mode === 'light' ? theme.tokens.accentBlue : shade(theme.tokens.accentCyan, 0.5);
  const TAIL = Math.PI * 0.42; // tail length (radians)
  const SEGMENTS = 14;
  const born = Date.now();
  return [{
    id: 'fx:border', type: 'custom', coordinateSystem: 'none', silent: true, tooltip: { show: false }, z: 4,
    data: [[0]],
    renderItem: (_params: Opt, api: Opt) => {
      const w = api.getWidth(), h = api.getHeight();
      const cx = pct(center[0], w), cy = pct(center[1], h);
      const r = (outer / 100) * (Math.min(w, h) / 2);
      // Where in the lap we are now; rotation runs clockwise (zrender rotation is counter-clockwise).
      const phase = ((Date.now() % BORDER_FLOW_PERIOD_MS) / BORDER_FLOW_PERIOD_MS) * Math.PI * 2;
      // Still inside the entrance: wait for the sweep, then fade in. A later redraw shows them at once.
      const delay = Math.max(0, startDelayMs - (Date.now() - born));
      const fadeIn = (opacity: number) => ({ enterFrom: { style: { opacity: 0 } }, enterAnimation: { duration: 700, delay }, style: { opacity } });
      // No head dot: just a streak of light that brightens toward its front, for a soft look.
      const comet = (offset: number) => Array.from({ length: SEGMENTS }, (_, j) => {
        const a0 = offset - TAIL + (j * TAIL) / SEGMENTS;
        const k = (j + 1) / SEGMENTS; // 0 → 1 toward the front
        const seg = fadeIn(FLOW_SOFT.opacity * Math.pow(k, 1.6));
        return {
          type: 'arc', shape: { cx, cy, r, startAngle: a0, endAngle: a0 + TAIL / SEGMENTS + 0.01 },
          ...seg, style: { ...seg.style, fill: 'none', stroke: tone, lineWidth: 1 + 1.4 * k, lineCap: 'round', shadowBlur: FLOW_SOFT.blur * k, shadowColor: tone },
        };
      });
      return {
        type: 'group', originX: cx, originY: cy,
        keyframeAnimation: {
          duration: BORDER_FLOW_PERIOD_MS, loop: true,
          keyframes: [{ percent: 0, rotation: -phase }, { percent: 1, rotation: -phase - Math.PI * 2, easing: 'linear' }],
        },
        children: comet(0),
      };
    },
  }];
}

/** Web flow: how long the light takes per web radius of travel. */
export const WEB_FLOW_MS_PER_RADIUS = 1400;

/**
 * Web flow: a closed wandering route over a radar web, in unit coordinates (outer ring radius 1,
 * y up). Mostly along the rings, now and then down or up a spoke, ending back where it began so
 * the light can loop without a jump. Deterministic per `seed`, so a redraw keeps the same route.
 */
export function webRoute(spokes: number, rings: number, seed: number, steps = 26): [number, number][] {
  let st = (seed >>> 0) || 1;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const at = (k: number, i: number): [number, number] => {
    const a = Math.PI / 2 + (((i % spokes) + spokes) % spokes) * ((Math.PI * 2) / spokes); // first spoke up, counter-clockwise
    return [Math.cos(a) * (k / rings), Math.sin(a) * (k / rings)];
  };
  let k = rings, i = 0, dir = 1;
  const route: [number, number][] = [at(k, i)];
  for (let n = 0; n < steps; n++) {
    const r = rnd();
    if (r < 0.2 && k > 1) k--; // inward along the spoke
    else if (r < 0.32 && k < rings) k++; // outward
    else { if (r > 0.92) dir = -dir; i += dir; } // along the ring, sometimes turning back
    route.push(at(k, i));
  }
  // Home: out along the spoke, then the short way round the outer ring.
  while (k < rings) route.push(at(++k, i));
  let back = ((-i % spokes) + spokes) % spokes;
  const step = back <= spokes / 2 ? 1 : -1;
  if (step < 0) back = spokes - back;
  for (let n = 0; n < back; n++) route.push(at(k, (i += step)));
  return route;
}

/**
 * Web flow: after the entrance, one soft streak of light (no head dot) wanders over the radar's
 * spider web (rings and spokes), forever. The route is fixed per chart and the position on it
 * comes from the clock, so a redraw carries on where the light was.
 * `radius` = web radius in % of half the shorter side, as ECharts' radar radius.
 */
export function webFlow(theme: ResolvedTheme, motion: ResolvedMotion, center: [string, string], radius: number, spokes: number, rings: number, seed: number, startDelayMs: number): Opt[] {
  if (!motion.enabled || !theme.effects.glow || spokes < 3) return [];
  const pct = (v: string, size: number) => (parseFloat(v) / 100) * size;
  const tone = theme.mode === 'light' ? theme.tokens.accentBlue : shade(theme.tokens.accentCyan, 0.5);
  const route = webRoute(spokes, rings, seed);
  const lens = route.slice(1).map(([x, y], n) => Math.hypot(x - route[n]![0], y - route[n]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const duration = Math.round(total * WEB_FLOW_MS_PER_RADIUS);
  const born = Date.now();
  const TRAIL = 9, LAG_MS = 40; // close-set dots read as one soft streak, no head dot
  return [{
    id: 'fx:web', type: 'custom', coordinateSystem: 'none', silent: true, tooltip: { show: false }, z: 4,
    data: [[0]],
    renderItem: (_params: Opt, api: Opt) => {
      const w = api.getWidth(), h = api.getHeight();
      const cx = pct(center[0], w), cy = pct(center[1], h);
      const R = (radius / 100) * (Math.min(w, h) / 2);
      const px = ([x, y]: [number, number]) => ({ x: cx + x * R, y: cy - y * R });
      const delay = Math.max(0, startDelayMs - (Date.now() - born));
      // Keyframes for a dot `lagMs` behind the head, starting from where it is now.
      const keyframes = (lagMs: number) => {
        const start = (((((Date.now() - lagMs) % duration) + duration) % duration) / duration) * total;
        // Walk the closed route once round from `start`: split the segment we are in.
        let acc = 0, seg = 0;
        while (seg < lens.length - 1 && acc + lens[seg]! < start) acc += lens[seg++]!;
        const f = lens[seg]! ? (start - acc) / lens[seg]! : 0;
        const a = route[seg]!, b = route[seg + 1]!;
        const here: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const pts: [number, number][] = [here, ...route.slice(seg + 1), ...route.slice(1, seg + 1), here];
        let d = 0;
        return pts.map((p, n) => {
          if (n) d += Math.hypot(p[0] - pts[n - 1]![0], p[1] - pts[n - 1]![1]);
          return { percent: Math.min(1, d / total), ...px(p), ...(n ? { easing: 'linear' } : {}) };
        });
      };
      const dot = (j: number) => {
        const k = 1 - j / TRAIL; // 1 at the front → fading trail
        const kf = keyframes(j * LAG_MS);
        return {
          type: 'circle', x: kf[0]!.x, y: kf[0]!.y, shape: { cx: 0, cy: 0, r: FLOW_SOFT.dotR * (0.5 + 0.5 * k) },
          style: { fill: tone, opacity: FLOW_SOFT.opacity * Math.pow(k, 1.6), shadowBlur: FLOW_SOFT.blur * k, shadowColor: tone },
          enterFrom: { style: { opacity: 0 } }, enterAnimation: { duration: 700, delay },
          keyframeAnimation: { duration, loop: true, keyframes: kf },
        };
      };
      // Back of the streak first, front on top.
      return { type: 'group', children: Array.from({ length: TRAIL }, (_, j) => dot(TRAIL - 1 - j)) };
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
