/**
 * ChartDefinition + rows → ECharts option. Pure (no DOM), unit-tested per type.
 *
 * Mark specs follow the data-viz method: 2px lines, ≥8px markers, 4px rounded
 * data-ends, 2px surface gaps between adjacent fills, recessive grid/axes, text in
 * text tokens (never series colours), legends for ≥2 series only.
 */
import type { RenderContext } from '../../core/adapter';
import { distinct, fieldMap, lttbIndices, numericExtent, sum } from '../../core/data';
import { escapeHtml, fieldLabel, formatAxisValue, formatTime, formatValue } from '../../core/format';
import { deepMerge, isPlainObject } from '../../core/sanitize';
import { ALL_PAIRS_SAFE_SLOTS, STATUS_META, statusForValue, type ResolvedTheme } from '../../core/theme';
import type { ChartDefinition, FieldDef, Row, StatusLevel } from '../../core/types';
import { alpha, DEPTH_PX, deltaText, depthShadow, discSheen, fillGradient, glow, holo, hoverSpring, hudRings, landingFlash, pieSlice, sweepEdge, wallPolygons, isEffectSeries, neonCore, pulseSeries, shade, SERIES_STAGGER_MS, sphere, stagger, swell, type PulsePoint } from './effects';
import { layoutWords } from './word-layout';
import { packCircles } from './pack-layout';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Opt = Record<string, any>;

export interface Lookup {
  row?: Row;
  rows?: Row[];
  name?: string;
  value?: unknown;
}

export interface BuildResult {
  option: Opt;
  /** [seriesIndex][dataIndex] → source row(s). */
  lookup: (seriesIndex: number, dataIndex: number) => Lookup | undefined;
  /** Treemap node id → rows. */
  nodeRows?: Map<string, Row[]>;
  warnings: string[];
  /**
   * Line/area: total length of the entrance draw. A data update merged in before it ends would
   * freeze the lines still waiting to draw, so the adapter holds updates back until then.
   */
  entranceMs?: number;
  /**
   * Line/area one-by-one (without `realtime`): the draw keeps cycling. After the entrance the finished chart holds
   * for `holdMs`, fades out and draws in again, line by line (the adapter runs the cycle).
   */
  loop?: { holdMs: number };
}

/** How long a one-by-one chart rests fully drawn before the next drawing cycle. */
export const DRAW_LOOP_HOLD_MS = 3000;
/** Auto-tour: default time on each mark. */
export const AUTO_TOUR_MS = 3000;
/** One-by-one: pause after a line has finished drawing before the next line starts. */
export const ONE_BY_ONE_GAP_MS = 1000;

/** Stable colour slots per entity name, persisted by the adapter across updates. */
export type SlotMap = Map<string, number>;

export function slotFor(slots: SlotMap, name: string): number {
  let s = slots.get(name);
  if (s === undefined) {
    s = slots.size;
    slots.set(name, s);
  }
  return s;
}

export const MAX_CATEGORICAL = 8;
export const OTHER_LABEL = '기타';

interface Ctx extends RenderContext {
  slots: SlotMap;
  /** Structural (first / replayed) render: one-shot entrance effects are included. */
  entrance?: boolean;
  /** Real-time x labels → running sequence number, persisted by the adapter (see `xSequence`). */
  xSeq?: XSeqMap;
}

/** x label → sequence number; key '' holds the running counter. */
export type XSeqMap = Map<string, number>;

/**
 * Give each x label a sequence number that survives updates: a label already seen keeps its
 * number, a new one gets the next. Real-time charts thin their x labels by this number (every
 * k-th), so the labels that are shown stay the same ones while the window slides.
 */
function xSequence(map: XSeqMap, labels: string[]): number[] {
  let prev = -1;
  const out = labels.map((label) => {
    let s = label === '' ? undefined : map.get(label);
    if (s === undefined || s <= prev) {
      s = (map.get('') ?? 0) + 1;
      map.set('', s);
      if (label !== '') map.set(label, s);
    }
    prev = s;
    return s;
  });
  // Forget labels well behind the window (a short tail stays, so a label that is scrolling out
  // can still be named while it leaves).
  const floor = (out[0] ?? 0) - 64;
  for (const [k, s] of map) if (k !== '' && s < floor) map.delete(k);
  return out;
}

/** Sequence number → x label, for every label the map still knows (window plus recent tail). */
function labelsBySeq(map: XSeqMap): Map<number, string> {
  const out = new Map<number, string>();
  for (const [k, s] of map) if (k !== '') out.set(s, k);
  return out;
}

// ── Shared pieces ─────────────────────────────────────────────────────────

function baseOption(ctx: Ctx): Opt {
  const { theme: t, motion, definition: def } = ctx;
  return {
    backgroundColor: 'transparent',
    color: t.palette,
    textStyle: { fontFamily: t.fontFamily, color: t.tokens.textSecondary, fontSize: 12 },
    animation: motion.enabled,
    animationDuration: motion.entranceMs,
    animationEasing: motion.easing,
    animationDurationUpdate: motion.updateMs,
    animationEasingUpdate: motion.updateEasing,
    // Sequential entrance (series builders refine this with their own item count).
    animationDelay: stagger(motion, ctx.rows.length),
    // Updates start together; only the entrance is sequential.
    animationDelayUpdate: 0,
    stateAnimation: { duration: motion.emphasisMs, easing: 'cubicOut' },
    aria: {
      enabled: true,
      label: { enabled: true, description: ctx.summary },
      decal: { show: def.options?.patterns === true },
    },
  };
}

function tooltipBase(t: ResolvedTheme, trigger: 'axis' | 'item', pointer?: 'line' | 'shadow' | 'none'): Opt {
  return {
    show: true,
    trigger,
    confine: true,
    renderMode: 'html',
    // Glass panel: translucent elevated surface + backdrop blur + faint accent glow.
    backgroundColor: alpha(t.tokens.tooltipBg, 0.88),
    borderColor: t.tokens.tooltipBorder,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: t.tokens.textPrimary, fontFamily: t.fontFamily, fontSize: 12 },
    extraCssText:
      // Long names wrap inside a capped width instead of stretching the panel past the chart.
      `max-width:min(300px,92%);white-space:normal;word-break:keep-all;overflow-wrap:anywhere;` +
      `border-radius:${t.radius.md}px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);` +
      `box-shadow:0 12px 32px rgba(0,0,0,.36)${t.effects.glow ? `,0 0 24px ${alpha(t.tokens.accentBlue, 0.16)}` : ''};`,
    transitionDuration: 0.15,
    ...(pointer
      ? {
          axisPointer: pointer === 'line'
            ? { type: 'line', lineStyle: { color: alpha(t.tokens.accentCyan, 0.55), width: 1, type: 'dashed' }, label: { show: false } }
            : pointer === 'none' ? { type: 'none' }
            : { type: 'shadow', shadowStyle: { color: t.tokens.selection } },
        }
      : {}),
  };
}

function marker(color: string): string {
  return `<span style="display:inline-block;flex-shrink:0;width:8px;height:8px;border-radius:2px;margin-right:8px;background:${escapeHtml(color)}"></span>`;
}

function tooltipRow(color: string, name: string, value: string, strong = false, detail = ''): string {
  return `<div style="display:flex;align-items:center;gap:16px;justify-content:space-between;line-height:20px">` +
    `<span style="display:flex;align-items:center;min-width:0;color:inherit;opacity:.82">${marker(color)}${escapeHtml(name)}</span>` +
    // data-cv-count: the adapter counts this value up when the tooltip appears.
    `<span style="flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:${strong ? 700 : 600}"><span data-cv-count>${escapeHtml(value)}</span>` +
    (detail ? `<span style="margin-left:8px;font-size:11px;font-weight:500;opacity:.62">${escapeHtml(detail)}</span>` : '') +
    `</span></div>`;
}

function tooltipHeader(text: string): string {
  return `<div style="font-weight:600;margin-bottom:6px;opacity:.95">${escapeHtml(text)}</div>`;
}

function legendOption(ctx: Ctx, names: string[], position: 'top' | 'bottom' | 'right'): Opt {
  const t = ctx.theme.tokens;
  const common = {
    type: 'scroll', data: names, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16,
    textStyle: { color: t.textSecondary, fontSize: 12 }, inactiveColor: t.disabled, inactiveBorderColor: t.disabled,
    pageIconColor: t.textSecondary, pageIconInactiveColor: t.disabled, pageTextStyle: { color: t.textMuted },
    // Every legend filters its chart (product rule); hidden items keep their grey state across redraws.
    selectedMode: true,
    ...(ctx.hidden?.size ? { selected: Object.fromEntries(names.map((n) => [n, !ctx.hidden!.has(n)])) } : {}),
  };
  if (position === 'right') return { ...common, orient: 'vertical', right: 0, top: 'middle' };
  if (position === 'bottom') return { ...common, bottom: 0, left: 0 };
  return { ...common, top: 0, left: 0 };
}

function legendPosition(def: ChartDefinition, seriesCount: number): 'top' | 'bottom' | 'right' | null {
  const l = def.options?.legend;
  if (l === false || seriesCount < 2) return null; // single series: the title names it
  return l === 'bottom' || l === 'right' ? l : l === 'top' || l === true ? 'top' : 'top';
}

function axisCommon(t: ResolvedTheme): Opt {
  return {
    axisLine: { show: true, lineStyle: { color: t.tokens.axisLine } },
    axisTick: { show: false },
    axisLabel: { color: t.tokens.textMuted, fontSize: 11, hideOverlap: true, margin: 10 },
    splitLine: { show: false },
    nameTextStyle: { color: t.tokens.textMuted, fontSize: 11 },
  };
}

function valueAxis(t: ResolvedTheme, field: FieldDef | undefined, locale: string, percent = false): Opt {
  return {
    type: 'value',
    ...axisCommon(t),
    axisLine: { show: false },
    // Dashed HUD grid (dark: faint accent; light: neutral rule).
    splitLine: { show: true, lineStyle: { color: t.mode === 'light' ? t.tokens.gridLine : alpha(t.tokens.accentCyan, 0.09), width: 1, type: [4, 4] } },
    axisLabel: {
      ...axisCommon(t).axisLabel,
      formatter: (v: number) => (percent ? `${Math.round(v * 100)}%` : formatAxisValue(v, field, locale)),
    },
    ...(percent ? { max: 1, min: 0 } : {}),
  };
}

function thresholdMarkLine(ctx: Ctx, horizontalValueAxis: boolean): Opt | undefined {
  const th = ctx.definition.options?.thresholds;
  if (!th?.length) return undefined;
  const t = ctx.theme;
  return {
    silent: true,
    symbol: 'none',
    animation: false,
    data: th.map((x) => ({
      [horizontalValueAxis ? 'xAxis' : 'yAxis']: x.value,
      name: x.label ?? String(x.value),
      lineStyle: { color: t.status[x.status ?? 'warning'], type: 'dashed', width: 1.5 },
      label: {
        show: true,
        position: horizontalValueAxis ? 'end' : 'insideEndTop',
        color: t.tokens.textSecondary,
        fontSize: 11,
        formatter: `${STATUS_META[x.status ?? 'warning'].icon} ${x.label ?? x.value}`,
      },
    })),
  };
}

// ── Cartesian: line / area / bar / stacked-bar / column ───────────────────

interface SeriesData {
  name: string;
  /** Aligned to categories (category axis) or [x, y] pairs (time/value axis). */
  values: (number | null)[];
  pairs: [number, number | null][];
  rows: (Row | undefined)[];
}

function collectSeries(def: ChartDefinition, rows: Row[], xIsContinuous: boolean): { categories: unknown[]; series: SeriesData[] } {
  const e = def.encoding ?? {};
  const x = e.x!;
  const ys = (Array.isArray(e.y) ? e.y : [e.y!]).filter(Boolean);
  const fm = fieldMap(def.data.fields);
  const categories = xIsContinuous ? [] : distinct(rows, x);
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  const out: SeriesData[] = [];
  const make = (name: string): SeriesData => ({ name, values: categories.map(() => null), pairs: [], rows: xIsContinuous ? [] : categories.map(() => undefined) });

  if (e.color) {
    const groups = new Map<string, SeriesData>();
    for (const r of rows) {
      const g = r[e.color];
      if (g === null || g === undefined) continue;
      const key = String(g);
      let s = groups.get(key);
      if (!s) groups.set(key, (s = make(key)));
      const v = typeof r[ys[0]!] === 'number' ? (r[ys[0]!] as number) : null;
      if (xIsContinuous) {
        if (typeof r[x] === 'number') {
          s.pairs.push([r[x] as number, v]);
          s.rows.push(r);
        }
      } else {
        const i = catIndex.get(r[x]);
        if (i !== undefined) {
          s.values[i] = (s.values[i] ?? 0) + (v ?? 0);
          s.rows[i] = r;
        }
      }
    }
    out.push(...groups.values());
  } else {
    for (const y of ys) {
      const s = make(fieldLabel(fm.get(y), y));
      for (const r of rows) {
        const v = typeof r[y] === 'number' ? (r[y] as number) : null;
        if (xIsContinuous) {
          if (typeof r[x] === 'number') {
            s.pairs.push([r[x] as number, v]);
            s.rows.push(r);
          }
        } else {
          const i = catIndex.get(r[x]);
          if (i !== undefined) {
            s.values[i] = v === null ? s.values[i] ?? null : (s.values[i] ?? 0) + v;
            s.rows[i] = r;
          }
        }
      }
      out.push(s);
    }
  }
  if (xIsContinuous) for (const s of out) {
    const order = s.pairs.map((_, i) => i).sort((a, b) => s.pairs[a]![0] - s.pairs[b]![0]);
    s.pairs = order.map((i) => s.pairs[i]!);
    s.rows = order.map((i) => s.rows[i]);
  }
  return { categories, series: out };
}

function buildCartesian(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const type = def.type;
  const e = def.encoding ?? {};
  const fm = fieldMap(def.data.fields);
  const xField = fm.get(e.x!);
  const yFirst = Array.isArray(e.y) ? e.y[0] : e.y;
  const yField = yFirst ? fm.get(yFirst) : undefined;
  const warnings: string[] = [];
  const isBarLike = type === 'bar' || type === 'column' || type === 'stacked-bar';
  const horizontal = isBarLike && (def.options?.orientation ?? (type === 'bar' ? 'horizontal' : 'vertical')) === 'horizontal';
  const xIsContinuous = !isBarLike && (xField?.type === 'time' || xField?.type === 'number');
  const stackMode = type === 'stacked-bar' ? (def.options?.stack === 'percent' ? 'percent' : 'stacked') : type === 'area' ? def.options?.stack ?? 'none' : 'none';
  const stacked = stackMode !== 'none';
  const percent = stackMode === 'percent';

  let { categories, series } = collectSeries(def, rows, xIsContinuous);

  // Fold beyond 8 series into "기타" — never generate a 9th hue.
  if (series.length > MAX_CATEGORICAL) {
    const keep = series.slice(0, MAX_CATEGORICAL - 1);
    const rest = series.slice(MAX_CATEGORICAL - 1);
    if (!xIsContinuous) {
      const other: SeriesData = { name: OTHER_LABEL, values: categories.map((_, i) => rest.reduce<number | null>((a, s) => (s.values[i] == null ? a : (a ?? 0) + s.values[i]!), null)), pairs: [], rows: categories.map(() => undefined) };
      series = [...keep, other];
    } else series = keep;
    warnings.push(`시리즈 ${rest.length + keep.length}개 중 ${rest.length}개를 '${OTHER_LABEL}'(으)로 묶었습니다.`);
  }

  // Explicit point cap (LTTB) for continuous x.
  const maxPoints = def.options?.maxPoints;
  if (xIsContinuous && maxPoints && maxPoints >= 3) {
    for (const s of series) if (s.pairs.length > maxPoints) {
      const idx = lttbIndices(s.pairs.map((p) => p[0]), s.pairs.map((p) => p[1] ?? 0), maxPoints);
      s.pairs = idx.map((i) => s.pairs[i]!);
      s.rows = idx.map((i) => s.rows[i]);
      warnings.push(`'${s.name}' 시리즈를 ${maxPoints.toLocaleString()}개 지점으로 샘플링했습니다 (LTTB).`);
    }
  }

  // Real-time append (line/area): keep only the newest `windowSize` x values, so appended data
  // pushes the oldest off the left edge. Matching x labels keep their identity across updates,
  // which is what makes ECharts slide the existing points left instead of re-drawing the lines.
  const realtime = isBarLike ? undefined : def.options?.realtime || undefined;
  const windowSize = typeof realtime === 'object' ? realtime.windowSize : undefined;
  if (windowSize) {
    if (!xIsContinuous && categories.length > windowSize) {
      const cut = categories.length - windowSize;
      categories = categories.slice(cut);
      for (const s of series) { s.values = s.values.slice(cut); s.rows = s.rows.slice(cut); }
    } else if (xIsContinuous) {
      for (const s of series) if (s.pairs.length > windowSize) { s.pairs = s.pairs.slice(-windowSize); s.rows = s.rows.slice(-windowSize); }
    }
  }
  // Top-N ranking (horizontal bar, one series): ECharts sorts the bars by value on every update,
  // so a bar that overtakes another visibly swaps places with it (bar-race).
  const rankingOpt = type === 'bar' && horizontal && series.length === 1 ? def.options?.ranking : undefined;
  const ranking = rankingOpt ? { top: Math.min((typeof rankingOpt === 'object' ? rankingOpt.top : undefined) ?? 10, categories.length) } : null;
  if (def.options?.ranking && !ranking) warnings.push('순위(ranking)는 시리즈 하나인 가로 막대에서만 동작합니다.');
  // Real-time over category x: each x label gets a running sequence number and the x axis
  // becomes a numeric axis over those numbers. Positions are then continuous, which lets the
  // adapter shift in two steps — the oldest point leaves first, then the new segment is drawn
  // out from the previous last point (a category slot cannot hold a point in between).
  const xLabels = categories.map((c) => (xField?.type === 'time' ? formatTime(c, locale) : String(c)));
  const xSeqMap: XSeqMap = ctx.xSeq ?? new Map();
  const rtSeq = realtime && !xIsContinuous && categories.length ? xSequence(xSeqMap, xLabels) : null;
  /** x position of category i (its sequence number in real time, else the index). */
  const xAt = (i: number) => (rtSeq ? rtSeq[i]! : i);
  const rtIndex = new Map((rtSeq ?? []).map((q, i) => [q, i]));
  // Real time over a time x (stream data sources): points keyed by their timestamp and the x
  // window pinned to the data's time span, so the adapter can scroll it the same way.
  const rtTime = realtime && xIsContinuous && xField?.type === 'time' && !stacked
    ? (() => {
        const xs = series.flatMap((s) => s.pairs.map((p) => p[0]));
        return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
      })()
    : null;
  // Newest-point pulse: streamed/polled data, or an explicit real-time chart.
  const live = ctx.motion.live || (!!realtime && ctx.motion.enabled);
  // Line/area entrance order. One-by-one: each line draws fully before the next one starts.
  const oneByOne = !isBarLike && def.options?.drawOrder === 'one-by-one' && ctx.motion.enabled;
  // One line's draw: 1.8 s at the default 2 s entrance.
  const lineMs = Math.round(Math.max(600, ctx.motion.entranceMs * 0.9));
  // Pause between one finished line and the start of the next, so each line reads on its own.
  const lineGapMs = ONE_BY_ONE_GAP_MS;
  const drawSlot = new Map(series.filter((s) => !ctx.hidden?.has(s.name)).map((s, i) => [s.name, i]));
  const drawDelay = (si: number) => (oneByOne ? (drawSlot.get(series[si]!.name) ?? 0) * (lineMs + lineGapMs) : ctx.motion.enabled ? si * SERIES_STAGGER_MS : 0);

  // Percent stacking: normalise per category.
  let totals: number[] = [];
  if (percent && !xIsContinuous) {
    totals = categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  }

  const legendPos = legendPosition(def, series.length);
  // Range navigator: explicit options.zoom wins, otherwise the 'zoom' interaction.
  const zoom = !isBarLike && (def.options?.zoom ?? def.interactions?.includes('zoom') === true);
  const selection = def.interactions?.includes('selection');
  const totalPoints = series.reduce((a, s) => a + (xIsContinuous ? s.pairs.length : s.values.length), 0);
  const large = totalPoints > 4000;
  // Shadows on thousands of points cost more than they add.
  const fxTheme: ResolvedTheme = large ? { ...t, effects: { ...t.effects, glow: false, depth: false } } : t;
  const colors = series.map((s) => t.palette[slotFor(ctx.slots, s.name) % t.palette.length]!);
  const thresholds = def.options?.thresholds ?? [];
  const pointCount = xIsContinuous ? Math.max(0, ...series.map((s) => s.pairs.length)) : categories.length;

  const echSeries: Opt[] = series.map((s, si): Opt => {
    const color = colors[si]!;
    const plain = (v: number | null, i: number) => (percent ? (v == null ? null : totals[i] ? Math.max(0, v) / totals[i]! : 0) : v);
    const data: unknown[] = xIsContinuous
      ? (rtTime ? s.pairs.map((p) => ({ name: String(p[0]), value: [p[0], p[1]] })) : s.pairs)
      // Real time: keyed by label so a point keeps its identity while the window slides.
      : rtSeq ? s.values.map((v, i) => ({ name: xLabels[i], value: [rtSeq[i], plain(v, i)] }))
      : s.values.map(plain);
    // Live event emphasis on bars: a breached threshold lights the bar in its status colour.
    if (isBarLike && thresholds.length && !stacked) {
      s.values.forEach((v, i) => {
        if (v == null) return;
        const level = statusForValue(v, thresholds);
        if (level === 'ok') return;
        const c = t.status[level];
        data[i] = { value: data[i], itemStyle: { borderColor: c, borderWidth: 1.5, ...glow(fxTheme, c, 2) } };
      });
    }
    const common: Opt = {
      // Stable id: lets replaceMerge keep the series across data updates so values tween
      // instead of the series being re-created (which would replay the entrance animation).
      id: `s:${s.name}`,
      name: s.name,
      data,
      itemStyle: { color },
      // Axis tooltips compare all series at an x; blurring the others would hide that comparison.
      emphasis: { focus: series.length > 1 && isBarLike ? 'series' : 'none', blurScope: 'coordinateSystem' },
      blur: { itemStyle: { opacity: 0.25 }, lineStyle: { opacity: 0.25 }, areaStyle: { opacity: 0.05 } },
      ...(stacked ? { stack: 'total', stackStrategy: 'positive' } : {}),
      ...(si === 0 ? { markLine: thresholdMarkLine(ctx, horizontal) } : {}),
      universalTransition: { enabled: true },
    };
    if (isBarLike && t.effects.depth && !large && !ranking) {
      const display = s.values.map((v, i) => (percent ? (v == null ? null : totals[i] ? Math.max(0, v) / totals[i]! : 0) : v));
      const bases = s.values.map((_, i) => {
        if (!stacked) return 0;
        let acc = 0;
        for (let k = 0; k < si; k++) {
          const raw = series[k]!.values[i];
          if (raw != null && raw > 0) acc += percent ? (totals[i] ? raw / totals[i]! : 0) : raw;
        }
        return acc;
      });
      const breach = s.values.map((v) => (thresholds.length && !stacked && v != null && statusForValue(v, thresholds) !== 'ok' ? t.status[statusForValue(v, thresholds)] : null));
      return extrudedBars(ctx, {
        common, color, display, bases, breach, horizontal, stacked,
        slot: stacked ? 0 : si, slots: stacked ? 1 : series.length,
        label: labelForBars(ctx, horizontal, yField, percent),
        delay: stagger(ctx.motion, pointCount, si),
      });
    }
    if (isBarLike) {
      const last = si === series.length - 1;
      const r = stacked && !last ? 0 : 4;
      return {
        ...common,
        // Sequential entrance: bars rise one category after another, series offset slightly.
        animationDelay: stagger(ctx.motion, pointCount, si),
        emphasis: { ...common.emphasis, itemStyle: glow(fxTheme, color, 1.8) },
        type: 'bar',
        barMaxWidth: 28,
        // Faint full-length track behind each bar (HUD meter look).
        showBackground: !stacked,
        backgroundStyle: { color: alpha(t.tokens.accentCyan, t.mode === 'light' ? 0.05 : 0.045), borderRadius: horizontal ? [0, r, r, 0] : [r, r, 0, 0] },
        barMinHeight: 1,
        barGap: '12%',
        barCategoryGap: series.length > 1 && !stacked ? '28%' : '36%',
        large,
        selectedMode: selection ? 'single' : false,
        select: { itemStyle: { borderColor: t.tokens.focus, borderWidth: 2 } },
        itemStyle: {
          // Value end lit, fading toward the baseline (subtler inside stacks so segments stay distinct).
          color: fillGradient(t, color, horizontal ? 'right' : 'up', stacked ? 0.78 : 0.14),
          ...(stacked ? {} : glow(fxTheme, color, 0.5)),
          borderRadius: horizontal ? [0, r, r, 0] : [r, r, 0, 0],
          // 2px surface gap between stacked segments.
          ...(stacked ? { borderColor: t.tokens.bgSurface, borderWidth: 1 } : {}),
        },
        label: labelForBars(ctx, horizontal, yField, percent),
        // B — hover count-up value at the bar end (the adapter draws it; skipped when labels show).
        ...(!stacked ? { hoverValue: { horizontal, color, format: (v: number) => formatValue(v, yField, { locale }) } } : {}),
      };
    }
    // line / area
    const area = type === 'area';
    return {
      ...common,
      type: 'line',
      // Lines draw in left → right (clip animation); each series starts slightly after the previous
      // ('together'), or only once the previous line has finished ('one-by-one').
      animationDelay: drawDelay(si),
      ...(oneByOne ? { animationDuration: lineMs } : {}),
      smooth: def.options?.smooth ? 0.35 : false,
      showSymbol: def.options?.showPoints ?? false,
      symbol: 'circle',
      symbolSize: 8,
      connectNulls: false,
      sampling: 'lttb',
      // 3D style: the line casts a drop shadow onto the surface below it (replaces the glow).
      // Neon tube: bright core stroke, bloom in the base hue (3D: drop shadow instead).
      lineStyle: { width: t.effects.depth ? 2.5 : 2, color: neonCore(fxTheme, color), ...glow(fxTheme, color), ...depthShadow(fxTheme) },
      itemStyle: { color, borderColor: t.tokens.bgSurface, borderWidth: 2 },
      // Lines carry no fill at all, so they never read as an area chart.
      ...(area
        ? {
            areaStyle: stacked
              ? { opacity: 0.38, color, ...depthShadow(fxTheme, 0.8) }
              : {
                  color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: alpha(color, t.effects.gradient ? 0.4 : 0.32) }, { offset: 1, color: alpha(color, 0.02) }],
                  },
                  ...depthShadow(fxTheme, 0.8),
                },
          }
        : {}),
      emphasis: { ...common.emphasis, scale: 1.4, lineStyle: { width: 2.5, ...glow(fxTheme, color, 1.6) }, itemStyle: glow(fxTheme, color, 2) },
    };
  });

  // ── Event emphasis overlays (line / area) ──
  if (!isBarLike) {
    // Plotted y for (series, index): stacked series sit on the running positive sum.
    const plottedY = (si: number, i: number): number | null => {
      const own = series[si]!.values[i];
      if (own == null) return null;
      if (!stacked) return own;
      let acc = 0;
      for (let k = 0; k <= si; k++) acc += Math.max(0, series[k]!.values[i] ?? 0);
      return percent ? (totals[i] ? acc / totals[i]! : 0) : acc;
    };
    series.forEach((s, si) => {
      // Data flow: a light pulse travels along each neon line after it has drawn in.
      if (ctx.motion.enabled && fxTheme.effects.glow && !stacked && !xIsContinuous && !def.options?.smooth) {
        const runs: number[][][] = [];
        let run: number[][] = [];
        s.values.forEach((v, i) => {
          if (v == null) { if (run.length > 1) runs.push(run); run = []; } else run.push([xAt(i), v]);
        });
        if (run.length > 1) runs.push(run);
        if (runs.length) {
          const c = colors[si]!;
          echSeries.push({
            id: `fx:flow:${s.name}`, name: s.name, type: 'lines', coordinateSystem: 'cartesian2d', polyline: true,
            silent: true, tooltip: { show: false }, z: 4, animation: false,
            lineStyle: { width: 0, opacity: 0 },
            effect: {
              show: true, delay: oneByOne ? drawDelay(si) + lineMs : ctx.motion.entranceMs + si * SERIES_STAGGER_MS, period: 4 + si * 0.6, trailLength: 0.28,
              symbol: 'circle', symbolSize: 4, color: t.mode === 'light' ? c : shade(c, 0.65), loop: true,
            },
            data: runs.map((coords) => ({ coords })),
          });
        }
      }
      // Live: a ripple on the newest point of every streaming series.
      if (live && !(stacked && xIsContinuous)) {
        let point: unknown[] | null = null;
        if (xIsContinuous) {
          for (let i = s.pairs.length - 1; i >= 0 && !point; i--) if (s.pairs[i]![1] != null) point = s.pairs[i]!;
        } else {
          for (let i = s.values.length - 1; i >= 0 && !point; i--) {
            const y = plottedY(si, i);
            if (y != null) point = [xAt(i), y];
          }
        }
        // Late data (stale): the marker greys out and stops rippling — the line is no longer live.
        if (point) echSeries.push(pulseSeries(fxTheme, ctx.stale ? { ...ctx.motion, enabled: false } : ctx.motion, `live:${s.name}`, s.name, [{ value: point, color: ctx.stale ? t.tokens.textMuted : colors[si]! }]));
      }
      // Threshold events: ring the most recent breaches in their status colour.
      if (thresholds.length && !stacked) {
        const raw = xIsContinuous ? s.pairs.map((p) => p[1]) : s.values;
        const hits: PulsePoint[] = [];
        for (let i = raw.length - 1; i >= 0 && hits.length < 6; i--) {
          const v = raw[i];
          if (v == null) continue;
          const level = statusForValue(v, thresholds);
          if (level !== 'ok') hits.push({ value: xIsContinuous ? s.pairs[i]! : [xAt(i), v], color: t.status[level] });
        }
        if (hits.length) echSeries.push(pulseSeries(fxTheme, ctx.motion, `breach:${s.name}`, s.name, hits.reverse(), 7));
      }
    });
  }
  // A — landing flash: each bar's value end flashes once as it lands (entrance only).
  if (ctx.entrance && isBarLike && !stacked && !t.effects.depth && !large && !xIsContinuous && !ranking) {
    echSeries.push(...landingFlash(fxTheme, ctx.motion, series.map((s, si) => ({ name: s.name, color: colors[si]!, values: s.values, delay: stagger(ctx.motion, pointCount, si) })), {
      horizontal, barMaxWidth: 28, barGap: '12%', barCategoryGap: series.length > 1 ? '28%' : '36%', hidden: ctx.hidden,
    }));
  }
  const prevValue = (si: number, di: number): unknown => {
    const s = series[si];
    if (!s || di < 1) return undefined;
    return xIsContinuous ? s.pairs[di - 1]?.[1] : s.values[di - 1];
  };

  const xLabelFormatter = (v: unknown) => (xField?.type === 'time' ? formatTime(v, locale) : String(v));
  const categoryAxis: Opt = xIsContinuous
    ? { type: xField?.type === 'time' ? 'time' : 'value', ...axisCommon(t), scale: xField?.type === 'number', boundaryGap: false }
    : {
        type: 'category',
        data: categories.map((c) => (xField?.type === 'time' ? formatTime(c, locale) : String(c))),
        ...axisCommon(t),
        boundaryGap: isBarLike,
        ...(horizontal ? { inverse: true } : {}),
        axisLabel: { ...axisCommon(t).axisLabel, width: horizontal ? 120 : undefined, overflow: 'truncate' },
      };
  // Real-time (category x): the x labels scroll with the data, like Highcharts' dynamic update.
  // ECharts redraws axis labels in place (they jump), so the native labels are kept only for
  // layout (transparent) and a custom series draws the visible ones, keyed by label, so each
  // label slides left with its point, a new one slides in from the right and the oldest slides
  // out at the left edge.
  /**
   * The sliding x labels (custom series, one text per label keyed by its name). `textOf` names a
   * label from its x; `thinBy` (category mode) keeps every k-th by sequence number when crowded.
   */
  const xLabelSeries = (data: Opt[], textOf: (x: number, seq: number) => string, thin: boolean): Opt => {
    const fontSize = 11;
    return {
      id: 'fx:xlabels', name: 'fx:xlabels', type: 'custom', coordinateSystem: 'cartesian2d',
      silent: true, tooltip: { show: false }, legendHoverLink: false, clip: false, z: 1,
      encode: { x: 0, y: 1 },
      data,
      renderItem: (params: Opt, api: Opt) => {
        const cs = params.coordSys as { x: number; y: number; width: number; height: number };
        const label = textOf(api.value(0) as number, api.value(2) as number);
        if (thin) {
          // Thin by sequence number so the shown labels stay the same ones as the window slides.
          const step = Math.max(1, api.size([1, 0])[0] as number);
          const every = Math.max(1, Math.ceil((label.length * fontSize * 0.62 + 14) / step));
          if ((api.value(2) as number) % every !== 0) return null;
        }
        const x = api.coord([api.value(0), 0])[0] as number;
        // Outside the x window (parked beyond the right edge, or scrolled past the left) a label is
        // transparent, so it fades in as it scrolls in and fades out as it scrolls away.
        const inside = x >= cs.x - 1 && x <= cs.x + cs.width + 1;
        return {
          type: 'text', x, y: cs.y + cs.height + 10,
          style: { text: label, fill: t.tokens.textMuted, fontSize, fontFamily: t.fontFamily, align: 'center', verticalAlign: 'top', opacity: inside ? 1 : 0 },
          transition: ['x', 'style'],
          enterFrom: { style: { opacity: 0 } },
          // A new label arrives at the pace of the scroll, not the slow chart entrance.
          enterAnimation: { duration: ctx.motion.updateMs },
          // No `leaveTo`: ECharts (6.0) throws in the leave transition of a removed custom element,
          // which aborts the whole label redraw. The oldest label just drops at the left edge.
        };
      },
    };
  };
  if (rtSeq) {
    const labels = xLabels;
    const seqs = rtSeq;
    // Text by sequence number, not position: while scrolling, the series also holds the leaving label.
    const nameOf = labelsBySeq(xSeqMap);
    // Numeric x over the sequence numbers, spanning exactly the window (see rtSeq).
    Object.assign(categoryAxis, {
      type: 'value', data: undefined, min: seqs[0], max: seqs[seqs.length - 1], interval: 1, boundaryGap: false,
      // Native labels only reserve the layout space; the custom series below draws the visible ones.
      axisLabel: { ...categoryAxis.axisLabel, color: 'transparent', formatter: (v: number) => labels[rtIndex.get(v) ?? -1] ?? '' },
    });
    delete categoryAxis.data;
    echSeries.push(xLabelSeries(labels.map((label, i) => ({ name: label, value: [seqs[i], 0, seqs[i]] })), (_x, seq) => nameOf.get(seq) ?? '', true));
  }
  if (rtTime && rtTime.max > rtTime.min) {
    // Real time over a time x: the window is pinned to the data's time span and the labels sit on
    // round time steps (one more beyond each edge, so they can scroll in and out).
    const { min, max } = rtTime;
    const step = TIME_STEPS.find((s) => s >= (max - min) / 6) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
    const ticks: number[] = [];
    for (let x = Math.floor(min / step) * step; x <= max + step; x += step) ticks.push(x);
    Object.assign(categoryAxis, {
      min, max,
      axisLabel: { ...categoryAxis.axisLabel, color: 'transparent', formatter: (v: number) => clockText(v, step) },
    });
    echSeries.push(xLabelSeries(ticks.map((x) => ({ name: String(x), value: [x, 0, 0] })), (x) => clockText(x, step), false));
  }
  if (ranking) {
    // Bar-race: one colour per entity (follows it as it moves), value labels counting along,
    // only the top N rows shown; the category axis animates its labels with the bars.
    const s0 = echSeries[0]!;
    const values = series[0]!.values;
    Object.assign(s0, {
      realtimeSort: true,
      animationDelay: 0,
      showBackground: false,
      emphasis: { ...s0.emphasis, focus: 'none' },
      data: values.map((v, i) => {
        const c = t.palette[slotFor(ctx.slots, String(categories[i])) % t.palette.length]!;
        return { value: v, itemStyle: { color: fillGradient(t, c, 'right', 0.14), borderRadius: [0, 4, 4, 0], ...glow(fxTheme, c, 0.5) } };
      }),
      label: { ...labelForBars(ctx, true, yField, false), show: true, valueAnimation: ctx.motion.enabled, precision: 0 },
    });
    Object.assign(categoryAxis, {
      max: ranking.top - 1,
      animationDuration: ctx.motion.updateMs,
      animationDurationUpdate: ctx.motion.updateMs,
      axisLabel: { ...categoryAxis.axisLabel, color: t.tokens.textSecondary },
    });
  }
  const valAxis = valueAxis(t, yField, locale, percent);
  const unitName = !percent && yField?.unit && series.length >= 1 ? yField.unit : '';
  if (unitName) Object.assign(valAxis, { name: unitName, nameGap: 12 });

  const option: Opt = {
    ...baseOption(ctx),
    grid: {
      left: 4, right: horizontal ? 24 : 12,
      top: (legendPos === 'top' ? 36 : 12) + (unitName && !horizontal ? 14 : 0),
      bottom: zoom ? 44 : legendPos === 'bottom' ? 32 : 4,
      outerBoundsMode: 'same', outerBoundsContain: 'axisLabel',
    },
    xAxis: horizontal ? valAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valAxis,
    series: echSeries,
    tooltip: {
      // Bars: no hover band behind the category — the hovered bar's own highlight is enough.
      ...tooltipBase(t, 'axis', isBarLike ? 'none' : 'line'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (params: Opt | Opt[]) => {
        const list = (Array.isArray(params) ? params : [params]).filter((p) => !isEffectSeries(p) && p.value !== null && p.value !== undefined);
        if (!list.length) return '';
        const p0 = list[0]!;
        const head = xIsContinuous ? xLabelFormatter(Array.isArray(p0.value) ? p0.value[0] : p0.axisValue)
          : rtSeq ? String(p0.name ?? '') // real time: points carry their x label as name
          : String(p0.axisValueLabel ?? p0.name);
        const body = list.map((p) => {
          const raw = Array.isArray(p.value) ? p.value[1] : p.value;
          let text = formatValue(raw, yField, { locale });
          if (percent) {
            const src = series[p.seriesIndex]?.values[p.dataIndex];
            text = `${Math.round((raw as number) * 1000) / 10}% · ${formatValue(src, yField, { locale })}`;
          }
          // Hover detail: change vs. the previous point, plus the status when a threshold is crossed.
          const own = percent ? series[p.seriesIndex]?.values[p.dataIndex] : raw;
          const delta = deltaText(own, prevValue(p.seriesIndex, p.dataIndex), locale);
          const level = thresholds.length && typeof own === 'number' ? statusForValue(own, thresholds) : 'ok';
          const status = level !== 'ok' ? `${STATUS_META[level].icon} ${STATUS_META[level].label}` : '';
          // Gradient fills make p.color an object; the marker uses the solid series colour.
          return tooltipRow(colors[p.seriesIndex] ?? (p.color as string), p.seriesName, text, false, [delta, status].filter(Boolean).join(' · '));
        });
        if (stacked && !percent && list.length > 1) {
          const total = list.reduce((a, p) => a + (Number(Array.isArray(p.value) ? p.value[1] : p.value) || 0), 0);
          body.push(`<div style="border-top:1px solid ${t.tokens.borderSubtle};margin-top:6px;padding-top:6px">${tooltipRow('transparent', '합계', formatValue(total, yField, { locale }), true)}</div>`);
        }
        return tooltipHeader(head) + body.join('');
      },
    },
  };
  if (legendPos) option.legend = legendOption(ctx, series.map((s) => s.name), legendPos);
  // Real time: lets the adapter run the two-step shift and map an axis value back to a data index.
  if (rtSeq) option.__realtime = { xIndexOf: (x: number) => rtIndex.get(Math.round(x)) };
  if (rtTime) {
    // Time x: the axis value is a timestamp — the nearest point of the first series.
    const xs = series[0]?.pairs.map((p) => p[0]) ?? [];
    option.__realtime = {
      xIndexOf: (x: number) => {
        let best = -1, gap = Infinity;
        xs.forEach((v, i) => { const d = Math.abs(v - x); if (d < gap) { gap = d; best = i; } });
        return best < 0 ? undefined : best;
      },
    };
  }
  if (zoom) {
    option.dataZoom = [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', moveOnMouseMove: true },
      {
        type: 'slider', xAxisIndex: 0, height: 20, bottom: 6, filterMode: 'none',
        borderColor: 'transparent', backgroundColor: t.tokens.bgElevated, fillerColor: t.tokens.selection,
        dataBackground: { lineStyle: { color: t.tokens.axisLine }, areaStyle: { color: t.tokens.bgHover } },
        selectedDataBackground: { lineStyle: { color: t.tokens.accentBlue }, areaStyle: { color: alpha(t.tokens.accentBlue, 0.2) } },
        handleStyle: { color: t.tokens.textSecondary, borderColor: t.tokens.bgSurface },
        moveHandleStyle: { color: t.tokens.axisLine },
        textStyle: { color: t.tokens.textMuted },
        labelFormatter: (v: number, s: string) => (rtSeq ? xLabels[rtIndex.get(Math.round(v)) ?? -1] ?? '' : xField?.type === 'time' ? formatTime(Number(s) || s, locale) : s),
      },
    ];
  }
  // How long the line/area entrance runs (last line's delay + its draw time).
  const drawn = Math.max(1, drawSlot.size);
  const entranceMs = !isBarLike && ctx.motion.enabled
    ? (oneByOne ? drawn * lineMs + (drawn - 1) * lineGapMs : ctx.motion.entranceMs + (drawn - 1) * SERIES_STAGGER_MS)
    : undefined;
  return {
    option,
    warnings,
    entranceMs,
    // Real-time charts redraw on every tick, so a repeating draw cycle would keep hiding the slide:
    // with `realtime` the one-by-one draw plays on entrance only, then the chart slides as data arrives.
    ...(oneByOne && !realtime ? { loop: { holdMs: DRAW_LOOP_HOLD_MS } } : {}),
    lookup: (si, di) => {
      const s = series[si];
      return s ? { row: s.rows[di], name: s.name } : undefined;
    },
  };
}

interface ExtrudeInput {
  common: Opt;
  color: string;
  /** Plotted value per category (already percent-normalised). */
  display: (number | null)[];
  /** Stack base per category (0 when not stacked). */
  bases: number[];
  /** Status colour per category when a threshold is breached. */
  breach: (string | null)[];
  horizontal: boolean;
  stacked: boolean;
  slot: number;
  slots: number;
  label: Opt;
  delay: number | ((i: number) => number);
}

/**
 * 3D bar: a custom series drawing each bar as a cuboid — gradient front face, lit
 * top face and shaded side face. Layout mirrors the 2D bar rules (28px max width,
 * 12% bar gap, 28/36% category gap) so switching styles doesn't move anything.
 * Data is [category, value, base, top]; base/top are encoded on the value axis so
 * stacks fit the axis extent, and the tooltip reads value[1] as for 2D bars.
 */
function extrudedBars(ctx: Ctx, b: ExtrudeInput): Opt {
  const t = ctx.theme;
  const { horizontal, color } = b;
  const top = shade(color, 0.28);
  const side = shade(color, -0.38);
  const catGap = b.slots > 1 ? 0.28 : 0.36;
  const delayOf = (i: number) => (typeof b.delay === 'function' ? b.delay(i) : b.delay);
  // Bases are precomputed; letting ECharts stack the custom series too would double-count.
  const { stack: _stack, stackStrategy: _strategy, ...common } = b.common;
  return {
    ...common,
    type: 'custom',
    data: b.display.map((v, i) => [i, v, b.bases[i]!, v == null ? null : b.bases[i]! + v]),
    encode: horizontal ? { y: 0, x: [2, 3] } : { x: 0, y: [2, 3] },
    // Top faces may poke above the axis max by a few px; don't clip them.
    clip: false,
    renderItem: (params: Opt, api: Opt) => {
      const i = api.value(0) as number;
      const v = api.value(1);
      if (v == null || Number.isNaN(v)) return null;
      const base = api.value(2) as number;
      const band = horizontal ? api.size([0, 1])[1] : api.size([1, 0])[0];
      const usable = band * (1 - catGap);
      const barW = Math.max(2, Math.min(28, usable / (b.slots + (b.slots - 1) * 0.12)));
      const groupW = b.slots * barW + (b.slots - 1) * barW * 0.12;
      const offset = -groupW / 2 + b.slot * barW * 1.12;
      const d = Math.max(2, Math.min(DEPTH_PX, barW * 0.32));
      const w = barW - d; // front face; the side face fills the rest of the slot
      const p0 = api.coord(horizontal ? [base, i] : [i, base]);
      const p1 = api.coord(horizontal ? [base + v, i] : [i, base + v]);
      const status = b.breach[params.dataIndex];
      const frontFill = fillGradient(t, color, horizontal ? 'right' : 'up', b.stacked ? 0.78 : 0.5);
      const edge = status ? { stroke: status, lineWidth: 1.5 } : {};
      const children: Opt[] = [];
      let origin: [number, number];
      let labelAt: Opt;
      if (horizontal) {
        const y = p0[1] + offset + d; // top face rises by d into the slot
        const x0 = Math.min(p0[0], p1[0]);
        const x1 = Math.max(p0[0], p1[0]);
        children.push(
          { type: 'rect', shape: { x: x0, y, width: Math.max(1, x1 - x0), height: w }, style: { fill: frontFill, ...edge }, emphasis: { style: glow(t, color, 1.8) } },
          { type: 'polygon', shape: { points: [[x0, y], [x0 + d, y - d], [x1 + d, y - d], [x1, y]] }, style: { fill: top } },
          { type: 'polygon', shape: { points: [[x1, y], [x1 + d, y - d], [x1 + d, y + w - d], [x1, y + w]] }, style: { fill: side } },
        );
        origin = [p0[0], y];
        labelAt = { x: x1 + d + 6, y: y + w / 2 - d / 2, align: 'left', verticalAlign: 'middle' };
      } else {
        const x = p0[0] + offset;
        const y0 = Math.min(p0[1], p1[1]);
        const y1 = Math.max(p0[1], p1[1]);
        children.push(
          { type: 'rect', shape: { x, y: y0, width: w, height: Math.max(1, y1 - y0) }, style: { fill: frontFill, ...edge }, emphasis: { style: glow(t, color, 1.8) } },
          { type: 'polygon', shape: { points: [[x + w, y0], [x + w + d, y0 - d], [x + w + d, y1 - d], [x + w, y1]] }, style: { fill: side } },
          { type: 'polygon', shape: { points: [[x, y0], [x + d, y0 - d], [x + w + d, y0 - d], [x + w, y0]] }, style: { fill: top } },
        );
        origin = [x, p0[1]];
        labelAt = { x: x + w / 2 + d / 2, y: y0 - d - 4, align: 'center', verticalAlign: 'bottom' };
      }
      if (b.label.show) {
        children.push({
          type: 'text', silent: true,
          style: { ...labelAt, text: b.label.formatter({ value: v }), fill: t.tokens.textSecondary, fontSize: 11, fontFamily: t.fontFamily },
        });
      }
      return {
        type: 'group',
        originX: origin[0], originY: origin[1],
        children,
        // Sequential entrance: each cuboid grows out of its baseline.
        ...(ctx.motion.enabled
          ? { enterFrom: horizontal ? { scaleX: 0 } : { scaleY: 0 }, enterAnimation: { duration: ctx.motion.entranceMs, delay: delayOf(params.dataIndex) } }
          : {}),
      };
    },
  };
}

function labelForBars(ctx: Ctx, horizontal: boolean, field: FieldDef | undefined, percent: boolean): Opt {
  const mode = ctx.definition.options?.labels ?? 'auto';
  // Selective labels: only when every bar has room for one (never a number on every point of a dense chart).
  const limit = horizontal ? 12 : 7;
  const show = mode === true || (mode === 'auto' && ctx.definition.type !== 'stacked-bar' && ctx.rows.length <= limit && !ctx.definition.encoding?.color);
  return {
    show,
    // Labels count along with the bar instead of jumping to the new number.
    valueAnimation: ctx.motion.enabled,
    position: horizontal ? 'right' : 'top',
    distance: 6,
    color: ctx.theme.tokens.textSecondary,
    fontSize: 11,
    formatter: (p: Opt) => (percent ? `${Math.round(p.value * 100)}%` : formatValue(p.value, field, { locale: ctx.locale, withUnit: false })),
  };
}

// ── Scatter ───────────────────────────────────────────────────────────────

function buildScatter(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const fm = fieldMap(def.data.fields);
  const xf = fm.get(e.x!);
  const yf = fm.get(e.y as string);
  const sf = e.size ? fm.get(e.size) : undefined;
  const warnings: string[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (typeof r[e.x!] !== 'number' || typeof r[e.y as string] !== 'number') continue;
    const key = e.color ? String(r[e.color] ?? OTHER_LABEL) : fieldLabel(yf, String(e.y));
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(r);
  }
  let entries = [...groups.entries()];
  if (entries.length > MAX_CATEGORICAL) {
    const rest = entries.slice(MAX_CATEGORICAL - 1).flatMap(([, v]) => v);
    entries = [...entries.slice(0, MAX_CATEGORICAL - 1), [OTHER_LABEL, rest]];
    warnings.push(`그룹이 ${MAX_CATEGORICAL}개를 넘어 나머지를 '${OTHER_LABEL}'(으)로 묶었습니다.`);
  }
  if (entries.length > ALL_PAIRS_SAFE_SLOTS) {
    warnings.push(`산점도 그룹이 ${entries.length}개입니다. 색각 이상 사용자에게는 ${ALL_PAIRS_SAFE_SLOTS}개까지만 구분이 보장되므로 패턴/필터 사용을 권장합니다.`);
  }
  const sizeExt = e.size ? numericExtent(rows, e.size) : null;
  const sizeOf = (v: unknown) => {
    if (!sizeExt || typeof v !== 'number') return 10;
    const span = sizeExt[1] - sizeExt[0] || 1;
    return 8 + Math.sqrt((v - sizeExt[0]) / span) * 22; // area-proportional, 8–30px
  };
  const total = rows.length;
  const pointColors = entries.map(([name]) => t.palette[slotFor(ctx.slots, name) % t.palette.length]!);
  const deep = t.effects.depth && total <= 5000;
  const series = entries.map(([name, rs], gi) => {
    const color = pointColors[gi]!;
    return {
      type: 'scatter',
      id: `s:${name}`,
      name,
      data: rs.map((r) => [r[e.x!], r[e.y as string], e.size ? r[e.size] : null]),
      symbolSize: (v: unknown[]) => sizeOf(v[2]),
      large: total > 5000,
      // 3D style: lit spheres casting a shadow.
      itemStyle: { color: deep ? sphere(color, 0.92) : alpha(color, 0.82), borderColor: t.tokens.bgSurface, borderWidth: deep ? 0 : 1, ...(deep ? depthShadow(t, 0.6) : {}) },
      animationDelay: stagger(ctx.motion, rs.length),
      emphasis: { focus: 'series', scale: 1.3, itemStyle: { color, borderColor: t.tokens.textPrimary, borderWidth: 1.5, ...(total > 5000 ? {} : glow(t, color, 1.8)) } },
      blur: { itemStyle: { opacity: 0.15 } },
      universalTransition: { enabled: true },
    };
  });
  if (series[0]) Object.assign(series[0], { markLine: thresholdMarkLine(ctx, false) });
  const legendPos = legendPosition(def, series.length);
  const zoom = def.interactions?.includes('zoom');
  const option: Opt = {
    ...baseOption(ctx),
    grid: { left: 4, right: 16, top: legendPos === 'top' ? 56 : 32, bottom: zoom ? 44 : 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { ...valueAxis(t, xf, locale), type: xf?.type === 'time' ? 'time' : 'value', scale: true, name: fieldLabel(xf), nameLocation: 'middle', nameGap: 28 },
    yAxis: { ...valueAxis(t, yf, locale), scale: true, name: fieldLabel(yf), nameLocation: 'end', nameGap: 14, nameTextStyle: { color: t.tokens.textMuted, fontSize: 11, align: 'left' } },
    series,
    tooltip: {
      ...tooltipBase(t, 'item'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => {
        const r = entries[p.seriesIndex]?.[1][p.dataIndex];
        const head = e.label && r ? String(r[e.label] ?? '') : p.seriesName;
        const lines = [
          tooltipRow(pointColors[p.seriesIndex] ?? p.color, fieldLabel(xf, e.x), formatValue(p.value[0], xf, { locale })),
          tooltipRow('transparent', fieldLabel(yf, String(e.y)), formatValue(p.value[1], yf, { locale })),
        ];
        if (sf) lines.push(tooltipRow('transparent', fieldLabel(sf), formatValue(p.value[2], sf, { locale })));
        return tooltipHeader(head) + lines.join('');
      },
    },
  };
  if (legendPos) option.legend = legendOption(ctx, entries.map(([n]) => n), legendPos);
  if (zoom) option.dataZoom = [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }];
  return { option, warnings, lookup: (si, di) => ({ row: entries[si]?.[1][di], name: entries[si]?.[0] }) };
}

// ── Pie / Donut ───────────────────────────────────────────────────────────

function buildPie(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const fm = fieldMap(def.data.fields);
  const vf = fm.get(e.value!);
  const warnings: string[] = [];
  const agg = new Map<string, { value: number; rows: Row[] }>();
  for (const r of rows) {
    const v = r[e.value!];
    if (typeof v !== 'number' || v < 0) continue;
    const name = String(r[e.category!] ?? OTHER_LABEL);
    const a = agg.get(name) ?? { value: 0, rows: [] };
    a.value += v;
    a.rows.push(r);
    agg.set(name, a);
  }
  // Largest first, fold the tail into "기타" beyond 8 slices.
  let items = [...agg.entries()].map(([name, a]) => ({ name, ...a })).sort((a, b) => b.value - a.value);
  if (items.length > MAX_CATEGORICAL) {
    const rest = items.slice(MAX_CATEGORICAL - 1);
    items = [...items.slice(0, MAX_CATEGORICAL - 1), { name: OTHER_LABEL, value: rest.reduce((s, i) => s + i.value, 0), rows: rest.flatMap((i) => i.rows) }];
    warnings.push(`항목 ${rest.length + MAX_CATEGORICAL - 1}개 중 작은 ${rest.length}개를 '${OTHER_LABEL}'(으)로 묶었습니다.`);
  }
  const total = items.reduce((s, i) => s + i.value, 0);
  const donut = def.type === 'donut';
  const legendPos = legendPosition(def, items.length);
  const center: [string, string] = legendPos === 'right' ? ['36%', '50%'] : ['50%', legendPos === 'top' ? '56%' : '50%'];
  const labelsMode = def.options?.labels ?? (donut ? false : 'auto');
  const selection = def.interactions?.includes('selection');

  const series: Opt[] = [
    {
      type: 'pie',
      id: 'pie',
      name: def.title ?? fieldLabel(vf),
      radius: donut ? ['54%', '74%'] : ['0%', labelsMode === false ? '72%' : '66%'],
      center,
      padAngle: 0, // seams come from the slice border: one disc, cut
      minAngle: 2,
      avoidLabelOverlap: true,
      selectedMode: selection ? 'single' : false,
      selectedOffset: 6,
      // No surface-coloured border or rounding: slices touch, each datum draws its own thin seam.
      itemStyle: { borderWidth: 0, borderRadius: 0 },
      // Slices sweep in one after another (expansion), largest first.
      animationType: 'expansion',
      // Pies unfold slower than the other forms so the sweep reads.
      animationDuration: Math.round(ctx.motion.entranceMs * 1.5),
      // One continuous sweep (no per-slice delay) so the glowing leading edge (F) can ride its front.
      animationDelay: 0,
      label: {
        show: labelsMode !== false,
        color: t.tokens.textSecondary,
        fontSize: 11,
        overflow: 'none',
        // Name lives in the legend; the slice label carries the share. Tiny slices stay unlabelled.
        formatter: (p: Opt) => (labelsMode === 'auto' && p.percent < 5 ? '' : `${Math.round(p.percent)}%`),
      },
      labelLine: { show: labelsMode !== false, lineStyle: { color: t.tokens.axisLine }, length: 8, length2: 8 },
      // E/G — the adapter pops the hovered slice outward and recedes the rest; native blur dims them.
      // The hovered slice's own label gives way to the adapter's callout bubble (name · value · share),
      // which also stands in for the tooltip so the two never cover each other.
      emphasis: { scale: false, focus: 'self', label: { show: false }, labelLine: { show: false } },
      ...(!donut && ctx.motion.enabled ? { tooltip: { show: false } } : {}),
      // Identity colour per slice for the callout's accent (fills are gradients).
      sliceColors: items.map((i) => t.palette[slotFor(ctx.slots, i.name) % t.palette.length]!),
      blur: { itemStyle: { opacity: 0.55 } },
      data: items.map((i) => {
        const color = t.palette[slotFor(ctx.slots, i.name) % t.palette.length]!;
        return {
        name: i.name,
        value: i.value,
        // Solid slice + thin dark seam; the shared light comes from the disc sheen.
        itemStyle: { ...pieSlice(t, color), borderRadius: 0 },
        // Hover: a little brighter with a soft glow (the adapter pops it out).
        emphasis: { itemStyle: { ...glow(t, color, 1.2), color: alpha(shade(color, 0.12), 0.95) } },
        // Tiny slices: no label and no dangling leader line.
        ...(labelsMode === 'auto' && total > 0 && i.value / total < 0.05 ? { label: { show: false }, labelLine: { show: false } } : {}),
        };
      }),
      universalTransition: { enabled: true },
    },
  ];
  if (donut && def.options?.showTotal !== false) {
    // Centre label as a silent zero-radius pie: always centred on the donut. Its single
    // datum carries the total so `valueAnimation` counts the number up/over on change.
    const centerLabel = (def.options?.centerLabel ?? '합계').replace(/[{}|]/g, '');
    series.push({
      type: 'pie', id: '__center', name: '__center', radius: ['0%', '0%'], center, silent: true, tooltip: { show: false },
      // E — while a slice is hovered the adapter swaps this readout to the slice (value counts over).
      hoverFormatter: (name: string, pct: number) => (p: Opt) =>
        `{v|${formatValue(p.value, vf, { locale, withUnit: false }).replace(/[{}|]/g, '')}}\n{l|${name.replace(/[{}|]/g, '')} · ${pct}%}`,
      label: {
        show: true, position: 'center',
        valueAnimation: ctx.motion.enabled,
        formatter: (p: Opt) =>
          `{v|${formatValue(typeof p.value === 'number' ? p.value : total, vf, { locale, withUnit: false }).replace(/[{}|]/g, '')}}\n{l|${centerLabel}}`,
        rich: {
          v: { color: t.tokens.textPrimary, fontSize: 24, fontWeight: 700, lineHeight: 30, fontFamily: t.fontFamily },
          l: { color: t.tokens.textMuted, fontSize: 12, lineHeight: 18, fontFamily: t.fontFamily },
        },
      },
      labelLine: { show: false },
      data: [{ value: items.filter((i) => !ctx.hidden?.has(i.name)).reduce((s, i) => s + i.value, 0), name: '', itemStyle: { color: 'transparent' } }],
      animationDuration: Math.round(ctx.motion.entranceMs * 1.3),
      animationDelay: 0,
      emphasis: { disabled: true },
    });
  }
  // HUD halo + tick ring (decoration only; appended last so data series indices are unchanged).
  const outerPct = donut ? 74 : labelsMode === false ? 72 : 66;
  series.push(...hudRings(t, ctx.motion, center, outerPct + 3));
  if (!t.effects.depth) {
    const pctOfFlat = (v: string, size: number) => (parseFloat(v) / 100) * size;
    series.push(...discSheen(t, (w, h) => {
      const r = (outerPct / 100) * (Math.min(w, h) / 2);
      return { cx: pctOfFlat(center[0], w), cy: pctOfFlat(center[1], h), r, r0: donut ? r * (54 / 74) : 0 };
    }));
  }
  // F — glowing leading edge on the entrance sweep.
  if (ctx.entrance && !t.effects.depth) series.push(...sweepEdge(t, ctx.motion, center, outerPct, Math.round(ctx.motion.entranceMs * 1.5)));
  if (t.effects.depth) {
    // 3D style: a tilted thick disk seen from ~35° above (like Highcharts' 3D pie).
    // A custom series draws each slice's top face squashed to an ellipse plus a layered side
    // wall below it. The real pie stays (shrunk to nothing) as the legend's source, so legend
    // filtering and colours keep working; the 3D series is the interactive one.
    const main = series[0]!;
    Object.assign(main, { radius: ['0%', '0%'], silent: true, tooltip: { show: false }, label: { show: false }, labelLine: { show: false }, emphasis: { disabled: true } });
    const hud = series.findIndex((x) => x.id === 'fx:hud');
    if (hud >= 0) series.splice(hud, 1); // flat rings would fight the tilt
    const TILT = 0.58;
    const shown = items.filter((i) => !ctx.hidden?.has(i.name));
    const sum = shown.reduce((acc, i) => acc + i.value, 0) || 1;
    const outer3d = outerPct / 100;
    const innerPct = donut ? 0.54 : 0;
    let acc = 0;
    const arcs = shown.map((i) => {
      const a0 = -Math.PI / 2 + (acc / sum) * Math.PI * 2;
      acc += i.value;
      return { ...i, a0, a1: -Math.PI / 2 + (acc / sum) * Math.PI * 2 };
    });
    const pctOf = (v: string, size: number) => (parseFloat(v) / 100) * size;
    const delayFn = stagger(ctx.motion, arcs.length);
    // Shared by the renderer and the adapter's hover lift (H): disk centre and slice mid-angle.
    const geom = (dataIndex: number, w: number, h: number) => {
      const R = Math.min(w / 2, (h / 2) / TILT) * outer3d * 0.8;
      const D = R * 0.16;
      const arc = arcs[dataIndex];
      return { cx: pctOf(center[0], w), cy: pctOf(center[1], h) - D / 2, R, D, tilt: TILT, mid: arc ? (arc.a0 + arc.a1) / 2 : 0 };
    };
    series.push({
      type: 'custom', id: 'pie3d', name: def.title ?? fieldLabel(vf), coordinateSystem: 'none', z: 3,
      ...(!donut && ctx.motion.enabled ? { tooltip: { show: false } } : {}), // the callout stands in
      sliceColors: arcs.map((i) => t.palette[slotFor(ctx.slots, i.name) % t.palette.length]!),
      ...hoverSpring(ctx.motion),
      // G — the other slices dim while one is hovered (the adapter also recedes and lifts, H).
      emphasis: { focus: 'self' },
      sliceGeom: geom,
      data: arcs.map((i) => ({ name: i.name, value: i.value })),
      renderItem: (params: Opt, api: Opt) => {
        const arc = arcs[params.dataIndex];
        if (!arc) return null;
        const w = api.getWidth(), h = api.getHeight();
        // Lying flat reads larger than upright, so the tilted disk is drawn ~20% smaller.
        const { R, D, cx, cy } = geom(params.dataIndex, w, h);
        const r0 = (R * innerPct) / Math.max(outer3d, 1e-6);
        const color = t.palette[slotFor(ctx.slots, arc.name) % t.palette.length]!;
        // Slices touch (no angular gap); the seam is the thin stroke below.
        const gap = 0;
        const shape = { cx: 0, cy: 0, r: R, r0, startAngle: arc.a0 + gap, endAngle: arc.a1 - gap, clockwise: true };
        const delay = typeof delayFn === 'function' ? delayFn(params.dataIndex) : delayFn;
        const enter = ctx.motion.enabled
          ? { enterFrom: { shape: { endAngle: arc.a0 + gap } }, enterAnimation: { duration: Math.round(ctx.motion.entranceMs * 1.5), delay } }
          : {};
        // Cylinder-lit wall: global gradient across the disc, brightest facing the viewer.
        const wallFill = {
          type: 'linear', x: cx - R, y: 0, x2: cx + R, y2: 0, global: true,
          colorStops: [{ offset: 0, color: shade(color, -0.62) }, { offset: 0.5, color: shade(color, -0.22) }, { offset: 1, color: shade(color, -0.62) }],
        };
        const walls = wallPolygons(arc.a0, arc.a1, cx, cy, R, TILT, D).map((points) => ({
          type: 'polygon', z2: 10, shape: { points },
          style: { fill: wallFill, stroke: shade(color, -0.7), lineWidth: 0.8 },
          blur: { style: { opacity: 0.55 } },
          ...(ctx.motion.enabled ? { enterFrom: { style: { opacity: 0 } }, enterAnimation: { duration: Math.round(ctx.motion.entranceMs * 0.6), delay: delay + Math.round(ctx.motion.entranceMs * 0.9) } } : {}),
        }));
        const mid = (arc.a0 + arc.a1) / 2;
        const share = arc.value / sum;
        const showLabel = labelsMode !== false && !(labelsMode === 'auto' && share < 0.05);
        return {
          type: 'group',
          children: [
            // Side wall: the slice's front edge as one curved band.
            ...walls,
            {
              type: 'group', x: cx, y: cy, scaleY: TILT,
              children: [{
                type: 'sector', z2: 100, shape, ...enter,
                // Solid top with a thin dark seam; the shared light is the disc sheen.
                style: { fill: color, stroke: shade(color, -0.45), lineWidth: 1 },
                emphasis: { style: { fill: shade(color, 0.12), shadowBlur: 14, shadowColor: alpha(color, 0.7) } },
                blur: { style: { opacity: 0.55 } },
              }],
            },
            ...(showLabel ? [{
              type: 'text', z2: 101, silent: true,
              // Hidden while hovered: the callout bubble takes its place.
              emphasis: { style: { opacity: 0 } },
              x: cx + Math.cos(mid) * (R + 14), y: cy + Math.sin(mid) * (R + 14) * TILT + (Math.sin(mid) > 0 ? D : 0),
              style: { text: `${Math.round(share * 100)}%`, fill: t.tokens.textSecondary, fontSize: 11, fontFamily: t.fontFamily, align: Math.cos(mid) >= 0 ? 'left' : 'right', verticalAlign: 'middle' },
            }] : []),
          ],
        };
      },
    });
    series.push(...discSheen(t, (w, h) => {
      const g = geom(0, w, h);
      return { cx: g.cx, cy: g.cy, r: g.R, r0: (g.R * innerPct) / Math.max(outer3d, 1e-6), tilt: TILT };
    }));
    if (donut) {
      // Keep the centre total on the tilted top face.
      const c = series.find((x) => x.id === '__center');
      if (c) c.center = [center[0], `${parseFloat(center[1]) - 2}%`];
    }
  }
  const option: Opt = {
    ...baseOption(ctx),
    series,
    tooltip: {
      ...tooltipBase(t, 'item'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => {
        if (p.seriesName === '__center') return '';
        const shownTotal = items.filter((i) => !ctx.hidden?.has(i.name)).reduce((acc, i) => acc + i.value, 0) || 1;
        const pct = p.percent ?? Math.round((Number(p.value) / shownTotal) * 1000) / 10;
        const color = p.seriesId === 'pie3d' ? t.palette[slotFor(ctx.slots, p.name) % t.palette.length]! : p.color;
        return tooltipHeader(p.name) + tooltipRow(color, fieldLabel(vf), `${formatValue(p.value, vf, { locale })} · ${pct}%`);
      },
    },
  };
  if (legendPos) option.legend = legendOption(ctx, items.map((i) => i.name), legendPos);
  const pie3dIndex = series.findIndex((x) => x.id === 'pie3d');
  const visibleItems = items.filter((i) => !ctx.hidden?.has(i.name));
  const pick = (it?: (typeof items)[number]) => (it ? { rows: it.rows, row: it.rows[0], name: it.name } : undefined);
  return { option, warnings, lookup: (si, di) => (si === 0 ? pick(items[di]) : si === pie3dIndex ? pick(visibleItems[di]) : undefined) };
}

// ── Gauge ─────────────────────────────────────────────────────────────────

function buildGauge(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const vf = fieldMap(def.data.fields).get(e.value!);
  const last = rows[rows.length - 1];
  const raw = last?.[e.value!];
  const value = typeof raw === 'number' ? raw : null;
  const min = def.options?.min ?? 0;
  const max = def.options?.max ?? 100;
  const thresholds = [...(def.options?.thresholds ?? [])].sort((a, b) => a.value - b.value);
  const level: StatusLevel = value === null ? 'info' : statusForValue(value, thresholds);
  const span = max - min || 1;
  // Band stops: ok up to first threshold, then each threshold's status.
  const stops: [number, string][] = [];
  let prevLevel: StatusLevel = 'ok';
  for (const th of thresholds) {
    if (th.value <= min || th.value >= max) continue;
    stops.push([(th.value - min) / span, alpha(t.status[prevLevel], 0.55)]);
    prevLevel = th.status ?? 'warning';
  }
  stops.push([1, alpha(t.status[prevLevel], 0.55)]);
  const label = (e.label && typeof last?.[e.label] === 'string' ? (last[e.label] as string) : undefined) ?? def.options?.centerLabel ?? fieldLabel(vf, '');
  const safe = (s: string) => s.replace(/[{}|]/g, '');
  const statusColor = thresholds.length ? t.status[level] : t.tokens.accentBlue;

  const geometry = { min, max, startAngle: 215, endAngle: -35, center: ['50%', '58%'] };
  const { motion } = ctx;
  // Alerts glow harder so a breached gauge stands out on a dense dashboard.
  const glowStrength = level === 'critical' ? 2.4 : level === 'warning' ? 1.7 : 1.2;
  // Natural rotation: a slow cubicOut sweep on entrance, an ease-in-out swing on change.
  // Arc, tip marker and the counting readout share these timings so they move as one.
  const sweep = {
    animationDuration: motion.sweepMs,
    animationEasing: 'cubicOut',
    animationDurationUpdate: motion.sweepUpdateMs,
    animationEasingUpdate: 'cubicInOut',
    animationDelay: 0,
  };
  const option: Opt = {
    ...baseOption(ctx),
    series: [
      {
        // Main: track + value progress + tip marker + centre readout.
        type: 'gauge', id: 'gauge', ...geometry, ...sweep, radius: '82%', splitNumber: 5,
        axisLine: { roundCap: true, lineStyle: { width: 12, color: [[1, t.tokens.bgHover]] } },
        progress: { show: true, width: 12, roundCap: true, itemStyle: { color: statusColor, ...glow(t, statusColor, glowStrength) } },
        // Tip marker riding the arc end (offset out from the centre so it never covers the readout).
        pointer: {
          show: value !== null, icon: 'roundRect', width: 4, length: '20%', offsetCenter: [0, '-84%'],
          itemStyle: { color: t.tokens.textPrimary, ...glow(t, statusColor, glowStrength + 0.4) },
        },
        anchor: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: t.tokens.textMuted, fontSize: 10, distance: 18, formatter: (v: number) => formatAxisValue(v, vf, locale) },
        title: { show: !!label, offsetCenter: [0, '42%'], color: t.tokens.textSecondary, fontSize: 12 },
        detail: {
          valueAnimation: motion.enabled,
          offsetCenter: [0, '4%'],
          formatter: (v: number) =>
            `{v|${safe(formatValue(value === null ? null : v, vf, { locale }))}}` +
            (thresholds.length ? `\n{s|${STATUS_META[level].icon} ${STATUS_META[level].label}}` : ''),
          rich: {
            v: { color: t.tokens.textPrimary, fontSize: 28, fontWeight: 700, lineHeight: 36, fontFamily: t.fontFamily },
            s: { color: t.tokens.textSecondary, fontSize: 12, lineHeight: 20, fontFamily: t.fontFamily },
          },
        },
        data: [{ value: value ?? min, name: label }],
      },
      ...(thresholds.length
        ? [{
            // Outer thin band: threshold zones, so the scale context is visible at a glance.
            type: 'gauge', id: 'gauge-zones', ...geometry, ...sweep, radius: '92%', silent: true,
            axisLine: { roundCap: false, lineStyle: { width: 3, color: stops } },
            progress: { show: false }, pointer: { show: false }, anchor: { show: false }, axisTick: { show: false },
            splitLine: { show: false }, axisLabel: { show: false }, detail: { show: false }, title: { show: false }, data: [],
          }]
        : []),
    ],
    tooltip: { ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false, formatter: () => tooltipHeader(label || '값') + tooltipRow(statusColor, STATUS_META[level].label, formatValue(value, vf, { locale })) },
  };
  return { option, warnings: [], lookup: () => (last ? { row: last } : undefined) };
}

// ── Heatmap ───────────────────────────────────────────────────────────────

/** Round time steps for real-time time axes (ms). */
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((s) => s * 1000);

/** Short local clock text for a time-axis tick: HH:MM, or HH:MM:SS for sub-minute steps. */
function clockText(ms: number, step: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return step < 60_000 ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/**
 * Week × hour pattern: bucket rows by the local weekday / hour of their timestamp and sum the
 * value, over a fixed full grid (hours with no data are 0, so the pattern reads at a glance).
 */
function weekHourRows(rows: Row[], timeField: string, valueField: string): Row[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const raw = r[timeField];
    const ms = typeof raw === 'number' ? raw : raw instanceof Date ? raw.getTime() : typeof raw === 'string' ? Date.parse(raw) : NaN;
    const v = r[valueField];
    if (Number.isNaN(ms) || typeof v !== 'number') continue;
    const d = new Date(ms);
    const key = `${(d.getDay() + 6) % 7}|${d.getHours()}`; // Monday first
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  const out: Row[] = [];
  WEEKDAYS.forEach((day, di) => HOURS.forEach((hour, h) => out.push({ __hour: hour, __day: day, __value: sums.get(`${di}|${h}`) ?? 0 })));
  return out;
}

function buildHeatmap(ctx: Ctx): BuildResult {
  const { definition: def, theme: t, locale } = ctx;
  const enc = def.encoding ?? {};
  const fm = fieldMap(def.data.fields);
  const weekHour = def.options?.pattern === 'week-hour';
  const rows = weekHour ? weekHourRows(ctx.rows, enc.x!, enc.value!) : ctx.rows;
  const e = weekHour ? { x: '__hour', y: '__day', value: '__value' } : enc;
  const xf = weekHour ? ({ name: '__hour', type: 'string', label: '시' } as FieldDef) : fm.get(e.x!);
  const yName = e.y as string;
  const yf = weekHour ? ({ name: '__day', type: 'string', label: '요일' } as FieldDef) : fm.get(yName);
  const vf = fm.get(enc.value!);
  const show = (f: FieldDef | undefined, v: unknown) => (f?.type === 'time' ? formatTime(v, locale) : weekHour && f?.name === '__hour' ? `${v}시` : String(v));
  const xs = weekHour ? HOURS : distinct(rows, e.x!);
  const ys = weekHour ? WEEKDAYS : distinct(rows, yName);
  const xi = new Map<unknown, number>(xs.map((v, i) => [v, i]));
  const yi = new Map<unknown, number>(ys.map((v, i) => [v, i]));
  const ext = numericExtent(rows, e.value!) ?? [0, 1];
  const span = ext[1] - ext[0] || 1;
  const cellCount = xs.length * ys.length;
  const labels = def.options?.labels === true || (def.options?.labels !== false && cellCount <= 80);
  const cellRows: Row[] = [];
  const data = rows
    .filter((r) => xi.has(r[e.x!]) && yi.has(r[yName]))
    .map((r) => {
      const v = typeof r[e.value!] === 'number' ? (r[e.value!] as number) : null;
      cellRows.push(r);
      // Light cells (high values) need dark ink for ≥4.5:1 text contrast.
      const light = v !== null && (v - ext[0]) / span > 0.6;
      return { value: [xi.get(r[e.x!]), yi.get(r[yName]), v], label: { color: light ? t.tokens.bgCanvas : t.tokens.textPrimary } };
    });
  const option: Opt = {
    ...baseOption(ctx),
    grid: { left: 4, right: 8, top: 8, bottom: 52, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: xs.map((v) => show(xf, v)), ...axisCommon(t), axisLine: { show: false }, splitArea: { show: false } },
    yAxis: { type: 'category', data: ys.map((v) => show(yf, v)), ...axisCommon(t), axisLine: { show: false }, inverse: true },
    visualMap: {
      type: 'continuous', min: ext[0], max: ext[1], calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      itemWidth: 12, itemHeight: 180, inRange: { color: t.sequential },
      textStyle: { color: t.tokens.textMuted, fontSize: 11 },
      formatter: (v: number) => formatAxisValue(v, vf, locale),
      handleStyle: { borderColor: t.tokens.textSecondary },
    },
    series: [{
      type: 'heatmap', id: 'heatmap', name: def.title ?? fieldLabel(vf), data,
      itemStyle: { borderColor: t.tokens.bgSurface, borderWidth: 2, borderRadius: 3 },
      label: { show: labels, fontSize: 10, formatter: (p: Opt) => formatAxisValue(p.value[2], vf, locale) },
      emphasis: { itemStyle: { borderColor: t.tokens.textPrimary, borderWidth: 1.5, ...glow(t, t.tokens.accentCyan, 1.6) } },
      selectedMode: def.interactions?.includes('selection') ? 'single' : false,
      progressive: 2000,
      // Cells fade in row by row.
      animationDelay: stagger(ctx.motion, data.length),
    }],
    tooltip: {
      ...tooltipBase(t, 'item'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => tooltipHeader(`${show(yf, ys[p.value[1]])} · ${show(xf, xs[p.value[0]])}`) + tooltipRow(p.color, fieldLabel(vf), formatValue(p.value[2], vf, { locale })),
    },
  };
  return { option, warnings: [], lookup: (_si, di) => ({ row: cellRows[di] }) };
}

// ── Treemap ───────────────────────────────────────────────────────────────

interface TreeNode { id: string; name: string; value: number; children?: TreeNode[]; itemStyle?: Opt }

export function buildTree(rows: Row[], path: string[], valueField: string): { roots: TreeNode[]; nodeRows: Map<string, Row[]> } {
  const nodeRows = new Map<string, Row[]>();
  const roots: TreeNode[] = [];
  const index = new Map<string, TreeNode>();
  for (const r of rows) {
    const v = r[valueField];
    if (typeof v !== 'number' || v <= 0) continue;
    let siblings = roots;
    let id = '';
    for (const f of path) {
      const name = String(r[f] ?? OTHER_LABEL);
      id = id ? `${id}␟${name}` : name;
      let node = index.get(id);
      if (!node) {
        node = { id, name, value: 0 };
        index.set(id, node);
        siblings.push(node);
      }
      node.value += v;
      (nodeRows.get(id) ?? nodeRows.set(id, []).get(id)!).push(r);
      if (f !== path[path.length - 1]) siblings = node.children ??= [];
    }
  }
  const sortRec = (ns: TreeNode[]) => {
    ns.sort((a, b) => b.value - a.value);
    ns.forEach((n) => n.children && sortRec(n.children));
  };
  sortRec(roots);
  return { roots, nodeRows };
}

function buildTreemap(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const vf = fieldMap(def.data.fields).get(e.value!);
  const { roots, nodeRows } = buildTree(rows, e.path ?? [], e.value!);
  const warnings: string[] = [];
  let tops = roots;
  if (tops.length > MAX_CATEGORICAL) {
    const rest = tops.slice(MAX_CATEGORICAL - 1);
    tops = [...tops.slice(0, MAX_CATEGORICAL - 1), { id: OTHER_LABEL, name: OTHER_LABEL, value: rest.reduce((s, n) => s + n.value, 0), children: rest }];
    nodeRows.set(OTHER_LABEL, rest.flatMap((n) => nodeRows.get(n.id) ?? []));
    warnings.push(`최상위 그룹 ${roots.length}개 중 ${rest.length}개를 '${OTHER_LABEL}'(으)로 묶었습니다.`);
  }
  for (const n of tops) n.itemStyle = { color: t.palette[slotFor(ctx.slots, n.name) % t.palette.length] };
  const total = sum(rows, e.value!);
  const drill = def.options?.drilldown !== false && def.interactions?.includes('drilldown') !== false;
  const depth = Math.max(1, (e.path ?? []).length);
  const option: Opt = {
    ...baseOption(ctx),
    series: [{
      type: 'treemap', id: 'treemap', name: def.title ?? '전체', data: tops, top: drill ? 4 : 0, left: 0, right: 0, bottom: drill ? 30 : 0,
      roam: false, nodeClick: drill ? 'zoomToNode' : false, leafDepth: drill && depth > 1 ? 1 : undefined,
      squareRatio: 0.5 * (1 + Math.sqrt(5)), animationDurationUpdate: ctx.motion.updateMs,
      breadcrumb: {
        show: drill, bottom: 0, left: 0, height: 24, emptyItemWidth: 24,
        itemStyle: { color: t.tokens.bgElevated, borderColor: t.tokens.borderSubtle, borderWidth: 1, textStyle: { color: t.tokens.textSecondary } },
        emphasis: { itemStyle: { color: t.tokens.bgHover } },
      },
      label: {
        show: true, color: t.tokens.textPrimary, fontSize: 12, overflow: 'truncate', padding: [6, 8],
        formatter: (p: Opt) => `{n|${String(p.name).replace(/[{}|]/g, '')}}\n{v|${formatValue(p.value, vf, { locale, withUnit: false })}}`,
        rich: { n: { fontSize: 12, fontWeight: 600, color: t.tokens.textPrimary, lineHeight: 18 }, v: { fontSize: 11, color: t.tokens.textPrimary, opacity: 0.8, lineHeight: 16 } },
      },
      upperLabel: { show: true, height: 22, color: t.tokens.textPrimary, fontSize: 11, fontWeight: 600, padding: [0, 8], formatter: (p: Opt) => String(p.name) },
      itemStyle: { borderColor: t.tokens.bgSurface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
      levels: [
        { itemStyle: { borderWidth: 0, gapWidth: 3, borderColor: t.tokens.bgSurface } },
        { colorAlpha: [0.55, 0.95], itemStyle: { gapWidth: 2, borderColor: t.tokens.bgSurface, borderWidth: 0 } },
        { colorAlpha: [0.45, 0.85], itemStyle: { gapWidth: 1 } },
      ],
      emphasis: { itemStyle: { borderColor: t.tokens.focus } },
    }],
    tooltip: {
      ...tooltipBase(t, 'item'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => {
        const path = ((p.treePathInfo ?? []) as { name: string }[]).slice(1).map((n) => n.name).join(' › ');
        const share = total ? ` · ${Math.round((p.value / total) * 1000) / 10}%` : '';
        return tooltipHeader(path || p.name) + tooltipRow(p.color, fieldLabel(vf), formatValue(p.value, vf, { locale }) + share);
      },
    },
  };
  return { option, warnings, nodeRows, lookup: () => undefined };
}

function buildRadar(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t } = ctx;
  const e = def.encoding ?? {};
  const vf = fieldMap(def.data.fields).get(e.value!);
  const categories = distinct(rows, e.category!).map(v => String(v));
  const groups = e.color ? distinct(rows, e.color).map(String) : [fieldLabel(vf, e.value!)];
  const data = groups.map((group, idx) => {
    const groupRows = e.color ? rows.filter(r => String(r[e.color!]) === group) : rows;
    return {
      name: group,
      value: categories.map(cat => groupRows.find(r => String(r[e.category!]) === cat)?.[e.value!] ?? null),
      itemStyle: { color: t.palette[slotFor(ctx.slots, group) % t.palette.length] },
    };
  });
  const max = def.options?.max ?? Math.max(100, ...rows.map(r => typeof r[e.value!] === 'number' ? r[e.value!] as number : 0));
  const legendAt = legendPosition(def, groups.length);
  const web = t.mode === 'light' ? t.tokens.axisLine : t.tokens.accentCyan;
  // Spider web (Highcharts "polar-spider" form): polygon grid lines only, series drawn as
  // lines with small points. The enclosed area appears only on hover so overlapping
  // series stay legible over translucent dashboard panels.
  const option: Opt = {
    ...baseOption(ctx),
    radar: {
      shape: 'polygon',
      radius: legendAt === 'right' ? '72%' : '68%',
      center: legendAt === 'right' ? ['42%', '52%'] : ['50%', legendAt === 'bottom' ? '46%' : '56%'],
      axisName: { color: t.tokens.textSecondary, fontSize: 12 },
      indicator: categories.map(name => ({ name, max, ...(def.options?.min !== undefined ? { min: def.options.min } : {}) })),
      // HUD web: spokes and rings in a faint accent, the outer ring brightest.
      axisLine: { lineStyle: { color: alpha(web, 0.22) } },
      splitLine: { lineStyle: { color: [alpha(web, 0.1), alpha(web, 0.14), alpha(web, 0.18), alpha(web, 0.22), alpha(web, 0.5)], width: 1 } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      symbol: 'circle',
      symbolSize: 5,
      data: data.map((d) => ({
        ...d,
        lineStyle: { width: 2, color: neonCore(t, d.itemStyle.color!), ...glow(t, d.itemStyle.color!) },
        itemStyle: { ...d.itemStyle, borderColor: neonCore(t, d.itemStyle.color!, 0.6), borderWidth: 1 },
        emphasis: { lineStyle: { width: 3, ...glow(t, d.itemStyle.color!, 2) }, areaStyle: { color: alpha(d.itemStyle.color!, 0.24) } },
      })),
      areaStyle: { opacity: 0 },
      emphasis: { focus: 'self' },
      animationDelay: stagger(ctx.motion, data.length),
    }],
    tooltip: {
      ...tooltipBase(t, 'item'),
      show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: { name: string; color: string; value: (number | null)[] }) =>
        tooltipHeader(p.name) + categories.map((cat, i) => tooltipRow(p.color, cat, formatValue(p.value[i], vf, { locale: ctx.locale }))).join(''),
    },
    legend: legendAt ? legendOption(ctx, groups, legendAt) : undefined,
  };

  return { option, warnings: [], lookup: () => undefined };
}

function buildCandlestick(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const fields = e.y as string[];
  const validRows = rows.filter(r => r[e.x!] != null && fields.every(f => typeof r[f] === 'number'));
  const categories = validRows.map(r => r[e.x!]);
  const categoryAxisOpt: Opt = {
    ...axisCommon(t),
    type: 'category',
    data: categories,
    boundaryGap: true,
  };

  const option: Opt = {
    ...baseOption(ctx),
    series: [{
      type: 'candlestick', name: def.title ?? 'OHLC',
      data: validRows.map(r => fields.map(f => r[f])),
      itemStyle: { color: t.palette[0], color0: t.palette[1], borderColor: t.palette[0], borderColor0: t.palette[1] },
    }],
    xAxis: [categoryAxisOpt],
    yAxis: [{ ...valueAxis(t, undefined, locale), scale: true }],
    tooltip: tooltipBase(t, 'axis', 'line'),
    grid: { left: 64, right: 24, top: 32, bottom: 32 },
  };

  return { option, warnings: validRows.length < rows.length ? ['시가·종가·저가·고가가 없는 행은 제외했습니다.'] : [], lookup: (_si, di) => ({ row: validRows[di] }) };
}

function quantile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  return sorted[low]! + (sorted[Math.ceil(index)]! - sorted[low]!) * (index - low);
}

function buildBoxplot(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const categories = distinct(rows, e.category!);
  const groups = e.color ? distinct(rows, e.color!) : [fieldLabel(fieldMap(def.data.fields).get(e.value!), e.value!)];
  const groupedRows: Row[][][] = [];
  const echSeries = groups.map((group, si) => {
    const groupRows = e.color ? rows.filter(r => r[e.color!] === group) : rows;
    const byCategory = categories.map(cat => groupRows.filter(r => r[e.category!] === cat && typeof r[e.value!] === 'number'));
    groupedRows.push(byCategory);
    return {
      type: 'boxplot', id: `s:${String(group)}`, name: String(group),
      data: byCategory.map(rs => {
        const values = rs.map(r => r[e.value!] as number).sort((a, b) => a - b);
        return values.length ? [values[0], quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75), values[values.length - 1]] : [null, null, null, null, null];
      }),
      itemStyle: { color: t.palette[si % t.palette.length], borderColor: t.tokens.gridLine },
      emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
    };
  });

  const categoryAxisOpt: Opt = {
    ...axisCommon(t),
    type: 'category',
    data: categories,
    boundaryGap: true,
  };

  const option: Opt = {
    ...baseOption(ctx),
    series: echSeries,
    xAxis: categoryAxisOpt,
    yAxis: { ...valueAxis(t, fieldMap(def.data.fields).get(e.value!), locale), scale: true },
    tooltip: tooltipBase(t, 'axis', 'line'),
    grid: { left: 64, right: 24, top: 32, bottom: 32 },
    legend: groups.length > 1 && def.interactions?.includes('legend-toggle') ? legendOption(ctx, groups.map(String), 'top') : undefined,
  };

  return { option, warnings: [], lookup: (si, di) => ({ rows: groupedRows[si]?.[di], row: groupedRows[si]?.[di]?.[0] }) };
}

function buildFunnel(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const fm = fieldMap(def.data.fields);
  const catField = fm.get(e.category!);
  const valueField = fm.get(e.value!);

  const data = distinct(rows, e.category!).map((cat, i) => {
    const value = rows.find(r => r[e.category!] === cat)?.[e.value!] ?? 0;
    return {
      value,
      name: String(cat),
      itemStyle: { color: t.palette[i % t.palette.length] },
      emphasis: { itemStyle: glow(t, t.palette[i % t.palette.length]!, 2) },
    };
  });

  const option: Opt = {
    ...baseOption(ctx),
    series: [{
      type: 'funnel',
      name: fieldLabel(valueField, e.value!),
      data,
      sort: 'descending',
      itemStyle: { borderColor: t.tokens.bgSurface, borderWidth: 2 },
      label: { show: true, color: t.tokens.textPrimary, fontSize: 12 },
      emphasis: { focus: 'series' },
      // Stages drop in top → bottom.
      animationDelay: stagger(ctx.motion, data.length),
    }],
    tooltip: tooltipBase(t, 'item'),
    legend: legendOption(ctx, data.map(d => d.name), 'right'),
  };

  return { option, warnings: [], lookup: (_si, di) => {
    const category = distinct(rows, e.category!)[di];
    const matches = rows.filter(r => r[e.category!] === category);
    return { row: matches[0], rows: matches };
  } };
}

function buildSankey(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t } = ctx;
  const e = def.encoding ?? {};
  const path = e.path ?? [];
  const nodeNames = new Set<string>();
  const linkMap = new Map<string, { source: string; target: string; value: number; rows: Row[] }>();
  for (const row of rows) {
    const value = row[e.value!];
    if (typeof value !== 'number' || value <= 0) continue;
    for (let i = 0; i + 1 < path.length; i++) {
      const source = row[path[i]!], target = row[path[i + 1]!];
      if (source == null || target == null || source === target) continue;
      const s = String(source), targetName = String(target), key = JSON.stringify([s, targetName]);
      nodeNames.add(s); nodeNames.add(targetName);
      const link = linkMap.get(key) ?? { source: s, target: targetName, value: 0, rows: [] };
      link.value += value; link.rows.push(row); linkMap.set(key, link);
    }
  }
  const nodes = [...nodeNames].map((name, i) => ({ name, itemStyle: { color: t.palette[i % t.palette.length] } }));
  const links = [...linkMap.values()].map(({ source, target, value }) => ({ source, target, value }));

  const option: Opt = {
    ...baseOption(ctx),
    series: [{
      type: 'sankey',
      name: def.title,
      nodes,
      links,
      itemStyle: { borderColor: t.tokens.gridLine, borderWidth: 1 },
      // Flows blend source → target colour; hovering a node lights its flows.
      lineStyle: { color: t.effects.gradient ? 'gradient' : 'source', opacity: 0.32, curveness: 0.5 },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.6 } },
      label: { show: true, color: t.tokens.textPrimary, fontSize: 11 },
    }],
    tooltip: tooltipBase(t, 'item'),
  };

  return { option, warnings: [], lookup: () => undefined };
}

function buildSunburst(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding ?? {};
  const vf = fieldMap(def.data.fields).get(e.value!);
  const { roots } = buildTree(rows, e.path ?? [], e.value!);

  const setColors = (nodes: any[], depth: number = 0) => {
    nodes.forEach((node, idx) => {
      node.itemStyle = { color: t.palette[idx % t.palette.length] };
      if (node.children) setColors(node.children, depth + 1);
    });
  };

  setColors(roots);

  const option: Opt = {
    ...baseOption(ctx),
    series: [{
      type: 'sunburst',
      name: def.title,
      data: roots,
      radius: [0, '90%'],
      itemStyle: { borderRadius: 7, borderWidth: 2, borderColor: t.tokens.bgSurface },
      label: { rotate: 'radial', color: t.tokens.textPrimary, fontSize: 11 },
    }],
    tooltip: tooltipBase(t, 'item'),
  };

  return { option, warnings: [], lookup: () => undefined };
}

function buildBubble(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding!;
  const xy = typeof e.x === 'string' && typeof e.y === 'string';
  const yField = typeof e.y === 'string' ? e.y : undefined;
  const valid = rows.filter(r => typeof r[e.value!] === 'number' && (!xy || (typeof r[e.x!] === 'number' && typeof r[yField!] === 'number')));
  const categories = distinct(valid, e.category!);
  const grouped = categories.map(cat => valid.filter(r => r[e.category!] === cat));
  const extent = numericExtent(valid, e.value!);
  const minSize = Math.max(0, extent?.[0] ?? 0);
  const maxSize = Math.max(0, extent?.[1] ?? 0);
  const fm = fieldMap(def.data.fields);
  // Packed form shrinks with the item count so the cluster fits a dashboard panel.
  const packScale = xy ? 1 : Math.max(0.5, Math.min(1, 10 / Math.sqrt(Math.max(1, valid.length * 8))));
  const sizeOf = (v: number) => (maxSize > minSize ? 14 + Math.sqrt((Math.max(minSize, v) - minSize) / (maxSize - minSize)) * 44 : 32) * packScale;
  const colorOf = (i: number) => t.palette[slotFor(ctx.slots, String(categories[i])) % t.palette.length] ?? t.palette[i % t.palette.length]!;
  if (!xy) {
    // Packed bubbles (COD-M packedbubble): one cluster, colour = group, area = value.
    // Deterministic circle packing in pixel space (see pack-layout.ts), fitted to the panel;
    // one custom series per group so legend toggles keep working.
    const hiddenGroup = (gi: number) => !!ctx.hidden?.has(String(categories[gi]));
    // Only visible groups are packed, so the cluster re-forms when the legend filters.
    const flat = grouped.flatMap((group, gi) => (hiddenGroup(gi) ? [] : group.map((r, di) => ({ r, gi, di }))));
    const radii = flat.map(({ r }) => sizeOf(r[e.value!] as number) / 2);
    const LEGEND_H = categories.length > 1 ? 30 : 0;
    let cache = { w: -1, h: -1, circles: [] as ReturnType<typeof packCircles> };
    const offsets = grouped.map((_, gi) => (hiddenGroup(gi) ? -1 : flat.findIndex((f) => f.gi === gi)));
    const delayFn = stagger(ctx.motion, flat.length);
    const series = grouped.map((group, gi) => {
      const c = colorOf(gi);
      const fill = t.effects.depth ? { fill: sphere(c, 0.9) } : (() => { const h = holo(t, c, 0.55); return { fill: h.color, stroke: h.borderColor, lineWidth: h.borderWidth, shadowBlur: h.shadowBlur, shadowColor: h.shadowColor }; })();
      return {
        type: 'custom', id: `bubble:${gi}`, name: String(categories[gi]), coordinateSystem: 'none', ...hoverSpring(ctx.motion),
        breathe: ctx.motion.enabled,
        data: group.map((r) => [r[e.value!]]),
        renderItem: (params: Opt, api: Opt) => {
          const w = api.getWidth(), h = api.getHeight() - LEGEND_H;
          if (w !== cache.w || h !== cache.h) cache = { w, h, circles: packCircles(radii, w, h) };
          if (offsets[gi]! < 0) return null;
          const k = offsets[gi]! + params.dataIndex;
          const pos = cache.circles[k];
          if (!pos) return null;
          const label = String(group[params.dataIndex]?.[e.label!] ?? '');
          const showLabel = def.options?.labels !== false && pos.r >= 15;
          const delay = typeof delayFn === 'function' ? delayFn(k) : delayFn;
          return {
            type: 'group', x: pos.x, y: pos.y + LEGEND_H,
            ...(ctx.motion.enabled ? { enterFrom: { scaleX: 0, scaleY: 0, style: { opacity: 0 } }, enterAnimation: { duration: ctx.motion.entranceMs, delay } } : {}),
            children: [{
              type: 'circle', shape: { cx: 0, cy: 0, r: pos.r }, style: fill,
              // Hover: glow; the adapter swells it and sets the whole cluster drifting (label rides along).
              emphasis: swell(t, c),
              ...(showLabel ? {
                textContent: { style: { text: label, fill: t.tokens.textPrimary, fontSize: Math.max(9, Math.min(12, pos.r / 2.6)), fontFamily: t.fontFamily, width: pos.r * 1.8, overflow: 'truncate' } },
                textConfig: { position: 'inside' },
              } : {}),
            }],
          };
        },
      };
    });
    const option: Opt = {
      ...baseOption(ctx),
      legend: categories.length > 1 ? legendOption(ctx, categories.map(String), 'top') : undefined,
      series,
      tooltip: {
        ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false,
        formatter: (p: Opt) => {
          const row = grouped[p.seriesIndex]?.[p.dataIndex];
          if (!row) return '';
          return tooltipHeader(String(row[e.label!])) +
            tooltipRow(colorOf(p.seriesIndex), String(categories[p.seriesIndex]), formatValue(row[e.value!], fm.get(e.value!), { locale }));
        },
      },
    };
    return {
      option,
      warnings: valid.length < rows.length ? ['값이 올바르지 않은 버블 항목을 제외했습니다.'] : [],
      lookup: (si, di) => ({ row: grouped[si]?.[di] }),
    };
  }
  const series = grouped.map((group, i) => ({
    type: 'scatter', name: String(categories[i]), id: `bubble:${i}`,
    data: group.map(r => ({ name: String(r[e.label!] ?? ''), value: [xy ? r[e.x!] : categories[i], xy ? r[yField!] : r[e.value!], r[e.value!]] })),
    symbolSize: (value: number[]) => maxSize > minSize ? 14 + Math.sqrt((Math.max(minSize, value[2]!) - minSize) / (maxSize - minSize)) * 48 : 34,
    itemStyle: t.effects.depth
      ? { color: sphere(t.palette[i % t.palette.length]!, 0.85), ...depthShadow(t, 0.7) }
      : { color: t.palette[i % t.palette.length], opacity: 0.65, borderColor: t.palette[i % t.palette.length], borderWidth: 1 },
    label: { show: def.options?.labels === true, position: 'inside', color: t.tokens.textPrimary, fontSize: 10, formatter: (p: Opt) => String(group[p.dataIndex]?.[e.label!] ?? '') },
    emphasis: { scale: 1.15, itemStyle: { opacity: 0.9, ...glow(t, t.palette[i % t.palette.length]!, 2) } },
    animationDelay: stagger(ctx.motion, group.length, i),
  }));
  return {
    option: {
      ...baseOption(ctx), grid: { left: 48, right: 36, top: 46, bottom: 48, containLabel: true },
      xAxis: xy ? { ...valueAxis(t, fm.get(e.x!), locale), scale: true } : { ...axisCommon(t), type: 'category', data: categories },
      yAxis: { ...valueAxis(t, fm.get(yField ?? e.value!), locale), scale: true },
      legend: legendOption(ctx, categories.map(String), 'top'),
      series, tooltip: {
        ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false,
        formatter: (p: Opt) => {
          const row = grouped[p.seriesIndex]?.[p.dataIndex];
          if (!row) return '';
          return tooltipHeader(String(row[e.label!])) +
            (xy ? tooltipRow(t.palette[p.seriesIndex % t.palette.length]!, fieldLabel(fm.get(e.x!), e.x!), formatValue(row[e.x!], fm.get(e.x!), { locale })) +
              tooltipRow(t.palette[p.seriesIndex % t.palette.length]!, fieldLabel(fm.get(yField!), yField!), formatValue(row[yField!], fm.get(yField!), { locale })) : '') +
            tooltipRow(t.palette[p.seriesIndex % t.palette.length]!, fieldLabel(fm.get(e.value!), e.value!), formatValue(row[e.value!], fm.get(e.value!), { locale }));
        },
      },
    },
    warnings: valid.length < rows.length ? ['좌표 또는 값이 올바르지 않은 버블 항목을 제외했습니다.'] : [], lookup: (si, di) => ({ row: grouped[si]?.[di] }),
  };
}

function buildGaugeGroup(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding!;
  const valid = rows.filter(r => typeof r[e.value!] === 'number');
  const shown = valid.filter(r => !ctx.hidden?.has(String(r[e.label!] ?? '')));
  const ringColor = (name: string) => t.palette[slotFor(ctx.slots, name) % t.palette.length]!;
  const min = def.options?.min ?? 0;
  const max = def.options?.max ?? 100;
  const span = max - min;
  // Rings re-pack over the visible items when the legend filters some out.
  const step = Math.min(9, 50 / Math.max(shown.length, 1));
  const vf = fieldMap(def.data.fields).get(e.value!);
  const series = valid.map((row, i) => {
    const name = String(row[e.label!] ?? '');
    const value = row[e.value!] as number;
    const progress = Math.max(0, Math.min(span, value - min));
    const vi = shown.indexOf(row);
    // Hidden items keep a zero-size ring so the legend can switch them back on.
    const outer = vi < 0 ? 0 : 80 - vi * step;
    const color = ringColor(name);
    return {
      type: 'pie', id: `gauge:${i}`, name, center: ['50%', '45%'],
      radius: vi < 0 ? ['0%', '0%'] : [`${outer - step * 0.8}%`, `${outer}%`],
      startAngle: 90, clockwise: true, avoidLabelOverlap: false,
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: false },
      // Rings sweep clockwise one after another, outer first, with the gauge's physical easing.
      animationType: 'expansion',
      animationDuration: ctx.motion.sweepMs,
      animationEasing: 'cubicOut',
      animationDurationUpdate: ctx.motion.sweepUpdateMs,
      animationEasingUpdate: 'cubicInOut',
      animationDelay: ctx.motion.enabled ? Math.max(0, vi) * 120 : 0,
      data: [
        {
          name, value: progress,
          itemStyle: { color, borderRadius: step >= 4 ? 4 : 0, ...glow(t, color) },
          emphasis: { itemStyle: glow(t, color, 2) },
        },
        { name: '', value: span - progress, itemStyle: { color: t.tokens.bgHover }, tooltip: { show: false } },
      ],
    };
  });
  return {
    option: { ...baseOption(ctx), series,
      legend: legendOption(ctx, valid.map(r => String(r[e.label!] ?? '')), 'bottom'),
      tooltip: {
      ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => {
        const row = valid[p.seriesIndex];
        return row && p.dataIndex === 0
          ? tooltipHeader(String(row[e.label!] ?? '')) + tooltipRow(ringColor(String(row[e.label!] ?? '')), fieldLabel(vf, e.value!), formatValue(row[e.value!], vf, { locale }))
          : '';
      },
    } },
    warnings: [], lookup: (si, di) => di === 0 && valid[si] ? { row: valid[si], value: valid[si]![e.value!] } : undefined,
  };
}

function buildPolarPie(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding!;
  interface Node { id: string; name: string; value: number; children: Node[] }
  const nodes = new Map<string, Node>();
  const rowById = new Map<string, Row>();
  const warnings: string[] = [];
  for (const row of rows) {
    if (row[e.label!] == null || typeof row[e.value!] !== 'number' || (row[e.value!] as number) < 0) {
      warnings.push('ID 또는 값이 올바르지 않은 계층 항목을 제외했습니다.');
      continue;
    }
    const id = String(row[e.label!]);
    if (nodes.has(id)) { warnings.push(`중복된 계층 ID '${id}'를 제외했습니다.`); continue; }
    nodes.set(id, { id, name: String(row[e.category!] ?? ''), value: row[e.value!] as number, children: [] });
    rowById.set(id, row);
  }
  const roots: Node[] = [];
  const validity = new Map<string, boolean>();
  for (const [id, node] of nodes) {
    const parent = rowById.get(id)?.[e.path![0]!];
    if (parent == null || parent === '') roots.push(node);
    else {
      const visited = new Set([id]);
      let next: unknown = parent;
      let valid = true;
      while (next != null && next !== '') {
        const key = String(next);
        if (visited.has(key) || !nodes.has(key)) {
          valid = false;
          break;
        }
        if (validity.has(key)) { valid = validity.get(key)!; break; }
        visited.add(key);
        next = rowById.get(key)?.[e.path![0]!];
      }
      visited.forEach(key => validity.set(key, valid));
      if (valid) nodes.get(String(parent))!.children.push(node);
      else warnings.push(`계층 ID '${id}'의 부모 관계가 올바르지 않아 제외했습니다.`);
    }
  }
  const nodeRows = new Map([...rowById].map(([id, row]) => [id, [row]]));
  // Colour by branch: a single root becomes a dark HUD hub and each of its children takes a
  // palette slot; descendants keep their branch hue, lighter per level (holographic rims).
  type Styled = Node & { itemStyle?: Opt; label?: Opt; children: Styled[] };
  const hubbed = roots.length === 1 && roots[0]!.children.length > 0;
  const paint = (node: Styled, color: string, depth: number): Opt => ({
    ...node,
    itemStyle: { ...holo(t, shade(color, Math.min(0.45, depth * 0.16)), 0.7 - depth * 0.06), borderRadius: 3 },
    children: node.children.map((c) => paint(c as Styled, color, depth + 1)),
  });
  const branches = hubbed ? roots[0]!.children : roots;
  const painted = branches.map((n, i) => paint(n as Styled, t.palette[slotFor(ctx.slots, n.name) % t.palette.length] ?? t.palette[i % t.palette.length]!, 0));
  const data = hubbed
    ? [{ ...roots[0]!, children: painted, itemStyle: { color: alpha(t.tokens.accentCyan, t.mode === 'light' ? 0.12 : 0.1), borderColor: alpha(t.tokens.accentCyan, 0.7), borderWidth: 1.5, ...glow(t, t.tokens.accentCyan, 0.8) }, label: { color: t.tokens.textPrimary, fontWeight: 700, rotate: 0 } }]
    : painted;
  return {
    option: { ...baseOption(ctx), series: [{
      type: 'sunburst', data, radius: [0, '86%'], sort: undefined,
      itemStyle: { borderWidth: 2, borderColor: t.tokens.bgSurface },
      label: { color: t.tokens.textPrimary, rotate: 'radial', fontSize: 11, minAngle: 10 },
      emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 18 } },
      animationType: 'expansion', animationDuration: ctx.motion.entranceMs,
    }, ...hudRings(t, ctx.motion, ['50%', '50%'], 86)], tooltip: {
      ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false,
      formatter: (p: Opt) => tooltipHeader(String(p.name)) + tooltipRow(p.color, fieldLabel(fieldMap(def.data.fields).get(e.value!), e.value!), formatValue(p.value, fieldMap(def.data.fields).get(e.value!), { locale })),
    } },
    warnings, nodeRows, lookup: () => undefined,
  };
}

function buildWordCloud(ctx: Ctx): BuildResult {
  const { definition: def, rows, theme: t, locale } = ctx;
  const e = def.encoding!;
  const eligible = rows.filter(r => typeof r[e.value!] === 'number' && (r[e.value!] as number) > 0 && r[e.category!] != null);
  const words = eligible.length > 100
    ? [...eligible].sort((a, b) => (b[e.value!] as number) - (a[e.value!] as number)).slice(0, 100)
    : eligible;
  const layoutInput = words.map(r => ({ text: String(r[e.category!]), weight: r[e.value!] as number }));
  let cached = { width: -1, height: -1, positions: [] as ReturnType<typeof layoutWords> };
  // Colour by weight tier (not a rainbow): hottest words lit cyan with a bloom, then two cool
  // accents, the long tail recedes into secondary ink.
  const maxW = Math.max(1, ...layoutInput.map(w => w.weight));
  const wordTier = (i: number) => { const r = (layoutInput[i]?.weight ?? 0) / maxW; return r >= 0.8 ? 0 : r >= 0.6 ? 1 : r >= 0.42 ? 2 : 3; };
  const tierColor = [neonCore(t, t.palette[0]!, 0.3), t.palette[3]!, t.palette[1]!, alpha(t.tokens.textSecondary, 0.78)];
  const wordFill = (i: number) => tierColor[wordTier(i)]!;
  const delayFn = stagger(ctx.motion, words.length);
  const wordDelay = (i: number) => (typeof delayFn === 'function' ? delayFn(i) : delayFn);
  const series = [{
    type: 'custom', id: 'word-cloud', coordinateSystem: 'none', ...hoverSpring(ctx.motion),
    breathe: ctx.motion.enabled,
    data: words.map(r => [r[e.category!], r[e.value!]]),
    renderItem: (params: Opt, api: Opt) => {
      const width = api.getWidth(), height = api.getHeight();
      if (width !== cached.width || height !== cached.height) cached = { width, height, positions: layoutWords(layoutInput, width, height) };
      const pos = cached.positions[params.dataIndex];
      if (!pos) return null;
      const fill = wordFill(params.dataIndex);
      const hot = wordTier(params.dataIndex) === 0;
      const word = {
        type: 'text', x: 0, y: 0, rotation: pos.rotate ? Math.PI / 2 : 0,
        style: { x: 0, y: 0, text: String(words[params.dataIndex]?.[e.category!] ?? ''), fontSize: pos.fontSize, fontFamily: t.fontFamily, fill, align: 'center', verticalAlign: 'middle', fontWeight: hot ? 700 : 500, ...(hot && t.effects.glow && t.mode === 'dark' ? { textShadowColor: alpha(t.palette[0]!, 0.85), textShadowBlur: 12 } : {}), ...(t.effects.depth ? { textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowBlur: 4, textShadowOffsetX: 1, textShadowOffsetY: 3 } : {}) },
        // Words pop in one after another.
        ...(ctx.motion.enabled
          ? { enterFrom: { style: { opacity: 0 }, scaleX: 0.6, scaleY: 0.6 }, enterAnimation: { duration: ctx.motion.entranceMs, delay: wordDelay(params.dataIndex) } }
          : {}),
        // Hover: lit in its own colour; the adapter swells it and sets the whole cloud drifting.
        emphasis: { z2: 10, style: { fill: neonCore(t, fill, 0.35), ...(t.effects.glow ? { textShadowBlur: t.mode === 'light' ? 6 : 16, textShadowColor: alpha(fill, 0.9) } : {}) } },
      };
      return { type: 'group', x: pos.x, y: pos.y, children: [word] };
    },
  }];
  return {
    option: { ...baseOption(ctx), series, tooltip: { ...tooltipBase(t, 'item'), show: def.interactions?.includes('tooltip') !== false, formatter: (p: Opt) => tooltipHeader(String(p.value[0])) + tooltipRow(wordFill(p.dataIndex), '가중치', formatValue(p.value[1], undefined, { locale })) } },
    warnings: [
      ...(eligible.length < rows.length ? ['가중치가 0 이하이거나 단어가 없는 행은 제외했습니다.'] : []),
      ...(words.length < eligible.length ? ['워드 클라우드는 가중치가 높은 100개 단어만 표시합니다. 데이터 표도 행 수 제한이 적용됩니다.'] : []),
    ],
    lookup: (_si, di) => ({ row: words[di] }),
  };
}

// ── Entry ─────────────────────────────────────────────────────────────────

/** Forms that place every colour side by side in one shape use the cool radial palette. */
const RADIAL_TYPES = new Set(['pie', 'donut', 'polar-pie', 'radar', 'gauge-group', 'bubble', 'word-cloud', 'sunburst', 'funnel']);

export function buildOption(ctx: RenderContext & { slots?: SlotMap; entrance?: boolean; xSeq?: XSeqMap }): BuildResult {
  const theme = RADIAL_TYPES.has(ctx.definition.type) ? { ...ctx.theme, palette: ctx.theme.radial } : ctx.theme;
  const c: Ctx = { ...ctx, theme, slots: ctx.slots ?? new Map() };
  let result: BuildResult;
  switch (ctx.definition.type) {
    case 'line': case 'area': case 'bar': case 'stacked-bar': case 'column':
      result = buildCartesian(c); break;
    case 'scatter': result = buildScatter(c); break;
    case 'pie': case 'donut': result = buildPie(c); break;
    case 'gauge': result = buildGauge(c); break;
    case 'heatmap': result = buildHeatmap(c); break;
    case 'treemap': result = buildTreemap(c); break;
    case 'radar': result = buildRadar(c); break;
    case 'bubble': result = buildBubble(c); break;
    case 'gauge-group': result = buildGaugeGroup(c); break;
    case 'polar-pie': result = buildPolarPie(c); break;
    case 'word-cloud': result = buildWordCloud(c); break;
    case 'candlestick': result = buildCandlestick(c); break;
    case 'boxplot': result = buildBoxplot(c); break;
    case 'funnel': result = buildFunnel(c); break;
    case 'sankey': result = buildSankey(c); break;
    case 'sunburst': result = buildSunburst(c); break;
    default:
      throw new Error(`ECharts adapter cannot render '${ctx.definition.type}'`);
  }
  if (c.theme.effects.depth) applyDepth(result.option, c.theme);
  // On-chart hover value (count-up next to the hovered mark) uses the chart's value field format.
  {
    const e = ctx.definition.encoding ?? {};
    const name = e.value ?? (typeof e.y === 'string' ? e.y : Array.isArray(e.y) ? e.y[0] : undefined);
    const field = name ? fieldMap(ctx.definition.data.fields).get(name) : undefined;
    result.option.__valueFormat = (v: number) => formatValue(v, field, { locale: ctx.locale });
  }
  // Auto-tour for wall displays (the adapter runs it).
  const tour = ctx.definition.options?.autoTour;
  if (tour) result.option.__tour = { intervalMs: (typeof tour === 'object' ? tour.intervalMs : undefined) ?? AUTO_TOUR_MS };
  const extra = ctx.definition.engineOptions?.echarts;
  if (extra && Object.keys(extra).length) result.option = mergeEngineOptions(result.option, extra);
  return result;
}

/**
 * 3D style for chart types without a dedicated 3D form: marks are raised off the
 * surface with a down-right drop shadow (cells, tiles, nodes, rings, boxes).
 * Bars, pies, lines and points have their own 3D forms in their builders.
 */
function applyDepth(option: Opt, t: ResolvedTheme): void {
  const raise = (style: Opt | undefined, strength: number) => ({ ...(style ?? {}), ...depthShadow(t, strength) });
  for (const s of (option.series as Opt[] | undefined) ?? []) {
    if (String(s.id ?? '').startsWith('fx:')) continue;
    switch (s.type) {
      case 'heatmap': case 'sankey':
        s.itemStyle = raise(s.itemStyle, 0.7);
        break;
      case 'funnel': case 'candlestick': case 'boxplot':
        s.itemStyle = raise(s.itemStyle, 1.1);
        break;
      case 'treemap': case 'sunburst':
        s.itemStyle = raise(s.itemStyle, 0.5);
        break;
      case 'radar':
        // The spider has no resting fill; give it a faint plate so the raised shadow has a body.
        s.areaStyle = raise({ ...s.areaStyle, opacity: Math.max(s.areaStyle?.opacity ?? 0, 0.16) }, 0.8);
        break;
      case 'gauge':
        if (s.progress?.show) s.progress.itemStyle = raise(s.progress.itemStyle, 0.8);
        if (s.pointer?.show) s.pointer.itemStyle = raise(s.pointer.itemStyle, 0.6);
        break;
      case 'pie':
        // Gauge-group rings (the plain pie/donut builds its own thick disk).
        if (String(s.id ?? '').startsWith('gauge:') && s.data?.[0]) s.data[0].itemStyle = raise(s.data[0].itemStyle, 0.7);
        break;
    }
  }
}

/** Escape-hatch merge: plain objects deep-merge; `series` merges by index. Input is pre-sanitised. */
export function mergeEngineOptions(base: Opt, extra: Record<string, unknown>): Opt {
  const { series, ...rest } = extra;
  const merged = deepMerge(base, rest);
  if (Array.isArray(series) && Array.isArray(base.series)) {
    merged.series = base.series.map((s: Opt, i: number) => (isPlainObject(series[i]) ? deepMerge(s, series[i] as Record<string, unknown>) : s));
  }
  return merged;
}
