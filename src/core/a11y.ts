import { distinct, fieldMap, numericExtent, sum } from './data';
import { fieldLabel, formatValue } from './format';
import { getDescriptor } from './registry';
import type { ChartDefinition, FieldDef, Row } from './types';

export interface AccessibleTable {
  caption: string;
  columns: { key: string; label: string; field?: FieldDef; numeric: boolean }[];
  rows: Row[];
  truncated: boolean;
  totalRows: number;
}

export const A11Y_TABLE_MAX_ROWS = 200;

/** Fields actually encoded by the chart, in a reading-friendly order. */
function encodedFieldNames(def: ChartDefinition): string[] {
  const e = def.encoding ?? {};
  const names = [
    ...(e.path ?? []), e.x, e.category, e.color, e.title, e.severity, e.time, e.label,
    ...(Array.isArray(e.y) ? e.y : [e.y]), e.value, e.size, e.compare, e.description,
  ].filter((n): n is string => typeof n === 'string');
  const unique = [...new Set(names)];
  return unique.length ? unique : def.data.fields.map((f) => f.name);
}

/**
 * The canvas is invisible to assistive tech, so every chart ships an equivalent
 * data table (spec §12). The table renders formatted text only.
 */
export function buildAccessibleTable(def: ChartDefinition, rows: Row[]): AccessibleTable {
  const fm = fieldMap(def.data.fields);
  const columns = encodedFieldNames(def).map((key) => {
    const field = fm.get(key);
    return { key, label: fieldLabel(field, key), field, numeric: field?.type === 'number' };
  });
  return {
    caption: def.title ?? getDescriptor(def.type)?.displayName ?? def.type,
    columns,
    rows: rows.slice(0, A11Y_TABLE_MAX_ROWS),
    truncated: rows.length > A11Y_TABLE_MAX_ROWS,
    totalRows: rows.length,
  };
}

/** One-paragraph plain-language summary used as the chart's aria-description. */
export function buildSummary(def: ChartDefinition, rows: Row[], locale = 'ko-KR'): string {
  const d = getDescriptor(def.type);
  const name = d?.displayName ?? def.type;
  const head = def.title ? `${name} 차트: ${def.title}.` : `${name} 차트.`;
  if (rows.length === 0) return `${head} 표시할 데이터가 없습니다.`;
  const fm = fieldMap(def.data.fields);
  const e = def.encoding ?? {};
  const fmt = (v: unknown, f?: string) => formatValue(v, f ? fm.get(f) : undefined, { locale });

  if (def.type === 'gauge-group') return `${head} 항목 ${rows.length}개. ${rows.slice(0, 3).map(r => `${String(r[e.label!] ?? '')} ${fmt(r[e.value!], e.value)}`).join(', ')}.`;
  if (def.type === 'bubble') return `${head} 범주 ${distinct(rows, e.category!).length}개, 항목 ${rows.length}개.`;
  if (def.type === 'polar-pie') return `${head} 계층 항목 ${rows.length}개.`;

  switch (d?.family) {
    case 'cartesian': {
      const ys = (Array.isArray(e.y) ? e.y : [e.y]).filter((y): y is string => !!y);
      const seriesCount = e.color ? distinct(rows, e.color).length : ys.length || (e.value ? 1 : 0);
      const parts = [`${head} 데이터 ${rows.length}개, 시리즈 ${seriesCount}개.`];
      for (const y of ys.slice(0, 3)) {
        const ext = numericExtent(rows, y);
        if (!ext) continue;
        const maxRow = rows.find((r) => r[y] === ext[1]);
        const at = maxRow && e.x ? ` (${fmt(maxRow[e.x], e.x)})` : '';
        parts.push(`${fieldLabel(fm.get(y), y)} 범위 ${fmt(ext[0], y)}–${fmt(ext[1], y)}, 최댓값${at}.`);
      }
      return parts.join(' ');
    }
    case 'part-to-whole': {
      if (!e.category || !e.value) return head;
      const total = sum(rows, e.value);
      const top = [...rows].sort((a, b) => (Number(b[e.value!]) || 0) - (Number(a[e.value!]) || 0)).slice(0, 3);
      const share = top.map((r) => `${String(r[e.category!])} ${total ? Math.round(((Number(r[e.value!]) || 0) / total) * 100) : 0}%`);
      return `${head} 합계 ${fmt(total, e.value)}, 항목 ${rows.length}개. 상위: ${share.join(', ')}.`;
    }
    case 'indicator': {
      const v = e.value ? rows[rows.length - 1]?.[e.value] : undefined;
      const range = def.options?.max !== undefined ? ` (범위 ${def.options.min ?? 0}–${def.options.max})` : '';
      return `${head} 현재 값 ${fmt(v, e.value)}${range}.`;
    }
    case 'matrix': {
      const ext = e.value ? numericExtent(rows, e.value) : null;
      return `${head} ${e.y ? distinct(rows, e.y as string).length : 0}행 × ${e.x ? distinct(rows, e.x).length : 0}열${ext ? `, 값 범위 ${fmt(ext[0], e.value)}–${fmt(ext[1], e.value)}` : ''}.`;
    }
    case 'hierarchy':
      return `${head} 최상위 그룹 ${e.path?.[0] ? distinct(rows, e.path[0]).length : 0}개, 합계 ${e.value ? fmt(sum(rows, e.value), e.value) : '—'}.`;
    default:
      return `${head} 항목 ${rows.length}개.`;
  }
}
