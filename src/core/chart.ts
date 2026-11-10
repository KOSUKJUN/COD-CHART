import { buildAccessibleTable, buildSummary, type AccessibleTable } from './a11y';
import { getAdapterFactory, type ExportOptions, type RendererAdapter } from './adapter';
import { prefersReducedMotion, resolveMotion } from './animation';
import { normalizeRows } from './data';
import { resolveEngine } from './registry';
import { validateChartDefinition } from './schema';
import { DataController, type DataServices, type Scheduler } from './source';
import { resolveTheme, type ResolvedTheme } from './theme';
import type {
  ChartDefinition, ChartEventHandler, ChartEventName, ChartEventPayload, ChartState, Row, ThemeSpec, ValidationIssue,
} from './types';

export interface ChartServices extends DataServices {
  locale?: string;
  /** Product-level motion preference; `false` disables all animation. */
  motion?: { enabled?: boolean };
  /** Global theme defaults (definition.theme wins). */
  theme?: ThemeSpec;
  /** Override reduced-motion detection (tests / host setting). */
  reducedMotion?: boolean;
  scheduler?: Scheduler;
}

export interface CreateChartOptions {
  /**
   * Headless: run data/state/a11y without drawing. Used by the Vue layer for native
   * DOM widgets, and by tests.
   */
  headless?: boolean;
}

export interface ChartHandle {
  readonly id: string;
  /** Replace the definition (validated; structural changes are detected) or just the rows. */
  update(next: unknown): void;
  setData(rows: Row[]): void;
  /** Append rows, keeping at most `windowSize` (newest). Coalesced to one render per frame. */
  appendData(rows: Row[], windowSize?: number): void;
  refresh(): void;
  resize(width?: number, height?: number): void;
  on(event: ChartEventName | '*', handler: ChartEventHandler): () => void;
  /** Called after every committed render (data or definition). Used by DOM widgets. */
  onRender(listener: () => void): () => void;
  getState(): ChartState;
  getRows(): Row[];
  getDefinition(): ChartDefinition | null;
  getIssues(): ValidationIssue[];
  getTheme(): ResolvedTheme;
  getSummary(): string;
  getAccessibleTable(): AccessibleTable | null;
  exportImage(options?: ExportOptions): string | null;
  isDestroyed(): boolean;
  destroy(): void;
}

/** Stable structural hash of a definition, excluding inline rows. */
export function structureKey(def: ChartDefinition): string {
  const { rows: _rows, ...data } = def.data;
  return stableStringify({ ...def, data });
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

const raf = (fn: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
};

let anonymousId = 0;

/**
 * Framework-agnostic chart runtime. Never throws for bad definitions or data —
 * the handle enters an `error` state instead, so one broken widget can't take
 * down a dashboard.
 */
export function createChart(
  container: HTMLElement | null,
  definition: unknown,
  services: ChartServices = {},
  options: CreateChartOptions = {},
): ChartHandle {
  const listeners = new Map<string, Set<ChartEventHandler>>();
  const renderListeners = new Set<() => void>();
  const cleanups: (() => void)[] = [];
  let def: ChartDefinition | null = null;
  let issues: ValidationIssue[] = [];
  let rows: Row[] = [];
  let normalizeWarnings: string[] = [];
  let state: ChartState = { status: 'idle', warnings: [] };
  let adapter: RendererAdapter | null = null;
  let mounted = false;
  let destroyed = false;
  let key = '';
  let cancelFrame: (() => void) | null = null;
  let structuralPending = false;
  let loading = false;
  let theme = resolveTheme(services.theme);
  const locale = () => def?.locale ?? services.locale ?? 'ko-KR';
  const id = (definition as { id?: unknown })?.id;
  const chartId = typeof id === 'string' ? id : `cv-chart-${++anonymousId}`;

  const emit = (type: ChartEventName, payload: Omit<ChartEventPayload, 'type' | 'chartId'> = {}) => {
    const full: ChartEventPayload = { ...payload, type, chartId, action: payload.action ?? def?.events?.[type] };
    for (const set of [listeners.get(type), listeners.get('*')]) {
      set?.forEach((h) => {
        try {
          h(full);
        } catch (e) {
          console.error(`[codvil-chart] '${type}' handler failed`, e);
        }
      });
    }
  };

  const setState = (next: Omit<ChartState, 'warnings'> & { warnings?: string[] }) => {
    const warnings = next.warnings ?? [...normalizeWarnings, ...(adapter?.warnings ?? [])];
    const changed = next.status !== state.status || next.message !== state.message || warnings.join('|') !== state.warnings.join('|');
    state = { ...next, warnings };
    if (changed) emit('state.change', { state });
  };

  /** Set by a data/definition failure; only fresh data or a valid definition clears it. */
  let failed = false;

  const fail = (code: string, message: string, correlationId?: string) => {
    loading = false;
    failed = true;
    setState({ status: 'error', message, correlationId });
    emit(code.startsWith('render') ? 'render.error' : 'data.error', { error: { code, message } });
  };

  const ingest = (raw: unknown) => {
    if (!def) return;
    const r = normalizeRows(raw, def.data.fields, def.data.maxRows);
    rows = r.rows;
    normalizeWarnings = r.warnings;
  };

  const controller = new DataController(undefined, services, {
    onRows: (incoming) => {
      loading = false;
      failed = false;
      ingest(incoming);
      schedule(false);
    },
    onLoading: () => {
      loading = true;
      setState({ status: 'loading' });
    },
    onError: (e) => fail(e.code, e.message, e.correlationId),
  }, services.scheduler);
  cleanups.push(() => controller.destroy());

  const motionEnv = () => ({
    reducedMotion: services.reducedMotion ?? prefersReducedMotion(),
    productMotionEnabled: services.motion?.enabled,
    updateIntervalMs: controller.updateIntervalMs,
  });

  const render = () => {
    cancelFrame = null;
    if (destroyed || !def) return;
    const structural = structuralPending;
    structuralPending = false;
    if (adapter && container) {
      const ctx = {
        definition: def, rows, theme, locale: locale(),
        motion: resolveMotion(def.animation, motionEnv()),
        summary: buildSummary(def, rows, locale()),
      };
      try {
        if (!mounted) {
          adapter.mount(container, ctx);
          mounted = true;
        } else adapter.update(ctx, structural);
      } catch (e) {
        console.error('[codvil-chart] render failed', e);
        fail('render-failed', '차트를 그리는 중 오류가 발생했습니다.');
        return;
      }
    }
    renderListeners.forEach((l) => l());
    if (loading || failed) return;
    const wasReady = state.status === 'ready' || state.status === 'empty';
    setState({ status: rows.length ? 'ready' : 'empty', message: rows.length ? undefined : def.options?.emptyMessage });
    if (!wasReady) emit('ready');
  };

  const schedule = (structural: boolean) => {
    if (destroyed) return;
    structuralPending ||= structural;
    if (!cancelFrame) cancelFrame = raf(render);
  };

  const apply = (input: unknown, initial: boolean) => {
    const result = validateChartDefinition(input);
    issues = result.issues;
    if (!result.valid || !result.definition) {
      const first = result.issues.find((i) => i.severity === 'error');
      fail('definition-invalid', first ? `차트 설정 오류 — ${first.path}: ${first.message}` : '차트 설정이 올바르지 않습니다.');
      return;
    }
    const next = result.definition;
    failed = false;
    const nextKey = structureKey(next);
    const structural = nextKey !== key;
    const rowsChanged = !def || def.data.rows !== next.data.rows;
    const engineChanged = !def || def.type !== next.type || def.renderer !== next.renderer;
    def = next;
    key = nextKey;
    theme = resolveTheme({ ...services.theme, ...def.theme, overrides: { ...services.theme?.overrides, ...def.theme?.overrides } });

    if (engineChanged && !options.headless) {
      adapter?.destroy();
      adapter = null;
      mounted = false;
      const { engine, renderer } = resolveEngine(def);
      if (engine !== 'native') {
        const factory = getAdapterFactory(engine);
        if (!factory) return fail('render-no-adapter', `'${engine}' 엔진 어댑터가 등록되지 않았습니다.`);
        adapter = factory(renderer ?? 'canvas');
        cleanups.push(adapter.onEvent((ev) => emit(ev.type, ev)));
      }
    }

    const kind = def.dataSource?.kind ?? 'static';
    if (kind === 'static' && rowsChanged) ingest(def.data.rows ?? []);
    controller.start(); // idempotent
    controller.setSpec(def.dataSource);
    if (structural || rowsChanged) schedule(structural);
  };

  apply(definition, true);

  // Resize: observe the container, coalesce to one resize per frame.
  if (container && typeof ResizeObserver !== 'undefined' && !options.headless) {
    let cancel: (() => void) | null = null;
    // ResizeObserver fires once on observe(); resizing then would cut the entrance
    // animation short. Only react to real size changes.
    let lastSize = `${container.clientWidth}x${container.clientHeight}`;
    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '';
      if (size === lastSize) return;
      lastSize = size;
      if (cancel) return;
      cancel = raf(() => {
        cancel = null;
        if (!destroyed && mounted) adapter?.resize();
      });
    });
    ro.observe(container);
    cleanups.push(() => {
      cancel?.();
      ro.disconnect();
    });
  }

  // Reduced-motion can change at runtime (OS setting) — re-render with new motion.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && services.reducedMotion === undefined) {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onChange = () => schedule(true);
      mq.addEventListener?.('change', onChange);
      cleanups.push(() => mq.removeEventListener?.('change', onChange));
    } catch {
      /* matchMedia unsupported */
    }
  }

  const handle: ChartHandle = {
    id: chartId,
    update(next) {
      if (destroyed) return;
      if (next && typeof next === 'object' && !('schemaVersion' in next) && Array.isArray((next as { rows?: unknown }).rows)) {
        handle.setData((next as { rows: Row[] }).rows);
        return;
      }
      apply(next, false);
    },
    setData(newRows) {
      if (destroyed || !def) return;
      ingest(newRows);
      loading = false;
      failed = false;
      schedule(false);
    },
    appendData(more, windowSize) {
      if (destroyed || !def) return;
      const extra = normalizeRows(more, def.data.fields).rows;
      const all = rows.concat(extra);
      const cap = windowSize ?? def.data.maxRows;
      rows = cap && all.length > cap ? all.slice(all.length - cap) : all;
      schedule(false);
    },
    refresh: () => !destroyed && controller.refresh(),
    resize(w, h) {
      if (!destroyed && mounted) adapter?.resize(w, h);
    },
    on(event, handler) {
      if (destroyed) return () => {};
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(handler);
      return () => set!.delete(handler);
    },
    onRender(listener) {
      renderListeners.add(listener);
      return () => renderListeners.delete(listener);
    },
    getState: () => state,
    getRows: () => rows,
    getDefinition: () => def,
    getIssues: () => issues,
    getTheme: () => theme,
    getSummary: () => (def ? buildSummary(def, rows, locale()) : ''),
    getAccessibleTable: () => (def ? buildAccessibleTable(def, rows) : null),
    exportImage: (o) => (mounted && adapter?.exportImage ? adapter.exportImage(o) : null),
    isDestroyed: () => destroyed,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelFrame?.();
      cancelFrame = null;
      for (const c of cleanups.splice(0)) {
        try {
          c();
        } catch {
          /* keep releasing */
        }
      }
      adapter?.destroy();
      adapter = null;
      listeners.clear();
      renderListeners.clear();
    },
  };
  return handle;
}
