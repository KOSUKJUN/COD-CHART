import type { AdapterEvent, ExportOptions, RenderContext, RendererAdapter } from '../../core/adapter';
import { registerAdapter } from '../../core/adapter';
import type { RendererChoice } from '../../core/types';
import { buildOption, type BuildResult, type Opt, type SlotMap, type XSeqMap } from './build';
import { BREATHING_SERIES, driftSettle, driftStart, focusIn, focusOut, PIE_HOVER, popOffset, type DriftTarget } from './effects';
import { countEase, countFrame, COUNT_MS, isCountable } from './count-up';
import { echarts } from './runtime';

type Instance = ReturnType<typeof echarts.init>;

/**
 * Owns exactly one ECharts instance. The native instance and option never leave
 * this module; consumers get normalised CODVIL events only.
 */
export class EChartsAdapter implements RendererAdapter {
  private chart: Instance | null = null;
  private listeners = new Set<(e: AdapterEvent) => void>();
  private last: BuildResult | null = null;
  private ctx: RenderContext | null = null;
  /** Entity → colour slot, persisted across updates so colours follow entities. */
  private readonly slots: SlotMap = new Map();
  /** Real-time x label sequence numbers, persisted so label thinning stays stable while sliding. */
  private readonly xSeq: XSeqMap = new Map();
  /** Legend items switched off by the viewer; every redraw honours them. */
  private readonly hidden = new Set<string>();
  warnings: string[] = [];

  constructor(private readonly renderer: RendererChoice) {}

  mount(el: HTMLElement, ctx: RenderContext): void {
    if (this.chart) this.destroy();
    this.chart = echarts.init(el, null, {
      renderer: this.renderer,
      locale: ctx.locale.toLowerCase().startsWith('ko') ? 'KO' : 'EN',
      // Partial canvas repaints can erase other chart elements on selection.
      useDirtyRect: false,
    });
    this.bindEvents();
    this.render(ctx, true);
    // Tooltip values count up from 0 when a tooltip opens (all chart types).
    if (typeof MutationObserver !== 'undefined') {
      this.tipObserver = new MutationObserver(() => this.countTooltip(el));
      this.tipObserver.observe(el, { childList: true, subtree: true });
    }
  }

  private tipObserver: MutationObserver | null = null;
  /** Values of the last counted tooltip: re-showing the same item does not recount. */
  private lastTip = '';

  private countTooltip(root: HTMLElement): void {
    const fresh = [...root.querySelectorAll<HTMLElement>('[data-cv-count]:not([data-cv-counted])')];
    if (!fresh.length) return;
    fresh.forEach((n) => n.setAttribute('data-cv-counted', ''));
    const finals = fresh.map((n) => n.textContent ?? '');
    const signature = finals.join('|');
    if (signature === this.lastTip || !this.ctx?.motion.enabled) { this.lastTip = signature; return; }
    this.lastTip = signature;
    const targets = fresh.map((n, i) => ({ n, text: finals[i]! })).filter((x) => isCountable(x.text));
    if (!targets.length) return;
    const start = performance.now();
    const step = (now: number) => {
      const k = countEase(Math.min(1, (now - start) / COUNT_MS));
      for (const { n, text } of targets) if (n.isConnected) n.textContent = countFrame(text, k);
      if (k < 1 && targets.some((x) => x.n.isConnected)) requestAnimationFrame(step);
    };
    for (const { n, text } of targets) n.textContent = countFrame(text, 0);
    requestAnimationFrame(step);
  }

  update(ctx: RenderContext, structural: boolean): void {
    if (!this.chart) return;
    this.render(ctx, structural);
  }

  /** When the running line/area entrance ends (performance.now() ms); 0 = none running. */
  private entranceEnds = 0;
  private deferTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `immediate`: a viewer action (legend toggle) that must not wait for the entrance.
   * Data-only updates that arrive while a line/area entrance is still drawing are held until it
   * ends — merging them earlier freezes the lines still waiting for their turn — and then only the
   * newest one is applied.
   */
  private render(ctx: RenderContext, structural: boolean, immediate = false): void {
    this.ctx = ctx;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!structural && !immediate && now < this.entranceEnds) {
      if (!this.deferTimer) {
        this.deferTimer = setTimeout(() => {
          this.deferTimer = null;
          this.entranceEnds = 0;
          if (this.chart && this.ctx) this.render(this.ctx, false);
        }, this.entranceEnds - now + 16);
      }
      return;
    }
    // A real-time shift is still playing: hold the update and apply the newest one after it.
    if (!structural && !immediate && this.shiftTimer) { this.shiftPending = true; return; }
    if (this.deferTimer) { clearTimeout(this.deferTimer); this.deferTimer = null; }
    if (this.shiftTimer) { clearTimeout(this.shiftTimer); this.shiftTimer = null; }
    this.shiftPending = false;
    this.settleDrift(false);
    this.clearHover();
    const prev = this.last;
    const result = buildOption({ ...ctx, hidden: this.hidden, slots: this.slots, xSeq: this.xSeq, entrance: structural });
    if (structural) this.entranceEnds = result.entranceMs ? now + result.entranceMs : 0;
    this.last = result;
    this.warnings = result.warnings;
    this.syncTour();
    if (!structural && !immediate && prev && this.playShift(prev.option, result.option)) return;
    // Structural changes replace the option; data-only updates merge, which lets
    // ECharts tween values instead of re-entering every mark.
    this.chart!.setOption(this.sizeSafe(result.option), structural ? { notMerge: true } : { replaceMerge: ['series'], lazyUpdate: true });
    if (structural) this.scheduleLoop();
  }

  // ── Real-time shift ────────────────────────────────────────────────────
  private shiftTimer: ReturnType<typeof setTimeout> | null = null;
  private shiftPending = false;

  /**
   * Real-time line/area: play a data update that appends points the way Highcharts'
   * `addPoint(point, redraw, shift)` does — one continuous scroll.
   *  1. (instant) The new points are added beyond the right edge of the current x window, where
   *     the plot clip hides them; the points about to leave are still there.
   *  2. (tween) The x window moves to its new range: lines, areas, labels and the newest-point
   *     ring slide left together — the new points come in from the right edge, the oldest slide
   *     out past the left edge.
   *  3. (instant) The points now outside the window are dropped (already invisible).
   * Returns false when the update is not such an append (the caller applies it as usual).
   */
  private playShift(prevOpt: Opt, next: Opt): boolean {
    const chart = this.chart;
    if (!chart || !next.__realtime || !prevOpt.__realtime || !this.ctx?.motion.enabled) return false;
    const xOf = (d: unknown) => (Array.isArray((d as Opt)?.value) ? Number((d as Opt).value[0]) : NaN);
    const isData = (s: Opt) => s.type === 'line' && !String(s.id ?? '').startsWith('fx:');
    const prevById = new Map((prevOpt.series as Opt[]).map((s) => [s.id, s]));
    let prevLast = -Infinity;
    (prevOpt.series as Opt[]).filter(isData).forEach((s) => (s.data as unknown[]).forEach((d) => { const x = xOf(d); if (x > prevLast) prevLast = x; }));
    const hasNew = (next.series as Opt[]).some((s) => isData(s) && (s.data as unknown[]).some((d) => xOf(d) > prevLast));
    if (!Number.isFinite(prevLast) || !hasNew) return false;

    const newMin = Number((next.xAxis as Opt)?.min);
    const prevAxis = prevOpt.xAxis as Opt;
    /** Data + x labels keep their leaving points (left of the new window) while the window slides. */
    const withLeaving = (s: Opt): Opt => {
      const before = prevById.get(s.id);
      if (!before || !(isData(s) || s.id === 'fx:xlabels')) return s;
      return { ...s, data: [...(before.data as unknown[]).filter((d) => xOf(d) < newMin), ...(s.data as unknown[])] };
    };
    // Only marks that move as one with the data take part; the flow light and breach rings come back at the end.
    const sliding = (s: Opt) => isData(s) || s.id === 'fx:xlabels' || String(s.id ?? '').startsWith('fx:live');
    const ms = Math.max(500, this.ctx.motion.updateMs);

    // 1 — new points parked beyond the right edge; the window (and the ring) still where they were.
    const parked = {
      ...next, animation: false,
      xAxis: { ...next.xAxis, min: prevAxis.min, max: prevAxis.max },
      series: (next.series as Opt[]).filter(sliding).map((s) => (String(s.id ?? '').startsWith('fx:live') ? prevById.get(s.id) ?? s : withLeaving(s))),
    };
    chart.setOption(this.sizeSafe(parked), { replaceMerge: ['series'] });
    // 2 — the window moves: everything scrolls left together.
    const scrolled = {
      ...next, animation: true, animationDurationUpdate: ms,
      series: (next.series as Opt[]).filter(sliding).map(withLeaving),
    };
    chart.setOption(this.sizeSafe(scrolled), { replaceMerge: ['series'] });
    this.shiftTimer = setTimeout(() => {
      this.shiftTimer = null;
      // 3 — drop what scrolled out (invisible now) and bring back the flow light / breach rings.
      if (this.chart) this.chart.setOption(this.sizeSafe({ ...next, animation: false }), { replaceMerge: ['series'] });
      if (this.chart) this.chart.setOption({ animation: true });
      // An update that arrived meanwhile: apply the newest now.
      if (this.shiftPending && this.chart && this.ctx) { this.shiftPending = false; this.render(this.ctx, false); }
    }, ms + 30);
    return true;
  }

  /** Effect trails are off while the container has no size (see `sizeSafe`); true = they need restoring. */
  private trailsStripped = false;

  /**
   * A trail effect (`effect.trailLength`) makes ECharts motion-blur the whole canvas layer, copying
   * the canvas onto itself every frame. In a 0×0 container (hidden panel, collapsed tab) that copy
   * throws on every frame, forever. So while the container has no size the trails are switched off;
   * `resize` puts them back once it has a size again.
   */
  private sizeSafe(option: Opt): Opt {
    const dom = this.chart?.getDom() as HTMLElement | undefined;
    const zero = !!dom && (dom.clientWidth === 0 || dom.clientHeight === 0);
    const series = option.series as Opt[] | undefined;
    if (!zero || !Array.isArray(series) || !series.some((s) => (s.effect?.trailLength ?? 0) > 0)) {
      this.trailsStripped = false;
      return option;
    }
    this.trailsStripped = true;
    return { ...option, series: series.map((s) => ((s.effect?.trailLength ?? 0) > 0 ? { ...s, effect: { ...s.effect, trailLength: 0 } } : s)) };
  }

  resize(width?: number, height?: number): void {
    if (!this.chart) return;
    const dom = this.chart.getDom() as HTMLElement;
    const zero = width === 0 || height === 0 || (width == null && dom.clientWidth === 0) || (height == null && dom.clientHeight === 0);
    // Going to 0×0: turn trails off first (see sizeSafe), before the canvas shrinks under them.
    if (zero && !this.trailsStripped && this.last) this.chart.setOption(this.sizeSafe(this.last.option), { replaceMerge: ['series'] });
    this.chart.resize({
      width: width ?? 'auto',
      height: height ?? 'auto',
      // Re-layout instantly: animating a resize interrupts in-flight entrance/update tweens.
      animation: { duration: 0 },
    });
    // Back to a real size: restore the trails that were switched off.
    if (!zero && this.trailsStripped && this.last) {
      this.trailsStripped = false;
      this.chart.setOption(this.last.option, { replaceMerge: ['series'] });
    }
  }

  replay(): void {
    if (!this.chart || !this.last) return;
    // clear() drops every rendered mark, so the next setOption plays the full entrance again
    // (rebuilt as an entrance so the one-shot effects play too).
    this.chart.clear();
    this.clearHover();
    if (this.ctx) {
      this.last = buildOption({ ...this.ctx, hidden: this.hidden, slots: this.slots, xSeq: this.xSeq, entrance: true });
      this.entranceEnds = this.last.entranceMs ? performance.now() + this.last.entranceMs : 0;
    }
    this.chart.setOption(this.sizeSafe(this.last.option), { notMerge: true });
    this.scheduleLoop();
    this.syncTour();
  }

  // ── One-by-one draw loop ───────────────────────────────────────────────
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerInside = false;

  /** Next drawing cycle: after the running entrance plus the hold, if the chart asks for a loop. */
  private scheduleLoop(): void {
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    const loop = this.last?.loop;
    if (!loop || !this.ctx?.motion.enabled) return;
    const wait = Math.max(0, this.entranceEnds - performance.now()) + loop.holdMs;
    this.loopTimer = setTimeout(() => this.cycle(), wait);
  }

  /** Fade the drawn lines out, then draw them in again one by one. Waits while being read (hovered). */
  private cycle(): void {
    this.loopTimer = null;
    const chart = this.chart, last = this.last;
    if (!chart || !last?.loop) return;
    if (this.pointerInside) { this.loopTimer = setTimeout(() => this.cycle(), 1000); return; }
    const FADE_MS = 450;
    const fade = (last.option.series as Opt[]).map((s) =>
      s.type === 'line' ? { id: s.id, lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, ...(s.areaStyle ? { areaStyle: { opacity: 0 } } : {}) }
      : s.type === 'lines' ? { id: s.id, effect: { show: false } }
      : String(s.id ?? '').startsWith('fx:') && s.type !== 'custom' ? { id: s.id, itemStyle: { opacity: 0 } }
      : { id: s.id });
    chart.setOption({ series: fade }, { lazyUpdate: false });
    this.loopTimer = setTimeout(() => { this.loopTimer = null; if (this.chart && this.last?.loop) this.replay(); }, FADE_MS);
  }

  onEvent(listener: (e: AdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  exportImage(options: ExportOptions = {}): string | null {
    if (!this.chart) return null;
    const type = options.type ?? 'png';
    if (type === 'svg' && this.renderer !== 'svg') return null;
    return this.chart.getDataURL({
      type,
      pixelRatio: options.pixelRatio ?? 2,
      backgroundColor: options.background ?? this.ctx?.theme.tokens.bgSurface,
      excludeComponents: ['dataZoom'],
    });
  }

  destroy(): void {
    if (!this.chart) return;
    this.tipObserver?.disconnect();
    this.tipObserver = null;
    if (this.deferTimer) { clearTimeout(this.deferTimer); this.deferTimer = null; }
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    if (this.shiftTimer) { clearTimeout(this.shiftTimer); this.shiftTimer = null; }
    this.stopTour();
    this.settleDrift(false);
    this.chart.off();
    this.chart.dispose();
    this.chart = null;
    this.last = null;
    this.listeners.clear();
  }

  // ── Hover extras ───────────────────────────────────────────────────────
  private valueText: { remove(): void; key: string } | null = null;
  private sliceFocus: { si: number } | null = null;

  /**
   * E/G for the flat pie, as state: the hovered sector's `emphasis` state carries its pop-out
   * offset and every other sector's `blur` state its recede scale. Tweening x/y by hand fought
   * ECharts — a state switch stops an element's running tweens, so a slice could stay popped
   * after the pointer left. As states, entering and leaving are both ECharts' own transitions.
   * Idempotent; runs on every render so new and reused sectors both carry it.
   */
  private installPieStates(): void {
    const series = (this.last?.option.series as Opt[] | undefined) ?? [];
    const si = series.findIndex((s) => s.id === 'pie');
    if (si < 0 || series.some((s) => s.id === 'pie3d')) return;
    for (const el of this.sliceEls(si)) {
      const shape = el.shape as { cx: number; cy: number; startAngle: number; endAngle: number };
      el.originX = shape.cx; el.originY = shape.cy;
      const pop = popOffset(shape);
      Object.assign(el.ensureState('emphasis'), { x: pop.x, y: pop.y, scaleX: 1, scaleY: 1 });
      Object.assign(el.ensureState('blur'), { x: 0, y: 0, scaleX: PIE_HOVER.recede, scaleY: PIE_HOVER.recede });
    }
  }
  private pointerY = 0;

  /**
   * `animate`: glide the slices home (pointer left the chart). Otherwise snap them home now —
   * a merge update reuses the slice elements, so a lifted slice would otherwise stay lifted.
   */
  private clearHover(animate = false): void {
    this.hideValue();
    this.releaseSlice(!animate);
  }

  /** Series types whose single hovered value is shown on the chart (multi-value marks are not). */
  private static readonly VALUE_SKIP = new Set(['radar', 'candlestick', 'boxplot', 'gauge', 'lines', 'effectScatter']);

  /** The number to count up for a hovered item (lookup value first, then the mark's own value). */
  private pickValue(p: Opt): number | null {
    const hit = this.last?.lookup(p.seriesIndex, p.dataIndex);
    if (typeof hit?.value === 'number') return hit.value;
    const v = p.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) if (typeof v[i] === 'number' && Number.isFinite(v[i])) return v[i];
    }
    return null;
  }

  /** Where the value sits: outside a slice, at a ring's end, at a bar's tip, or above the mark. */
  private anchorFor(p: Opt, built: Opt | undefined): { x: number; y: number; align: 'left' | 'center' | 'right'; vAlign: 'bottom' | 'middle' } | null {
    const el = this.itemElement(p.seriesIndex, p.dataIndex) as unknown as (Opt & { getBoundingRect?(): Opt }) | null;
    if (el?.shape && typeof el.shape.startAngle === 'number' && typeof el.shape.r === 'number') {
      const ring = String(p.seriesId ?? '').startsWith('gauge:');
      const a = ring ? el.shape.endAngle : (el.shape.startAngle + el.shape.endAngle) / 2;
      // Plain pie: inside the slice (its % labels sit outside); rings: at the arc's end; others: just outside.
      const inside = p.seriesId === 'pie';
      const r = inside ? (el.shape.r0 ?? 0) + (el.shape.r - (el.shape.r0 ?? 0)) * 0.62 : el.shape.r + (ring ? 4 : 12);
      const x = el.shape.cx + Math.cos(a) * r + (el.x ?? 0), y = el.shape.cy + Math.sin(a) * r + (el.y ?? 0);
      return { x, y, align: inside ? 'center' : Math.cos(a) >= 0.2 ? 'left' : Math.cos(a) <= -0.2 ? 'right' : 'center', vAlign: 'middle' };
    }
    if (el?.getBoundingRect) {
      const rect = el.getBoundingRect().clone();
      const m = (el as Opt).getComputedTransform?.();
      if (m) rect.applyTransform(m);
      if (built?.hoverValue?.horizontal) return { x: rect.x + rect.width + 8, y: rect.y + rect.height / 2, align: 'left', vAlign: 'middle' };
      return { x: rect.x + rect.width / 2, y: rect.y - 6, align: 'center', vAlign: 'bottom' };
    }
    const ev = p.event?.event as { offsetX?: number; offsetY?: number } | undefined;
    return ev?.offsetX != null ? { x: ev.offsetX, y: (ev.offsetY ?? 0) - 14, align: 'center', vAlign: 'bottom' } : null;
  }

  /** Draw the value at `at` and count it up from 0 (instant when motion is off). Same key → no recount. */
  private showValue(key: string, at: { x: number; y: number; align: 'left' | 'center' | 'right'; vAlign: 'bottom' | 'middle' }, value: number, color: string): void {
    if (this.valueText?.key === key) return;
    this.hideValue();
    const zr = this.chart?.getZr();
    const format = (this.last?.option as Opt | undefined)?.__valueFormat as ((v: number) => string) | undefined;
    if (!zr || !this.ctx || !format) return;
    const t = this.ctx.theme;
    const light = t.mode === 'light';
    const rises = at.vAlign === 'bottom';
    const accent = /^#[0-9a-f]{6}$/i.test(color) ? color : t.tokens.accentCyan;
    const text = new echarts.graphic.Text({
      silent: true, z: 1000, y: rises ? 8 : 0, x: rises ? 0 : at.align === 'left' ? -6 : at.align === 'right' ? 6 : 0,
      style: {
        // Measured at its final value first so the pill can be kept inside the canvas.
        text: format(value), x: at.x, y: at.y, fill: t.tokens.textPrimary, fontSize: 13, fontWeight: 700, fontFamily: t.fontFamily,
        align: at.align, verticalAlign: at.vAlign, opacity: 0,
        // Small pill behind the number so it reads over marks, grid lines and other series.
        backgroundColor: light ? 'rgba(255,255,255,0.94)' : 'rgba(6,20,36,0.86)',
        borderColor: `${accent}${light ? '99' : 'b3'}`, borderWidth: 1, borderRadius: 10, padding: [3, 8],
        shadowBlur: light ? 4 : 10, shadowColor: light ? 'rgba(15,23,36,0.16)' : `${accent}59`,
      },
    });
    // Keep the pill on-canvas (bars at the top edge, points at the sides).
    const rect = text.getBoundingRect();
    const W = zr.getWidth() ?? 0, H = zr.getHeight() ?? 0;
    const dx = Math.max(0, 4 - rect.x) - Math.max(0, rect.x + rect.width - (W - 4));
    const dy = Math.max(0, 4 - rect.y) - Math.max(0, rect.y + rect.height - (H - 4));
    if (W > 0 && H > 0 && (dx || dy)) text.setStyle({ x: at.x + dx, y: at.y + dy });
    text.setStyle({ text: format(this.ctx.motion.enabled ? 0 : value) });
    zr.add(text);
    const remove = () => { zr.remove(text); };
    this.valueText = { remove, key };
    if (!this.ctx.motion.enabled) { text.setStyle({ text: format(value), opacity: 1 }); text.x = 0; text.y = 0; return; }
    text.animateTo({ x: 0, y: 0, style: { opacity: 1 } }, { duration: 260, easing: 'cubicOut' });
    const start = performance.now(), dur = 560;
    const decimals = Number.isInteger(value) ? 0 : 2;
    const tick = (now: number) => {
      if (this.valueText?.remove !== remove) return;
      const k = Math.min(1, (now - start) / dur);
      const v = k >= 1 ? value : Number((value * (1 - Math.pow(1 - k, 3))).toFixed(decimals));
      text.setStyle({ text: format(v) });
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Pie value as a callout: an elbowed leader line draws out of the slice edge, then a pill
   * bubble pops in at its end with the value counting up and the share beside it.
   */
  private showPieCallout(p: Opt, built: Opt | undefined, value: number): void {
    const key = `callout:${p.seriesIndex}:${p.dataIndex}`;
    if (this.valueText?.key === key) return;
    this.hideValue();
    const chart = this.chart, zr = chart?.getZr(), ctx = this.ctx;
    const format = (this.last?.option as Opt | undefined)?.__valueFormat as ((v: number) => string) | undefined;
    if (!chart || !zr || !ctx || !format) return;
    // Edge point and outward direction of the slice.
    let edge: { x: number; y: number }, dir: { x: number; y: number };
    if (p.seriesId === 'pie3d' && typeof built?.sliceGeom === 'function') {
      const g = built.sliceGeom(p.dataIndex, chart.getWidth(), chart.getHeight());
      const cos = Math.cos(g.mid), sin = Math.sin(g.mid);
      // Follows the lifted slice (H): lift 10px up, 6px outward.
      edge = { x: g.cx + cos * (g.R + PIE_HOVER.liftOutPx), y: g.cy + sin * (g.R + PIE_HOVER.liftOutPx) * g.tilt + (sin > 0 ? g.D : 0) - PIE_HOVER.liftPx };
      const len = Math.hypot(cos, sin * g.tilt) || 1;
      dir = { x: cos / len, y: (sin * g.tilt) / len };
    } else {
      const el = this.itemElement(p.seriesIndex, p.dataIndex) as unknown as Opt | null;
      if (!el?.shape || typeof el.shape.r !== 'number') return;
      const mid = (el.shape.startAngle + el.shape.endAngle) / 2;
      dir = { x: Math.cos(mid), y: Math.sin(mid) };
      // Include the pop-out (E) the slice is animating to.
      edge = { x: el.shape.cx + dir.x * (el.shape.r + PIE_HOVER.popPx + 3), y: el.shape.cy + dir.y * (el.shape.r + PIE_HOVER.popPx + 3) };
    }
    const side = dir.x >= 0 ? 1 : -1;
    const elbow = { x: edge.x + dir.x * 14, y: edge.y + dir.y * 14 };
    const end = { x: elbow.x + side * 16, y: elbow.y };
    // Share of the visible total.
    const pieData = ((this.last!.option.series as Opt[])[0]?.data as Opt[]) ?? [];
    const total = pieData.filter((d) => !this.hidden.has(String(d.name))).reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
    const pct = `${Math.round((value / total) * 1000) / 10}%`;
    const t = ctx.theme;
    const color = (built?.sliceColors as string[] | undefined)?.[p.dataIndex] ?? (typeof p.color === 'string' && p.color.startsWith('#') ? p.color : t.palette[0]!);
    const light = t.mode === 'light';
    const G = echarts.graphic as unknown as Record<string, new (o: Opt) => Opt>;
    const nameText = new G.Text!({ style: { text: String(p.name ?? ''), fill: t.tokens.textSecondary, fontSize: 12, fontWeight: 600, fontFamily: t.fontFamily, verticalAlign: 'middle', width: 160, overflow: 'truncate', ellipsis: '…' } });
    const valueText = new G.Text!({ style: { text: format(value), fill: t.tokens.textPrimary, fontSize: 14, fontWeight: 700, fontFamily: t.fontFamily, verticalAlign: 'middle' } });
    const pctText = new G.Text!({ style: { text: pct, fill: t.tokens.textSecondary, fontSize: 11, fontWeight: 600, fontFamily: t.fontFamily, verticalAlign: 'middle' } });
    let nw = nameText.getBoundingRect().width, vw = valueText.getBoundingRect().width, pw = pctText.getBoundingRect().width;
    const padX = 12, gap = 8;
    const H = chart.getHeight();
    // Stay clear of a right-hand legend: the usable width ends where the legend begins.
    let W = chart.getWidth();
    const legend = (this.last?.option as Opt | undefined)?.legend as Opt | undefined;
    if (legend && legend.orient === 'vertical' && legend.right != null && Array.isArray(legend.data)) {
      const probe = new G.Text!({ style: { fontSize: 12, fontFamily: t.fontFamily, text: '' } });
      const widest = Math.max(0, ...legend.data.map((n: unknown) => { probe.setStyle({ text: String(n) }); return probe.getBoundingRect().width; }));
      W -= widest + (legend.itemWidth ?? 10) + 12;
    }
    // Room on the side the slice faces. One line (name · value · share) when it fits;
    // otherwise a narrower two-line bubble (name above, value · share below) so it stays off the pie.
    const room = side > 0 ? W - 4 - end.x : end.x - 4;
    const oneLine = padX * 2 + nw + gap + vw + gap + pw;
    const stacked = oneLine > room;
    // Never wider than the chart: long names truncate (…); a value too wide drops the share,
    // then truncates as a last resort, so the bubble always stays inside the canvas.
    const inner = Math.max(40, W - 8 - padX * 2);
    let showPct = true;
    if (stacked) {
      if (nw > inner) { nameText.setStyle({ width: inner }); nw = inner; }
      if (vw + gap + pw > inner) { showPct = false; pw = 0; }
      if (vw > inner) { valueText.setStyle({ width: inner, overflow: 'truncate', ellipsis: '…' }); vw = inner; }
    }
    const h = stacked ? 42 : 28;
    const w = stacked ? padX * 2 + Math.max(nw, vw + (showPct ? gap + pw : 0)) : oneLine;
    let bx = side > 0 ? end.x : end.x - w;
    bx = Math.max(4, Math.min(W - w - 4, bx));
    const by = Math.max(4, Math.min(H - h - 4, end.y - h / 2));
    if (stacked) {
      nameText.attr({ x: bx + padX, y: by + 14 });
      valueText.attr({ x: bx + padX, y: by + 29 });
      pctText.attr({ x: bx + padX + vw + gap, y: by + 29 });
    } else {
      nameText.attr({ x: bx + padX, y: by + h / 2 });
      valueText.attr({ x: bx + padX + nw + gap, y: by + h / 2 });
      pctText.attr({ x: bx + padX + nw + gap + vw + gap, y: by + h / 2 });
    }
    const line = new G.Polyline!({
      shape: { points: [[edge.x, edge.y], [elbow.x, elbow.y], [side > 0 ? bx : bx + w, by + h / 2]], percent: ctx.motion.enabled ? 0 : 1 },
      style: { stroke: color, lineWidth: 1.5, fill: 'none', shadowBlur: light ? 0 : 8, shadowColor: color },
    });
    const dot = new G.Circle!({ shape: { cx: edge.x, cy: edge.y, r: 2.5 }, style: { fill: color, shadowBlur: light ? 0 : 8, shadowColor: color } });
    const bubble = new G.Group!({ originX: side > 0 ? bx : bx + w, originY: by + h / 2 });
    bubble.add(new G.Rect!({
      shape: { x: bx, y: by, width: w, height: h, r: stacked ? 12 : h / 2 },
      style: { fill: light ? 'rgba(255,255,255,0.96)' : 'rgba(6, 20, 36, 0.92)', stroke: color, lineWidth: 1.2, shadowBlur: light ? 6 : 16, shadowColor: light ? 'rgba(15,23,36,0.18)' : color },
    }));
    bubble.add(nameText);
    bubble.add(valueText);
    if (showPct) bubble.add(pctText);
    const group = new G.Group!({ silent: true });
    group.add(line); group.add(dot); group.add(bubble);
    // z lives on displayables in zrender (a group's z is not inherited): lift every part above the slices.
    group.traverse((c: Opt) => { if (c.type !== 'group') c.attr({ z: 1000, z2: 10 }); });
    type ZrEl = Parameters<typeof zr.add>[0];
    zr.add(group as unknown as ZrEl);
    const remove = () => { zr.remove(group as unknown as ZrEl); };
    this.valueText = { remove, key };
    if (!ctx.motion.enabled) return;
    line.animateTo({ shape: { percent: 1 } }, { duration: 220, easing: 'cubicOut' });
    bubble.attr({ scaleX: 0.6, scaleY: 0.6 });
    bubble.eachChild((c: Opt) => c.setStyle?.({ opacity: 0 }));
    bubble.animateTo({ scaleX: 1, scaleY: 1 }, { duration: 300, delay: 150, easing: 'backOut' });
    bubble.eachChild((c: Opt) => c.animateTo?.({ style: { opacity: 1 } }, { duration: 200, delay: 150, easing: 'cubicOut' }));
    const start = performance.now() + 150, dur = 560;
    const decimals = Number.isInteger(value) ? 0 : (String(value).split('.')[1]?.length ?? 0);
    const tick = (now: number) => {
      if (this.valueText?.remove !== remove) return;
      const k = Math.max(0, Math.min(1, (now - start) / dur));
      valueText.setStyle({ text: format(k >= 1 ? value : Number((value * (1 - Math.pow(1 - k, 3))).toFixed(decimals))) });
      if (k < 1) requestAnimationFrame(tick);
    };
    valueText.setStyle({ text: format(0) });
    requestAnimationFrame(tick);
  }

  private hideValue(): void {
    this.valueText?.remove();
    this.valueText = null;
  }

  /** Line/area: the value of the series nearest the pointer at the hovered x. */
  private lineValueAt(dataIndex: number): void {
    const chart = this.chart;
    const series = (this.last?.option.series as Opt[] | undefined) ?? [];
    if (!chart) return;
    let best: { si: number; x: number; y: number; v: number; color: string } | null = null;
    series.forEach((s, si) => {
      if (s.type !== 'line' || String(s.id ?? '').startsWith('fx:') || this.hidden.has(String(s.name)) || s.label?.show === true) return;
      const raw = s.data?.[dataIndex];
      // Real-time points are { name, value: [x, y] } on a numeric x; others sit at their index.
      const pair = Array.isArray(raw?.value) ? (raw.value as unknown[]) : null;
      const v = typeof raw === 'number' ? raw : pair ? (typeof pair[1] === 'number' ? pair[1] : null) : typeof raw?.value === 'number' ? raw.value : null;
      if (v == null) return;
      const px = chart.convertToPixel({ seriesIndex: si }, [pair ? Number(pair[0]) : dataIndex, v]) as number[] | undefined;
      if (!px) return;
      const color = (s.itemStyle?.color as string) ?? this.ctx?.theme.tokens.accentCyan ?? '#fff';
      if (!best || Math.abs(px[1]! - this.pointerY) < Math.abs(best.y - this.pointerY)) best = { si, x: px[0]!, y: px[1]!, v, color };
    });
    if (!best) { this.hideValue(); return; }
    const b = best as { si: number; x: number; y: number; v: number; color: string };
    // Upper-left of the point: the axis tooltip opens to the right of the pointer.
    this.showValue(`line:${b.si}:${dataIndex}`, { x: b.x - 8, y: b.y - 8, align: 'right', vAlign: 'bottom' }, b.v, b.color);
  }

  private sliceEls(si: number): (Opt & { shape: Opt })[] {
    const out: (Opt & { shape: Opt })[] = [];
    const series = (this.last?.option.series as Opt[] | undefined)?.[si];
    const count = Array.isArray(series?.data) ? series.data.length : 0;
    for (let di = 0; di < count; di++) {
      const el = this.itemElement(si, di) as unknown as (Opt & { shape: Opt }) | null;
      if (el?.shape && typeof el.shape.startAngle === 'number') out.push(el);
    }
    return out;
  }

  private focusSlice(si: number, di: number, name: string, value: number): void {
    const motion = this.ctx?.motion.enabled ? PIE_HOVER.ms : 0;
    const built = (this.last?.option.series as Opt[])?.[si];
    const pie3d = built?.id === 'pie3d';
    if (pie3d && typeof built.sliceGeom === 'function' && this.chart) {
      // H — the hovered slice lifts off the disk (wall and all) and leans out along its angle;
      // G — the rest recede toward the disk centre (and dim via the series blur state).
      const w = this.chart.getWidth(), h = this.chart.getHeight();
      const count = Array.isArray(built.data) ? built.data.length : 0;
      for (let k = 0; k < count; k++) {
        const el = this.itemElement(si, k) as unknown as Opt | null;
        if (!el) continue;
        const g = built.sliceGeom(k, w, h);
        el.originX = g.cx; el.originY = g.cy;
        const lifted = k === di;
        this.raise(el, lifted);
        el.animateTo(lifted
          ? { x: Math.cos(g.mid) * PIE_HOVER.liftOutPx, y: Math.sin(g.mid) * PIE_HOVER.liftOutPx * g.tilt - PIE_HOVER.liftPx, scaleX: 1, scaleY: 1 }
          : { x: 0, y: 0, scaleX: PIE_HOVER.recede3d, scaleY: PIE_HOVER.recede3d }, { duration: motion, easing: 'cubicOut' });
      }
    }
    // Flat pie: the pop/recede lives in the sectors' own emphasis/blur states (installPieStates),
    // so ECharts tweens it in and back out with its state transitions.
    this.sliceFocus = { si };
    // Donut centre: switch the readout to the hovered slice (the number counts over).
    const center = (this.last?.option.series as Opt[] | undefined)?.find((s) => s.id === '__center');
    if (center?.hoverFormatter && this.chart) {
      const pieData = ((this.last!.option.series as Opt[])[0]?.data as Opt[]) ?? [];
      const shown = pieData.filter((d) => !this.hidden.has(String(d.name)));
      const total = shown.reduce((acc, d) => acc + (Number(d.value) || 0), 0) || 1;
      const pct = Math.round((value / total) * 1000) / 10;
      this.chart.setOption({ series: [{ id: '__center', data: [{ value, name: '', itemStyle: { color: 'transparent' } }], label: { formatter: center.hoverFormatter(name, pct) } }] }, { lazyUpdate: true });
    }
  }

  /** Bring a lifted 3D slice above its neighbours (z2 boost on every part), or put it back. */
  private raise(el: Opt, up: boolean): void {
    const BOOST = 300;
    if (Boolean(el.__cvRaised) === up || typeof el.traverse !== 'function') return;
    el.__cvRaised = up;
    el.traverse((c: Opt) => { if (typeof c.z2 === 'number') { c.z2 += up ? BOOST : -BOOST; c.markRedraw?.(); } });
  }

  /** Put every slice back at rest. `immediate`: no tween (and no centre restore — a re-render follows). */
  private releaseSlice(immediate = false): void {
    if (!this.sliceFocus) return;
    const { si } = this.sliceFocus;
    this.sliceFocus = null;
    const motion = this.ctx?.motion.enabled ? PIE_HOVER.ms : 0;
    const home = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const settle = (el: Opt) => {
      if (immediate || motion === 0) { el.stopAnimation?.(); el.attr?.(home); el.markRedraw?.(); }
      else el.animateTo(home, { duration: motion, easing: 'cubicOut' });
    };
    const built = (this.last?.option.series as Opt[] | undefined)?.[si];
    if (built?.id === 'pie3d') {
      const count = Array.isArray(built.data) ? built.data.length : 0;
      for (let k = 0; k < count; k++) {
        const el = this.itemElement(si, k) as unknown as Opt | null;
        if (!el) continue;
        this.raise(el, false);
        settle(el);
      }
    }
    // Flat pie: nothing to undo here — leaving the emphasis/blur state brings the slices home.
    if (immediate) return;
    const center = (this.last?.option.series as Opt[] | undefined)?.find((s) => s.id === '__center');
    if (center && this.chart) this.chart.setOption({ series: [{ id: '__center', data: center.data, label: { formatter: center.label.formatter } }] }, { lazyUpdate: true });
  }

  /** Elements currently drifting, with the rest pose each one settles back to. */
  private drifting = new Map<DriftTarget, { x: number; y: number }>();
  private focused: DriftTarget | null = null;

  private startDrift(): void {
    if (this.drifting.size || !this.chart) return;
    const series = (this.last?.option.series as Opt[] | undefined) ?? [];
    let k = 0;
    series.forEach((s, si) => {
      if (!s.breathe || !BREATHING_SERIES(s.id)) return;
      const count = Array.isArray(s.data) ? s.data.length : 0;
      for (let di = 0; di < count; di++) {
        const el = this.itemElement(si, di);
        if (el) this.drifting.set(el, driftStart(el, k++));
      }
    });
  }

  /** `animate`: glide back (pointer left); otherwise just drop references (elements re-rendered). */
  private settleDrift(animate: boolean): void {
    if (animate) this.drifting.forEach((rest, el) => driftSettle(el, rest));
    this.drifting.clear();
    this.focused = null;
  }

  /** The rendered element of one data item (custom series root). Internal ECharts API, guarded. */
  private itemElement(seriesIndex: number, dataIndex: number): DriftTarget | null {
    try {
      const model = (this.chart as unknown as { getModel(): Opt }).getModel();
      const el = model.getSeriesByIndex(seriesIndex)?.getData()?.getItemGraphicEl(dataIndex);
      return el && typeof el.animate === 'function' ? (el as DriftTarget) : null;
    } catch {
      return null;
    }
  }

  private emit(e: AdapterEvent) {
    this.listeners.forEach((l) => l(e));
  }

  /** B — the value of one mark, counted up next to it (pie: the callout). Hover and auto-tour. */
  private showItemValue(p: Opt): void {
    if (p.componentType !== 'series' || p.seriesType === 'line') return; // lines: see updateAxisPointer
    const id = String(p.seriesId ?? '');
    if (id.startsWith('fx:') || p.seriesName === '__center' || EChartsAdapter.VALUE_SKIP.has(p.seriesType)) return;
    if (id.startsWith('gauge:') && p.dataIndex !== 0) return; // a ring's empty remainder is not a value
    const all = (this.last?.option.series as Opt[] | undefined) ?? [];
    const built = all[p.seriesIndex];
    if (built?.label?.show === true && (p.seriesType === 'bar' || p.seriesType === 'scatter')) return; // already labelled
    if ((id === 'pie' || id === 'pie3d') && all.some((s) => s.id === '__center')) return; // donut centre counts instead
    const value = this.pickValue(p);
    if ((id === 'pie' || id === 'pie3d') && value != null) { this.showPieCallout(p, built, value); return; }
    const at = value == null ? null : this.anchorFor(p, built);
    if (value == null || !at) return;
    this.showValue(`${p.seriesIndex}:${p.dataIndex}`, at, value, typeof p.color === 'string' ? p.color : this.ctx?.theme.tokens.accentCyan ?? '#fff');
  }

  /** E/G — pie: pop the slice out, recede the rest, swap the donut centre readout. Hover and auto-tour. */
  private focusPieItem(p: Opt): void {
    if (p.componentType !== 'series' || (p.seriesId !== 'pie' && p.seriesId !== 'pie3d')) return;
    this.focusSlice(p.seriesIndex, p.dataIndex, p.name, Number(p.value));
  }

  // ── Auto-tour (wall displays) ──────────────────────────────────────────
  private tourTimer: ReturnType<typeof setTimeout> | null = null;
  private tourAt = -1;
  private tourOn: { si: number; di: number } | null = null;

  /** Start, keep or stop the auto-tour to match the current option (`__tour`). */
  private syncTour(): void {
    const tour = (this.last?.option as Opt | undefined)?.__tour as { intervalMs: number } | undefined;
    if (!tour) { this.stopTour(); return; }
    if (!this.tourTimer) this.tourTimer = setTimeout(() => this.tourStep(), tour.intervalMs);
  }

  private stopTour(): void {
    if (this.tourTimer) { clearTimeout(this.tourTimer); this.tourTimer = null; }
    this.tourLeave();
  }

  /** Undo the previous stop's highlight, tooltip and on-chart value. */
  private tourLeave(): void {
    const chart = this.chart, at = this.tourOn;
    this.tourOn = null;
    if (!chart || !at) return;
    chart.dispatchAction({ type: 'downplay', seriesIndex: at.si, dataIndex: at.di });
    chart.dispatchAction({ type: 'hideTip' });
    this.hideValue();
    this.releaseSlice();
  }

  /**
   * The marks the tour visits, in order: every item of the first data series (gauge rings: one
   * stop per ring). Effect overlays and the donut centre are skipped.
   */
  private tourStops(): { si: number; di: number }[] {
    const series = (this.last?.option.series as Opt[] | undefined) ?? [];
    const stops: { si: number; di: number }[] = [];
    series.forEach((s, si) => {
      const id = String(s.id ?? '');
      if (id.startsWith('gauge:') && !this.hidden.has(String(s.name))) stops.push({ si, di: 0 });
    });
    if (stops.length) return stops;
    const si = series.findIndex((s) => {
      const id = String(s.id ?? '');
      return !id.startsWith('fx:') && id !== '__center' && !(id === 'pie' && series.some((x) => x.id === 'pie3d')) && !this.hidden.has(String(s.name));
    });
    if (si < 0) return [];
    const count = Array.isArray(series[si]!.data) ? series[si]!.data.length : 0;
    for (let di = 0; di < Math.min(count, 60); di++) stops.push({ si, di });
    return stops;
  }

  /**
   * One tour stop: highlight the next mark and show what hovering it shows — the tooltip, the
   * counted-up value or pie callout, the slice pop-out. Waits while someone is pointing at the chart.
   */
  private tourStep(): void {
    this.tourTimer = null;
    const chart = this.chart;
    const tour = (this.last?.option as Opt | undefined)?.__tour as { intervalMs: number } | undefined;
    if (!chart || !tour) return;
    const next = () => { this.tourTimer = setTimeout(() => this.tourStep(), tour.intervalMs); };
    if (this.pointerInside || this.shiftTimer || this.entranceEnds > performance.now()) { this.tourLeave(); next(); return; }
    const stops = this.tourStops();
    if (!stops.length) { next(); return; }
    this.tourLeave();
    this.tourAt = (this.tourAt + 1) % stops.length;
    const { si, di } = stops[this.tourAt]!;
    let model: Opt, data: Opt;
    try {
      model = (chart as unknown as { getModel(): Opt }).getModel().getSeriesByIndex(si);
      data = model.getData();
    } catch { next(); return; }
    const p: Opt = {
      componentType: 'series', seriesIndex: si, dataIndex: di, seriesId: model.id, seriesType: model.subType,
      seriesName: model.name, name: data.getName(di), value: data.getRawValue?.(di) ?? model.getRawValue?.(di),
      color: data.getItemVisual?.(di, 'style')?.fill,
    };
    if (p.value && typeof p.value === 'object' && !Array.isArray(p.value) && 'value' in p.value) p.value = p.value.value;
    this.tourOn = { si, di };
    chart.dispatchAction({ type: 'highlight', seriesIndex: si, dataIndex: di });
    chart.dispatchAction({ type: 'showTip', seriesIndex: si, dataIndex: di });
    this.focusPieItem(p);
    this.showItemValue(p);
    next();
  }

  private bindEvents() {
    const chart = this.chart!;
    chart.on('click', (raw: unknown) => {
      const p = raw as Opt;
      if (p.componentType !== 'series' || p.seriesName === '__center') return;
      if (p.seriesType === 'treemap' || (p.seriesType === 'sunburst' && this.last?.nodeRows)) {
        const id = p.data?.id as string | undefined;
        const rows = id ? this.last?.nodeRows?.get(id) : undefined;
        this.emit({ type: 'point.click', name: p.name, value: p.value, rows, row: rows?.[0], path: pathFromInfo(p.treePathInfo) });
        return;
      }
      const hit = this.last?.lookup(p.seriesIndex, p.dataIndex);
      if (this.ctx?.definition.type === 'gauge-group' && !hit) return;
      this.emit({ type: 'point.click', seriesName: hit?.name ?? p.seriesName, name: p.name, value: hit?.value ?? p.value, row: hit?.row, rows: hit?.rows });
    });
    // Organic forms (bubbles, words): hovering an item sets the whole cloud drifting softly and
    // swells the hovered one; leaving the chart lets everything settle back.
    chart.on('mouseover', (raw: unknown) => {
      const p = raw as Opt;
      if (p.componentType !== 'series' || !BREATHING_SERIES(p.seriesId)) return;
      const built = (this.last?.option.series as Opt[] | undefined)?.[p.seriesIndex];
      if (!built?.breathe) return;
      this.startDrift();
      const el = this.itemElement(p.seriesIndex, p.dataIndex);
      if (el && el !== this.focused) {
        if (this.focused) focusOut(this.focused);
        this.focused = el;
        focusIn(el);
      }
    });
    chart.on('mouseout', (raw: unknown) => {
      const p = raw as Opt;
      if (!BREATHING_SERIES(p.seriesId) || !this.focused) return;
      focusOut(this.focused);
      this.focused = null;
    });
    chart.on('globalout', () => { this.settleDrift(true); this.clearHover(true); });
    // B — on every chart: the hovered mark's value counts up next to it.
    chart.on('mouseover', (raw: unknown) => this.showItemValue(raw as Opt));
    chart.on('mouseout', (raw: unknown) => {
      if ((raw as Opt).seriesType !== 'line') this.hideValue();
    });
    // Lines/areas trigger by axis: follow the crosshair and show the series nearest the pointer.
    chart.getZr().on('mousemove', (e: { offsetY?: number }) => { this.pointerY = e.offsetY ?? this.pointerY; this.pointerInside = true; });
    // The one-by-one loop waits while someone is reading the chart.
    chart.getZr().on('globalout', () => { this.pointerInside = false; });
    chart.on('updateAxisPointer', (raw: unknown) => {
      const info = ((raw as Opt).axesInfo as Opt[] | undefined)?.[0];
      const hasLine = ((this.last?.option.series as Opt[] | undefined) ?? []).some((s) => s.type === 'line' && !String(s.id ?? '').startsWith('fx:'));
      if (!hasLine) return;
      // Category x: the axis value is the data index. Real time: map the sequence number back.
      const rt = this.last?.option.__realtime as { xIndexOf(x: number): number | undefined } | undefined;
      const index = typeof info?.value !== 'number' ? undefined
        : rt ? rt.xIndexOf(info.value)
        : (this.last?.option.xAxis as Opt | undefined)?.type === 'category' ? info.value : undefined;
      if (index == null) { if (this.valueText?.key.startsWith('line:')) this.hideValue(); return; }
      this.lineValueAt(index);
    });
    // E/G — pie: pop the hovered slice out, recede the rest, swap the donut centre readout.
    // Flat pie's pop/recede is carried by sector states, (re)installed after every render.
    chart.on('rendered', () => this.installPieStates());
    chart.on('mouseover', (raw: unknown) => this.focusPieItem(raw as Opt));
    chart.on('mouseout', (raw: unknown) => {
      const p = raw as Opt;
      if (p.seriesId === 'pie' || p.seriesId === 'pie3d') this.releaseSlice();
    });
    chart.on('legendselectchanged', (raw: unknown) => {
      const p = raw as Opt;
      const selected = { ...(p.selected as Record<string, boolean>) };
      this.hidden.clear();
      for (const [name, on] of Object.entries(selected)) if (!on) this.hidden.add(name);
      // Redraw with the filter applied: totals, ring/bubble layouts and effects follow the legend.
      if (this.ctx) this.render(this.ctx, false, true);
      this.emit({ type: 'legend.toggle', name: p.name, selected });
    });
    chart.on('datazoom', () => {
      const dz = (chart.getOption() as Opt).dataZoom?.[0];
      if (dz) this.emit({ type: 'zoom.change', range: { start: dz.start, end: dz.end } });
    });
    const onDrill = (raw: unknown) => this.emit({ type: 'drill.change', path: pathFromNode((raw as Opt).targetNode) });
    chart.on('treemapzoomtonode', onDrill);
    chart.on('treemaproottonode', onDrill);
  }
}

function pathFromInfo(info: unknown): string[] {
  return Array.isArray(info) ? info.slice(1).map((n: { name?: unknown }) => String(n?.name ?? '')) : [];
}

/** Walk TreeNode.parentNode defensively (internal ECharts structure). */
function pathFromNode(node: unknown): string[] {
  const path: string[] = [];
  let n = node as { name?: unknown; parentNode?: unknown; depth?: number } | null;
  for (let guard = 0; n && guard < 32; guard++) {
    if (n.parentNode) path.unshift(String(n.name ?? ''));
    n = n.parentNode as typeof n;
  }
  return path;
}

export function installEChartsAdapter(): void {
  registerAdapter('echarts', (renderer) => new EChartsAdapter(renderer));
}

export { ECHARTS_VERSION } from './runtime';
