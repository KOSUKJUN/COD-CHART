import type { FieldDef } from './types';

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export interface FormatOptions {
  locale?: string;
  /** Include the field unit suffix. Default true. */
  withUnit?: boolean;
}

/** Format a value for display according to its field definition. Always returns plain text. */
export function formatValue(value: unknown, field?: FieldDef, options: FormatOptions = {}): string {
  const locale = options.locale ?? 'ko-KR';
  if (value === null || value === undefined || value === '') return '—';
  if (field?.type === 'time') return formatTime(value, locale);
  if (typeof value !== 'number') {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }
  if (!Number.isFinite(value)) return '—';
  const p = field?.precision;
  let text: string;
  switch (field?.format) {
    case 'percent':
      // Values are ratios: 0.42 → "42%". The unit suffix is never appended.
      return nf(locale, { style: 'percent', maximumFractionDigits: p ?? 1 }).format(value);
    case 'compact':
      text = nf(locale, { notation: 'compact', maximumFractionDigits: p ?? 1 }).format(value);
      break;
    case 'integer':
      text = nf(locale, { maximumFractionDigits: 0 }).format(value);
      break;
    case 'bytes': {
      let v = Math.abs(value);
      let i = 0;
      while (v >= 1024 && i < BYTE_UNITS.length - 1) {
        v /= 1024;
        i++;
      }
      return `${value < 0 ? '-' : ''}${nf(locale, { maximumFractionDigits: p ?? 1 }).format(v)} ${BYTE_UNITS[i]}`;
    }
    case 'duration':
      return formatDuration(value);
    default:
      text = nf(locale, { maximumFractionDigits: p ?? (Math.abs(value) < 10 ? 2 : 1) }).format(value);
  }
  const unit = options.withUnit !== false && field?.unit ? field.unit : '';
  if (!unit) return text;
  return unit === '%' ? `${text}%` : `${text} ${unit}`;
}

/** Compact axis tick formatting (1.2K, 3.4M) honouring field format. */
export function formatAxisValue(value: number, field?: FieldDef, locale = 'ko-KR'): string {
  if (field?.format === 'percent') return nf(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  if (field?.format === 'bytes' || field?.format === 'duration') return formatValue(value, field, { locale });
  return nf(locale, { notation: Math.abs(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 1000) return `${Math.round(ms)} ms`;
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (abs < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((abs % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.round((abs % 3_600_000) / 60_000)}m`;
}

export function formatTime(value: unknown, locale = 'ko-KR'): string {
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/** Relative time for status lists ("3분 전"). */
export function formatRelativeTime(value: unknown, now = Date.now(), locale = 'ko-KR'): string {
  const t = new Date(value as string | number).getTime();
  if (Number.isNaN(t)) return String(value ?? '');
  const diff = (t - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function fieldLabel(field: FieldDef | undefined, fallback = ''): string {
  return field?.label ?? field?.name ?? fallback;
}

/** Escape text for the few places an engine renders HTML (ECharts tooltip). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
