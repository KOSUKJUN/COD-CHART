import type { FieldDef, Row } from './types';

export interface NormalizeResult {
  rows: Row[];
  warnings: string[];
  /** Count of cells that could not be coerced to their declared type (set to null). */
  invalidCells: number;
}

export const DEFAULT_MAX_ROWS = 50_000;

/**
 * Validate & coerce raw rows against field definitions.
 *  - number: numeric strings are parsed; NaN/Infinity/garbage → null (counted)
 *  - time: ISO-8601 strings / epoch numbers / Date → epoch ms; unparsable → null
 *  - string: stringified; null/undefined kept as null
 * The input array is never mutated. Unknown fields are preserved untouched.
 */
export function normalizeRows(input: unknown, fields: FieldDef[], maxRows = DEFAULT_MAX_ROWS): NormalizeResult {
  const warnings: string[] = [];
  if (input === undefined || input === null) return { rows: [], warnings, invalidCells: 0 };
  if (!Array.isArray(input)) {
    return { rows: [], warnings: ['데이터 형식이 올바르지 않습니다 (rows 배열이 아님).'], invalidCells: 0 };
  }
  let source = input as unknown[];
  if (source.length > maxRows) {
    warnings.push(`행 ${source.length.toLocaleString()}개 중 최근 ${maxRows.toLocaleString()}개만 표시합니다.`);
    source = source.slice(source.length - maxRows);
  }
  let invalidCells = 0;
  const rows: Row[] = [];
  for (const raw of source) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      invalidCells++;
      continue;
    }
    const src = raw as Row;
    const out: Row = { ...src };
    for (const f of fields) {
      const v = src[f.name];
      if (v === undefined || v === null || v === '') {
        out[f.name] = null;
        continue;
      }
      const coerced = coerce(v, f.type);
      if (coerced === INVALID) {
        out[f.name] = null;
        invalidCells++;
      } else out[f.name] = coerced;
    }
    rows.push(out);
  }
  if (invalidCells > 0) warnings.push(`유효하지 않은 값 ${invalidCells}개를 빈 값으로 처리했습니다.`);
  return { rows, warnings, invalidCells };
}

const INVALID = Symbol('invalid');

function coerce(v: unknown, type: FieldDef['type']): unknown {
  switch (type) {
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
      return Number.isFinite(n) ? n : INVALID;
    }
    case 'time': {
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? INVALID : v.getTime();
      if (typeof v === 'number') return Number.isFinite(v) ? v : INVALID;
      if (typeof v === 'string') {
        const t = Date.parse(v);
        return Number.isNaN(t) ? INVALID : t;
      }
      return INVALID;
    }
    case 'boolean':
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === 1) return true;
      if (v === 'false' || v === 0) return false;
      return INVALID;
    default:
      return typeof v === 'object' ? INVALID : String(v);
  }
}

export function fieldMap(fields: FieldDef[]): Map<string, FieldDef> {
  return new Map(fields.map((f) => [f.name, f]));
}

/** Distinct values in first-seen order (stable category / series ordering). */
export function distinct(rows: Row[], field: string): unknown[] {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  for (const r of rows) {
    const v = r[field];
    if (v === null || v === undefined) continue;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function sum(rows: Row[], field: string): number {
  let s = 0;
  for (const r of rows) {
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) s += v;
  }
  return s;
}

export function numericExtent(rows: Row[], field: string): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const v = r[field];
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min === Infinity ? null : [min, max];
}

/**
 * Largest-Triangle-Three-Buckets downsampling. Preserves visual shape and extremes
 * far better than stride sampling. Returns indices into the input.
 */
export function lttbIndices(xs: number[], ys: number[], threshold: number): number[] {
  const n = xs.length;
  if (threshold >= n || threshold < 3) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [0];
  const bucket = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor((i + 1) * bucket) + 1;
    const end = Math.min(Math.floor((i + 2) * bucket) + 1, n);
    let avgX = 0;
    let avgY = 0;
    for (let j = start; j < end; j++) {
      avgX += xs[j]!;
      avgY += ys[j]!;
    }
    const len = Math.max(end - start, 1);
    avgX /= len;
    avgY /= len;
    const rStart = Math.floor(i * bucket) + 1;
    const rEnd = Math.floor((i + 1) * bucket) + 1;
    let maxArea = -1;
    let next = rStart;
    for (let j = rStart; j < rEnd; j++) {
      const area = Math.abs((xs[a]! - avgX) * (ys[j]! - ys[a]!) - (xs[a]! - xs[j]!) * (avgY - ys[a]!));
      if (area > maxArea) {
        maxArea = area;
        next = j;
      }
    }
    out.push(next);
    a = next;
  }
  out.push(n - 1);
  return out;
}
