import { describe, expect, it } from 'vitest';
import { validateChartDefinition } from '../../src/core/schema';
import { contentsDefinitions } from '../../playground/contents-fixtures';

const byId = (id: string) => contentsDefinitions.find(d => d.id === id)!;

describe('COD-PRO Contents Data', () => {
  it.each(contentsDefinitions)('$id validates and converts without mutating its input', (input) => {
    const before = structuredClone(input);
    const result = validateChartDefinition(input);
    expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(result.definition?.data.rows?.length).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });

  it('maps all cartesian variants to the same category, series and value format', () => {
    const types = ['contents-line', 'contents-area', 'contents-bar', 'contents-column', 'contents-point'];
    const definitions = types.map(id => validateChartDefinition(byId(id)).definition!);
    for (const def of definitions) {
      expect(def.encoding).toEqual({ x: 'category', y: 'value', color: 'series' });
      expect(def.data.rows).toHaveLength(10);
      expect(def.data.rows?.[0]).toEqual({ category: '17:00', series: 'INBOUND BPS', value: 142 });
      expect(def.theme?.palette).toEqual(['#4D8DFF', '#36D6F5']);
    }
  });

  it('maps all gauge entries instead of just the final one', () => {
    const def = validateChartDefinition(byId('contents-gauge')).definition!;
    expect(def.type).toBe('gauge-group');
    expect(def.data.rows).toHaveLength(5);
    expect(def.data.rows?.map(r => r.value)).toEqual([11, 32, 45, 17, 65]);
  });

  it('rejects invalid effective gauge group ranges', () => {
    const def = byId('contents-gauge');
    for (const options of [{ min: 100 }, { max: 0 }, { min: 10, max: 10 }, { min: Number.NaN }, { max: '100' }, { min: -1e308, max: 1e308 }]) {
      expect(validateChartDefinition({ ...def, options }).valid).toBe(false);
    }
    expect(validateChartDefinition({ ...def, options: { min: 10, max: 200 } }).valid).toBe(true);
  });

  it('rejects invalid indices, unsafe colors and mismatched bubble values', () => {
    const line = byId('contents-line');
    const input = { ...line, contentsData: { timesArr: ['one'], data: [{ key: 's', values: [{ x: 1, y: 1 }] }] } };
    expect(validateChartDefinition(input).issues[0]).toMatchObject({ path: 'contentsData.data[0].values[0].x', code: 'contents-data' });
    expect(validateChartDefinition({ ...input, contentsData: { timesArr: ['one'], data: [{ key: 's', color: 'url(javascript:1)', values: [] }] } }).valid).toBe(false);
    const bubble = byId('contents-bubble');
    expect(validateChartDefinition({ ...bubble, contentsData: [{ categories: ['A'], data: [{ name: ['one'], value: [] }] }] }).valid).toBe(false);
  });

  it('rejects missing parents, duplicate ids and cycles in polar data', () => {
    const def = byId('contents-polar');
    for (const contentsData of [
      [{ id: 'a', parent: 'missing', name: 'A', value: 1 }],
      [{ id: 'a', parent: '', name: 'A', value: 1 }, { id: 'a', parent: '', name: 'B', value: 1 }],
      [{ id: 'a', parent: 'b', name: 'A', value: 1 }, { id: 'b', parent: 'a', name: 'B', value: 1 }],
    ]) expect(validateChartDefinition({ ...def, contentsData }).valid).toBe(false);
  });

  it('rejects conflicting row and Contents data', () => {
    expect(validateChartDefinition({ ...byId('contents-pie'), data: { fields: [] } }).issues[0]).toMatchObject({ path: 'contentsData', code: 'conflict' });
  });
});
