/**
 * CODVIL Chart Library — public chart definition model (schema v1).
 *
 * This module is framework- and engine-agnostic. It must never import Vue or ECharts
 * (enforced by tests/boundaries.test.ts).
 */

export const SCHEMA_VERSION = '1.0.0' as const;

/** The 22 MVP component types + new content types. Stable identifiers — never rename, only deprecate + migrate. */
export type ChartType =
  | 'kpi'
  | 'line'
  | 'area'
  | 'bar'
  | 'stacked-bar'
  | 'column'
  | 'pie'
  | 'donut'
  | 'gauge'
  | 'scatter'
  | 'heatmap'
  | 'treemap'
  | 'radar'
  | 'bubble'
  | 'word-cloud'
  | 'polar-pie'
  | 'gauge-group'
  | 'candlestick'
  | 'boxplot'
  | 'funnel'
  | 'sankey'
  | 'sunburst'
  | 'table'
  | 'country-table'
  | 'process-table'
  | 'label-table'
  | 'news-table'
  | 'dash-table'
  | 'circle-progress'
  | 'label-v1'
  | 'label-v2'
  | 'label-v3'
  | 'label-v4'
  | 'label-v5'
  | 'label-v6'
  | 'label-v7'
  | 'label-v8'
  | 'label-v9'
  | 'label-v10'
  | 'multi-label'
  | 'label-v11'
  | 'label-v12'
  | 'label-v13'
  | 'label-v14'
  | 'label-v15'
  | 'label-v16'
  | 'label-v17'
  | 'label-v18'
  | 'alert-level'
  | 'alert-level-v2'
  | 'alert-level-v3'
  | 'status-list'
  | 'status-grid'
  | 'text'
  | 'progress';

export type EngineId = 'echarts' | 'native';
export type EngineChoice = EngineId | 'auto';
export type RendererChoice = 'canvas' | 'svg';

export type FieldType = 'string' | 'number' | 'time' | 'boolean';
export type FieldRole = 'category' | 'measure' | 'time' | 'dimension';
export type ValueFormat = 'number' | 'compact' | 'percent' | 'bytes' | 'duration' | 'integer';

export interface FieldDef {
  name: string;
  type: FieldType;
  role?: FieldRole;
  /** Human label for axes, tooltips, table headers. Defaults to `name`. */
  label?: string;
  /** Unit suffix shown after formatted values (e.g. "ms", "events"). */
  unit?: string;
  format?: ValueFormat;
  /** Fraction digits for number/percent formats. */
  precision?: number;
}

export type Row = Record<string, unknown>;

export interface DataSpec {
  format?: 'rows';
  fields: FieldDef[];
  /** Inline static rows. Runtime `data` (prop / handle.update) takes precedence. */
  rows?: Row[];
  /** Hard client-side cap — rows beyond this are dropped (newest kept) and reported. */
  maxRows?: number;
}

/** Server-mediated data sources only. Arbitrary URLs are rejected by the validator (SSRF guard). */
export type DataSourceSpec =
  | { kind: 'static' }
  | {
      kind: 'rest';
      endpointId: string;
      params?: Record<string, string | number | boolean>;
      refresh?: { mode: 'none' } | { mode: 'poll'; intervalMs: number };
    }
  | {
      kind: 'stream';
      endpointId: string;
      params?: Record<string, string | number | boolean>;
      transport?: 'sse' | 'websocket';
      /** Sliding window: keep only the newest N rows. */
      windowSize?: number;
      /** Minimum ms between renders while a burst is arriving (coalescing). */
      flushIntervalMs?: number;
    };

export interface Encoding {
  x?: string;
  /** One measure or several measures; candlestick requires [open, close, low, high]. */
  y?: string | string[];
  /** Series / colour grouping field in long format. */
  color?: string;
  size?: string;
  category?: string;
  value?: string;
  /** Hierarchy path for treemap, outer → inner. */
  path?: string[];
  label?: string;
  /** Previous / comparison value (KPI delta). */
  compare?: string;
  /** Status list fields. */
  title?: string;
  severity?: string;
  time?: string;
  description?: string;
  /** KPI / table sparkline trend values. */
  trend?: string;
}

export type StatusLevel = 'ok' | 'info' | 'warning' | 'critical';

export interface Threshold {
  value: number;
  label?: string;
  status?: StatusLevel;
}

export interface ChartOptions {
  orientation?: 'vertical' | 'horizontal';
  stack?: 'none' | 'stacked' | 'percent';
  smooth?: boolean;
  showPoints?: boolean;
  /**
   * Line/area: the range navigator under the chart (slider + ctrl-wheel/drag zoom), like the
   * live latency chart. `true`/`false` switches it explicitly; unset falls back to the `zoom` interaction.
   */
  zoom?: boolean;
  /**
   * Line/area: real-time append. Each update that adds newer x values slides the lines left,
   * draws the new segment in at the right edge and pulses the newest point; points older than
   * the window drop off the left. `true` keeps every x it is given; `{ windowSize }` keeps only
   * the newest N x values (useful with `appendData`). Feed it by passing new data (contentsData
   * or rows) or by `appendData` on the chart handle.
   */
  realtime?: boolean | { windowSize?: number };
  /**
   * Line/area entrance: 'together' (default) draws every line at once, slightly staggered;
   * 'one-by-one' draws the lines one after another, each finishing before the next starts.
   */
  drawOrder?: 'together' | 'one-by-one';
  /**
   * Wall displays: every `intervalMs` (default 3000) the chart highlights its next mark and shows
   * what hovering it would — tooltip, counted-up value, pie callout. Pauses while the pointer is
   * on the chart. Chart engine types only.
   */
  autoTour?: boolean | { intervalMs?: number };
  /**
   * Live data delay: after this long without new data the panel shows "데이터 지연" and the
   * newest-point marker greys out. Unset = automatic for live charts (stream, polling REST,
   * `realtime`): 3× the observed update interval, at least 5 s; polling REST: 2.5× its interval.
   * `false` turns the indicator off.
   */
  staleAfterMs?: number | false;
  /**
   * Panel alarm: when the latest value crosses `thresholds`, the whole panel frame glows in the
   * status colour (critical pulses). Default on whenever `thresholds` are set.
   */
  alarm?: boolean;
  /**
   * Horizontal bar (one series): Top-N ranking. Bars stay sorted by value and swap places with
   * an animation when the order changes (bar race); `top` rows are shown (default 10).
   */
  ranking?: boolean | { top?: number };
  /**
   * Heatmap: 'week-hour' — rows are bucketed by the timestamp in `encoding.x` into a fixed
   * 7 days (월–일) × 24 hours grid, summing `encoding.value` (y is derived, not needed).
   */
  pattern?: 'week-hour';
  legend?: boolean | 'top' | 'bottom' | 'right';
  /** Value labels on marks. 'auto' = only where they fit / are selective. */
  labels?: boolean | 'auto';
  /** Reference lines (line/area/bar/column/scatter) or bands (gauge/progress). */
  thresholds?: Threshold[];
  min?: number;
  max?: number;
  /** Donut / gauge centre text. */
  centerLabel?: string;
  /** Show the aggregate in the donut hole. */
  showTotal?: boolean;
  /** Line/scatter: maximum rendered points per series (LTTB sampling beyond). */
  maxPoints?: number;
  /** Table */
  pageSize?: number;
  sortable?: boolean;
  /** Text card (restricted markdown — no HTML). */
  content?: string;
  /** Text shown when there is no data. */
  emptyMessage?: string;
  /** KPI: whether an increase is good ('up') or bad ('down'). */
  goodDirection?: 'up' | 'down';
  /** Accessible fill patterns (decals) for colour-vision-deficient users / print. */
  patterns?: boolean;
  /** Treemap: allow drill-down by click. */
  drilldown?: boolean;
}

export type ThemeTokenName =
  | 'bgCanvas' | 'bgSurface' | 'bgElevated' | 'bgHover' | 'borderSubtle'
  | 'textPrimary' | 'textSecondary' | 'textMuted'
  | 'accentCyan' | 'accentBlue' | 'accentViolet'
  | 'success' | 'warning' | 'danger' | 'info' | 'focus'
  | 'axisLine' | 'gridLine' | 'tooltipBg' | 'tooltipBorder' | 'selection' | 'disabled';

export interface ThemeSpec {
  name?: string;
  /** Colour mode. Matches COD-M `appTheme`: "black" → dark (dashboards, always), "white" → light (settings group). Default dark. */
  mode?: 'dark' | 'light';
  overrides?: Partial<Record<ThemeTokenName, string>>;
  /** Replace the categorical palette (validated hex list). */
  palette?: string[];
  /**
   * CODVIL effects. gradient/glow are on by default (turn off for print or low-power displays).
   * depth (default off) renders every chart in a 3D style: extruded bars, thick pies, raised marks.
   */
  effects?: { gradient?: boolean; glow?: boolean; depth?: boolean };
}

export type AnimationPreset = 'entrance' | 'smooth-update' | 'emphasis' | 'none';

export interface AnimationSpec {
  enabled?: boolean;
  preset?: AnimationPreset;
  durationMs?: number;
}

export type InteractionName = 'tooltip' | 'selection' | 'zoom' | 'legend-toggle' | 'drilldown';

export type ChartEventName =
  | 'ready'
  | 'point.click'
  | 'legend.toggle'
  | 'zoom.change'
  | 'drill.change'
  | 'row.click'
  | 'item.select'
  | 'state.change'
  | 'data.error'
  | 'render.error';

/** Declarative, allow-listed action binding. No code is ever executed from a definition. */
export interface EventAction {
  action: 'filter-dashboard' | 'navigate' | 'emit';
  field?: string;
  /** For `navigate`: an allow-listed route id resolved by the host app, never a URL. */
  routeId?: string;
}

export interface ChartDefinition {
  schemaVersion: string;
  id: string;
  type: ChartType;
  title?: string;
  description?: string;
  engine?: EngineChoice;
  renderer?: RendererChoice;
  layout?: { width?: string | number; height?: number; minHeight?: number };
  dataSource?: DataSourceSpec;
  data: DataSpec;
  encoding?: Encoding;
  options?: ChartOptions;
  theme?: ThemeSpec;
  animation?: AnimationSpec;
  interactions?: InteractionName[];
  events?: Partial<Record<ChartEventName, EventAction>>;
  locale?: string;
  /**
   * Native escape hatch. Deep-merged last onto the generated engine option after
   * security sanitisation (no functions, no HTML formatters, no external links/images).
   */
  engineOptions?: { echarts?: Record<string, unknown> };
  /** Free-form host metadata. Preserved on round-trip, never interpreted. */
  extensions?: Record<string, unknown>;
}

// ── Runtime ────────────────────────────────────────────────────────────────

export type ChartStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ChartState {
  status: ChartStatus;
  /** Safe, user-presentable message. */
  message?: string;
  /** Opaque id for support/tracing. Never contains secrets. */
  correlationId?: string;
  /** Non-fatal notices (rows dropped, sampled, invalid values…). */
  warnings: string[];
  /** Live data has stopped arriving for longer than expected (see `options.staleAfterMs`). */
  stale?: boolean;
  /** When data last arrived (epoch ms). */
  lastUpdateAt?: number;
}

export interface ChartEventPayload {
  type: ChartEventName;
  chartId: string;
  /** Original source row(s) behind the interacted mark, when resolvable. */
  row?: Row;
  rows?: Row[];
  seriesName?: string;
  name?: string;
  value?: unknown;
  /** Legend selection map after toggle. */
  selected?: Record<string, boolean>;
  /** Zoom window as percentages. */
  range?: { start: number; end: number };
  /** Treemap drill path. */
  path?: string[];
  state?: ChartState;
  error?: { code: string; message: string };
  /** Resolved declarative action from definition.events, if any. */
  action?: EventAction;
}

export type ChartEventHandler = (payload: ChartEventPayload) => void;

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** The migrated + defaulted definition when valid. */
  definition?: ChartDefinition;
}
