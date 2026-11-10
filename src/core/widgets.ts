/**
 * View-models for native (DOM) widgets. Pure functions — the Vue layer only renders them.
 */
import { fieldMap } from './data';
import { fieldLabel, formatRelativeTime, formatValue } from './format';
import { STATUS_META, statusForValue, toStatusLevel } from './theme';
import type { ChartDefinition, Row, StatusLevel } from './types';

// ── KPI ────────────────────────────────────────────────────────────────────

export interface KpiModel {
  label: string;
  value: number | null;
  valueText: string;
  unit?: string;
  delta: null | {
    abs: number;
    ratio: number | null;
    text: string;
    direction: 'up' | 'down' | 'flat';
    /** Semantic quality given `goodDirection`. */
    sentiment: 'positive' | 'negative' | 'neutral';
    srText: string;
  };
  status: StatusLevel;
  trend: number[];
}

export function buildKpiModel(def: ChartDefinition, rows: Row[], locale = 'ko-KR'): KpiModel {
  const fm = fieldMap(def.data.fields);
  const e = def.encoding ?? {};
  const vf = e.value ? fm.get(e.value) : undefined;
  const last = rows[rows.length - 1];
  const raw = e.value ? last?.[e.value] : undefined;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const label = (e.label && typeof last?.[e.label] === 'string' ? (last[e.label] as string) : undefined) ?? def.title ?? fieldLabel(vf, 'KPI');

  // Comparison: explicit compare field on the last row, else the previous row's value.
  let prev: number | null = null;
  if (e.compare && typeof last?.[e.compare] === 'number') prev = last[e.compare] as number;
  else if (e.value && rows.length > 1 && typeof rows[rows.length - 2]?.[e.value] === 'number') prev = rows[rows.length - 2]![e.value] as number;

  let delta: KpiModel['delta'] = null;
  if (value !== null && prev !== null) {
    const abs = value - prev;
    const ratio = prev !== 0 ? abs / Math.abs(prev) : null;
    const direction = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
    const good = def.options?.goodDirection ?? 'up';
    const sentiment = direction === 'flat' ? 'neutral' : direction === good ? 'positive' : 'negative';
    const pct = ratio !== null ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(ratio) : '';
    const absText = (abs > 0 ? '+' : '') + formatValue(abs, vf, { locale, withUnit: false });
    delta = {
      abs, ratio, direction, sentiment,
      text: pct || absText,
      srText: `이전 대비 ${direction === 'up' ? '증가' : direction === 'down' ? '감소' : '변화 없음'} ${absText}${pct ? ` (${pct})` : ''}`,
    };
  }

  const trend = e.trend
    ? rows.map((r) => r[e.trend!]).filter((v): v is number => typeof v === 'number')
    : e.value && rows.length > 2 ? rows.map((r) => r[e.value!]).filter((v): v is number => typeof v === 'number') : [];

  return {
    label,
    value,
    valueText: formatValue(value, vf ? { ...vf, unit: undefined } : undefined, { locale }),
    unit: vf?.format === 'percent' ? undefined : vf?.unit,
    delta,
    status: value === null ? 'info' : statusForValue(value, def.options?.thresholds),
    trend: trend.slice(-60),
  };
}

/** SVG path for a sparkline in a w×h box. */
export function sparklinePath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ── Progress / threshold ──────────────────────────────────────────────────

export interface ProgressModel {
  label: string;
  value: number | null;
  valueText: string;
  maxText: string;
  /** 0–1 fill ratio, clamped. */
  ratio: number;
  percentText: string;
  status: StatusLevel;
  markers: { ratio: number; label: string; status: StatusLevel }[];
  min: number;
  max: number;
}

export function buildProgressModel(def: ChartDefinition, rows: Row[], locale = 'ko-KR'): ProgressModel {
  const fm = fieldMap(def.data.fields);
  const e = def.encoding ?? {};
  const vf = e.value ? fm.get(e.value) : undefined;
  const last = rows[rows.length - 1];
  const raw = e.value ? last?.[e.value] : undefined;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const min = def.options?.min ?? 0;
  const max = def.options?.max ?? 100;
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const thresholds = def.options?.thresholds ?? [];
  return {
    label: (e.label && typeof last?.[e.label] === 'string' ? (last[e.label] as string) : undefined) ?? def.title ?? fieldLabel(vf, ''),
    value,
    valueText: formatValue(value, vf, { locale }),
    maxText: formatValue(max, vf, { locale }),
    ratio,
    percentText: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio),
    status: value === null ? 'info' : statusForValue(value, thresholds),
    markers: thresholds
      .filter((t) => t.value > min && t.value < max)
      .map((t) => ({ ratio: (t.value - min) / (max - min), label: t.label ?? formatValue(t.value, vf, { locale }), status: t.status ?? 'warning' })),
    min,
    max,
  };
}

// ── Status / alert list ───────────────────────────────────────────────────

export interface StatusItem {
  key: string;
  index: number;
  title: string;
  description?: string;
  level: StatusLevel;
  levelLabel: string;
  icon: string;
  timeText?: string;
  timeIso?: string;
  row: Row;
}

export function buildStatusItems(def: ChartDefinition, rows: Row[], now = Date.now(), locale = 'ko-KR'): StatusItem[] {
  const e = def.encoding ?? {};
  const items = rows.map((row, index) => {
    const level = toStatusLevel(e.severity ? row[e.severity] : undefined);
    const t = e.time ? row[e.time] : undefined;
    const ms = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : NaN;
    return {
      key: `${index}-${String(e.title ? row[e.title] : index)}`,
      index,
      title: String((e.title ? row[e.title] : undefined) ?? '(제목 없음)'),
      description: e.description && row[e.description] != null ? String(row[e.description]) : undefined,
      level,
      levelLabel: STATUS_META[level].label,
      icon: STATUS_META[level].icon,
      timeText: Number.isNaN(ms) ? undefined : formatRelativeTime(ms, now, locale),
      timeIso: Number.isNaN(ms) ? undefined : new Date(ms).toISOString(),
      row,
      _ms: Number.isNaN(ms) ? 0 : ms,
    };
  });
  // Most severe first, then newest.
  items.sort((a, b) => STATUS_META[b.level].rank - STATUS_META[a.level].rank || b._ms - a._ms);
  return items.map(({ _ms, ...rest }) => rest);
}

export function countByLevel(items: StatusItem[]): Record<StatusLevel, number> {
  const c: Record<StatusLevel, number> = { critical: 0, warning: 0, info: 0, ok: 0 };
  for (const i of items) c[i.level]++;
  return c;
}

// ── Table ──────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export function sortRows(rows: Row[], key: string | null, dir: SortDir): Row[] {
  if (!key) return rows;
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    // Nulls always last regardless of direction.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * m;
    return String(x).localeCompare(String(y), 'ko', { numeric: true }) * m;
  });
}

export function paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(1, page), pageCount);
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), page: p, pageCount };
}
