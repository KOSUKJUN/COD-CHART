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
  overrides?: Partial<Record<ThemeTokenName, string>>;
  /** Replace the categorical palette (validated hex list). */
  palette?: string[];
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
