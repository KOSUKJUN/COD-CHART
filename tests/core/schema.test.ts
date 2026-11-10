import { describe, expect, it } from 'vitest';
import { CHART_TYPES, getDescriptor, resolveEngine } from '../../src/core/registry';
import { assertValidDefinition, migrateDefinition, validateChartDefinition } from '../../src/core/schema';
import { definitions, MVP_TYPES } from '../../playground/fixtures';

const base = () => ({
  schemaVersion: '1.0.0',
  id: 'c1',
  type: 'bar',
  data: { fields: [{ name: 'k', type: 'string' }, { name: 'v', type: 'number' }] },
  encoding: { x: 'k', y: 'v' },
});
const errors = (input: unknown) => validateChartDefinition(input).issues.filter((i) => i.severity === 'error');

describe('registry', () => {
  it('registers unique types including every demo type', () => {
    expect(new Set(CHART_TYPES).size).toBe(CHART_TYPES.length);
    for (const type of MVP_TYPES) expect(CHART_TYPES).toContain(type);
  });

  it('resolves engines deterministically', () => {
    for (const t of CHART_TYPES) {
      const a = resolveEngine({ type: t, engine: 'auto' });
      const b = resolveEngine({ type: t, engine: 'auto' });
      expect(a).toEqual(b);
      expect(a.engine).toBe(getDescriptor(t)!.engine);
    }
  });

  it('raises a capability error instead of substituting an engine', () => {
    expect(() => resolveEngine({ type: 'kpi', engine: 'echarts' })).toThrow(/지원하지 않습니다/);
    expect(() => resolveEngine({ type: 'line', engine: 'native' })).toThrow(/지원하지 않습니다/);
  });
});

describe('validateChartDefinition', () => {
  it('accepts every MVP fixture', () => {
    for (const [type, def] of Object.entries(definitions)) {
      const r = validateChartDefinition(def);
      expect(r.issues.filter((i) => i.severity === 'error'), type).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it('applies registry defaults without mutating the input', () => {
    const input = base();
    const def = assertValidDefinition(input);
    expect(def.options?.orientation).toBe('horizontal');
    expect(def.interactions).toEqual(['tooltip', 'selection']);
    expect(def.renderer).toBe('canvas');
    expect(def.engine).toBe('auto');
    expect(input).toEqual(base());
  });

  it('rejects unknown types, versions and engines with explicit errors', () => {
    expect(errors({ ...base(), type: 'unknown-chart' })[0]?.code).toBe('unknown-type');
    expect(errors({ ...base(), schemaVersion: '2.0.0' })[0]?.code).toBe('unsupported-version');
    expect(errors({ ...base(), engine: 'g2' })[0]?.code).toBe('engine-unknown');
    expect(errors({ ...base(), renderer: 'webgl' })[0]?.code).toBe('renderer-unknown');
  });

  it('requires encodings and checks field references and types', () => {
    expect(errors({ ...base(), encoding: { x: 'k' } }).map((e) => e.path)).toContain('encoding.y');
    expect(errors({ ...base(), encoding: { x: 'k', y: 'missing' } })[0]?.code).toBe('unknown-field');
    expect(errors({ ...base(), encoding: { x: 'k', y: 'k' } })[0]?.code).toBe('field-type');
  });

  it('rejects unsupported interactions for a type', () => {
    expect(errors({ ...base(), interactions: ['drilldown'] })[0]?.code).toBe('interaction-unsupported');
  });

  it('blocks URLs as data sources (SSRF guard)', () => {
    const cases = ['https://evil.example/x', '//evil', 'a/b', 'http:x', '../admin', 'a b'];
    for (const endpointId of cases) {
      expect(errors({ ...base(), dataSource: { kind: 'rest', endpointId } })[0]?.code, endpointId).toBe('endpoint-id');
    }
    expect(errors({ ...base(), dataSource: { kind: 'rest', endpointId: 'ok', url: 'https://x' } }).map((e) => e.code)).toContain('forbidden');
    expect(errors({ ...base(), dataSource: { kind: 'rest', endpointId: 'alert-summary.v1' } })).toEqual([]);
  });

  it('enforces a minimum polling interval', () => {
    expect(errors({ ...base(), dataSource: { kind: 'rest', endpointId: 'x', refresh: { mode: 'poll', intervalMs: 50 } } })[0]?.code).toBe('range');
  });

  it('only accepts literal colours in theme overrides (no CSS injection)', () => {
    for (const bad of ['url(https://x)', 'red;background:url(x)', 'var(--x)', 'expression(alert(1))']) {
      expect(errors({ ...base(), theme: { overrides: { accentBlue: bad } } })[0]?.code, bad).toBe('color');
    }
    expect(errors({ ...base(), theme: { overrides: { accentBlue: '#112233', selection: 'rgba(1, 2, 3, 0.5)' } } })).toEqual([]);
    expect(errors({ ...base(), theme: { overrides: { notAToken: '#fff' } } })[0]?.code).toBe('unknown-token');
  });

  it('only allows declarative, allow-listed event actions', () => {
    expect(errors({ ...base(), events: { 'point.click': { action: 'eval', code: 'alert(1)' } } })[0]?.code).toBe('enum');
    expect(errors({ ...base(), events: { onclick: { action: 'emit' } } })[0]?.code).toBe('unknown-event');
  });

  it('sanitises the ECharts escape hatch and reports removals as warnings', () => {
    // JSON.parse makes "__proto__" an own key — exactly what a stored definition contains.
    const echarts = JSON.parse(`{
      "__proto__": { "polluted": true },
      "tooltip": { "formatter": "<img src=x onerror=alert(1)>", "renderMode": "richText" },
      "title": { "link": "javascript:alert(1)", "text": "ok" },
      "series": [{ "symbol": "image://https://tracker.example/p.png", "barWidth": 12 }]
    }`);
    const r = validateChartDefinition({ ...base(), engineOptions: { echarts } });
    expect(r.valid).toBe(true);
    const eo = r.definition!.engineOptions!.echarts!;
    expect(eo).toEqual({ tooltip: {}, title: { text: 'ok' }, series: [{ barWidth: 12 }] });
    expect(r.issues.filter((i) => i.code === 'sanitized').length).toBeGreaterThanOrEqual(3);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects engineOptions for native widgets and unknown engines', () => {
    expect(errors({ ...definitions.kpi, engineOptions: { echarts: {} } })[0]?.code).toBe('engine-unsupported');
    expect(errors({ ...base(), engineOptions: { g2: {} } })[0]?.code).toBe('engine-unsupported');
  });

  it('warns (not fails) on unknown top-level properties and preserves extensions', () => {
    const r = validateChartDefinition({ ...base(), futureThing: 1, extensions: { owner: 'team-a' } });
    expect(r.valid).toBe(true);
    expect(r.issues.some((i) => i.code === 'unknown-property')).toBe(true);
    expect(r.definition!.extensions).toEqual({ owner: 'team-a' });
  });

  it('never throws on garbage input', () => {
    for (const g of [null, 1, 'x', [], { type: 1 }, { schemaVersion: '1.0.0', id: 'a', type: 'line', data: 5 }]) {
      expect(() => validateChartDefinition(g)).not.toThrow();
      expect(validateChartDefinition(g).valid).toBe(false);
    }
  });
});

describe('migrations', () => {
  const legacy = {
    schemaVersion: '0.9.0', id: 'old', type: 'stacked-bar', engine: 'g2',
    data: { fields: [{ name: 'q', type: 'string' }, { name: 'c', type: 'string' }, { name: 'n', type: 'number' }] },
    encoding: { x: 'q', y: 'n', series: 'c' },
    options: { stacked: 'percent' },
    extensions: { keep: true },
  };

  it('migrates 0.9.0 → 1.0.0 forward', () => {
    const { definition, applied } = migrateDefinition(legacy);
    expect(applied).toEqual(['0.9.0→1.0.0']);
    expect(definition).toMatchObject({ schemaVersion: '1.0.0', engine: 'auto', encoding: { color: 'c' }, options: { stack: 'percent' } });
    expect((definition.encoding as Record<string, unknown>).series).toBeUndefined();
  });

  it('validates migrated definitions and round-trips unknown host data', () => {
    const r = validateChartDefinition(legacy);
    expect(r.valid).toBe(true);
    expect(r.issues.some((i) => i.code === 'migrated')).toBe(true);
    expect(r.definition!.extensions).toEqual({ keep: true });
    // Re-validating the output is a fixed point.
    expect(validateChartDefinition(JSON.parse(JSON.stringify(r.definition))).definition).toEqual(r.definition);
  });
});
