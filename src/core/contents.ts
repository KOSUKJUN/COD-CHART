import { isPlainObject } from './sanitize';
import { isSafeColor, CYBER_NEON_PALETTE } from './theme';
import type { ChartDefinition, ChartType, DataSpec, Encoding, Row } from './types';

export interface CartesianContentsData {
  timesArr: string[];
  data: { key: string; color?: string; values: { x: number; y: number | string }[] }[];
}
export interface RadarContentsData {
  categories: string[];
  data: { name: string; data: (number | string)[]; pointPlacement?: string }[];
}
export type ContentsChartDefinition = Omit<ChartDefinition, 'type' | 'data' | 'encoding' | 'dataSource'> & (
  | { type: 'line' | 'area' | 'bar' | 'column' | 'stacked-bar'; contentsData: CartesianContentsData }
  | { type: 'pie' | 'donut' | 'gauge' | 'gauge-group'; contentsData: { col0: string; col1: number | string }[] }
  | { type: 'radar'; contentsData: RadarContentsData }
  | { type: 'bubble'; contentsData: { categories: string[]; data: { name: string[]; value: (number | string)[] }[] }[] }
  | { type: 'word-cloud'; contentsData: { name: string; weight: number | string }[] }
  | { type: 'polar-pie'; contentsData: { id: string; parent: string; name: string; value: number | string }[] }
);
export type ContentsChartType = ContentsChartDefinition['type'];

export class ContentsDataError extends Error {
  constructor(public readonly path: string, message: string) {
    super(message);
    this.name = 'ContentsDataError';
  }
}

function fail(path: string, message: string): never {
  throw new ContentsDataError(`contentsData${path}`, message);
}
function object(v: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(v)) fail(path, '객체가 필요합니다.');
  return v;
}
function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '배열이 필요합니다.');
  return v;
}
function text(v: unknown, path: string): string {
  if (typeof v !== 'string' || !v.trim()) fail(path, '비어 있지 않은 문자열이 필요합니다.');
  return v;
}
function number(v: unknown, path: string): number {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) fail(path, '유효한 숫자가 필요합니다.');
  return n;
}
function fields(...items: [string, 'string' | 'number'][]): DataSpec['fields'] {
  return items.map(([name, type]) => ({ name, type }));
}

/** Converts the documented COD-PRO payload to the existing rows/encoding model. */
export function convertContentsData(type: ChartType, input: unknown): {
  type: ChartType; data: DataSpec; encoding: Encoding; palette?: string[];
} {
  let rows: Row[] = [];
  let dataFields: DataSpec['fields'];
  let encoding: Encoding;
  let resultType: ChartType = type;
  let palette: string[] | undefined;
  if (['line', 'area', 'bar', 'column', 'stacked-bar'].includes(type)) {
    const root = object(input, '');
    const times = array(root.timesArr, '.timesArr').map((v, i) => text(v, `.timesArr[${i}]`));
    const series = array(root.data, '.data');
    const colors: (string | undefined)[] = [];
    series.forEach((v, i) => {
      const s = object(v, `.data[${i}]`);
      const key = text(s.key, `.data[${i}].key`);
      if (s.color !== undefined && s.color !== '') {
        if (!isSafeColor(s.color)) fail(`.data[${i}].color`, '안전한 색상 리터럴이 필요합니다.');
        colors.push(s.color as string);
      } else colors.push(undefined);
      array(s.values, `.data[${i}].values`).forEach((value, j) => {
        const point = object(value, `.data[${i}].values[${j}]`);
        if (typeof point.x !== 'number' || !Number.isInteger(point.x) || point.x < 0 || point.x >= times.length) fail(`.data[${i}].values[${j}].x`, 'timesArr의 유효한 인덱스가 필요합니다.');
        rows.push({ category: times[point.x], series: key, value: number(point.y, `.data[${i}].values[${j}].y`) });
      });
    });
    if (colors.some(Boolean)) {
      if (colors.length > 12) fail('.data', '색상 지정 시 시리즈는 12개 이하여야 합니다.');
      palette = colors.map((c, i) => c ?? CYBER_NEON_PALETTE[i % CYBER_NEON_PALETTE.length]!);
    }
    dataFields = fields(['category', 'string'], ['series', 'string'], ['value', 'number']);
    encoding = { x: 'category', y: 'value', color: 'series' };
  } else if (type === 'pie' || type === 'donut' || type === 'gauge' || type === 'gauge-group') {
    rows = array(input, '').map((v, i) => {
      const r = object(v, `[${i}]`);
      return { label: text(r.col0, `[${i}].col0`), value: number(r.col1, `[${i}].col1`) };
    });
    dataFields = fields(['label', 'string'], ['value', 'number']);
    encoding = type === 'pie' || type === 'donut' ? { category: 'label', value: 'value' } : { label: 'label', value: 'value' };
    if (type === 'gauge') resultType = 'gauge-group';
  } else if (type === 'radar') {
    const root = object(input, '');
    const categories = array(root.categories, '.categories').map((v, i) => text(v, `.categories[${i}]`));
    array(root.data, '.data').forEach((v, i) => {
      const series = object(v, `.data[${i}]`);
      const name = text(series.name, `.data[${i}].name`);
      const values = array(series.data, `.data[${i}].data`);
      if (values.length !== categories.length) fail(`.data[${i}].data`, 'categories와 값의 개수가 같아야 합니다.');
      values.forEach((value, j) => rows.push({ category: categories[j], series: name, value: number(value, `.data[${i}].data[${j}]`) }));
    });
    dataFields = fields(['category', 'string'], ['series', 'string'], ['value', 'number']);
    encoding = { category: 'category', color: 'series', value: 'value' };
  } else if (type === 'bubble') {
    const outer = array(input, '');
    if (outer.length !== 1) fail('', 'categories와 data를 가진 객체 한 개가 필요합니다.');
    const root = object(outer[0], '[0]');
    const categories = array(root.categories, '[0].categories').map((v, i) => text(v, `[0].categories[${i}]`));
    const groups = array(root.data, '[0].data');
    if (categories.length !== groups.length) fail('[0].data', 'categories와 data의 개수가 같아야 합니다.');
    groups.forEach((v, i) => {
      const group = object(v, `[0].data[${i}]`);
      const names = array(group.name, `[0].data[${i}].name`);
      const values = array(group.value, `[0].data[${i}].value`);
      if (names.length !== values.length) fail(`[0].data[${i}]`, 'name과 value의 개수가 같아야 합니다.');
      names.forEach((name, j) => rows.push({ category: categories[i], label: text(name, `[0].data[${i}].name[${j}]`), value: number(values[j], `[0].data[${i}].value[${j}]`) }));
    });
    dataFields = fields(['category', 'string'], ['label', 'string'], ['value', 'number']);
    encoding = { category: 'category', label: 'label', value: 'value' };
  } else if (type === 'word-cloud') {
    rows = array(input, '').map((v, i) => {
      const r = object(v, `[${i}]`);
      return { name: text(r.name, `[${i}].name`), weight: number(r.weight, `[${i}].weight`) };
    });
    dataFields = fields(['name', 'string'], ['weight', 'number']);
    encoding = { category: 'name', value: 'weight' };
  } else if (type === 'polar-pie') {
    rows = array(input, '').map((v, i) => {
      const r = object(v, `[${i}]`);
      if (typeof r.parent !== 'string') fail(`[${i}].parent`, '부모 ID 문자열이 필요합니다.');
      return { id: text(r.id, `[${i}].id`), parent: r.parent, name: text(r.name, `[${i}].name`), value: number(r.value, `[${i}].value`) };
    });
    const parents = new Map(rows.map(r => [r.id, r.parent]));
    if (parents.size !== rows.length) fail('', '중복된 id가 있습니다.');
    const complete = new Set<unknown>();
    for (const [i, row] of rows.entries()) {
      if ((row.value as number) < 0) fail(`[${i}].value`, '0 이상의 값이 필요합니다.');
      if (row.parent && !parents.has(row.parent)) fail(`[${i}].parent`, '존재하지 않는 부모 ID입니다.');
      const visited = new Set<unknown>();
      let id = row.id;
      while (id && !complete.has(id)) {
        if (visited.has(id)) fail(`[${i}].parent`, '순환하는 부모 관계는 사용할 수 없습니다.');
        visited.add(id);
        id = parents.get(id);
      }
      visited.forEach(id => complete.add(id));
    }
    dataFields = fields(['id', 'string'], ['parent', 'string'], ['name', 'string'], ['value', 'number']);
    encoding = { label: 'id', category: 'name', path: ['parent'], value: 'value' };
  } else {
    return fail('', `지원하지 않는 Contents 차트 유형입니다: ${type}`);
  }
  return { type: resultType, data: { fields: dataFields, rows }, encoding, ...(palette ? { palette } : {}) };
}
