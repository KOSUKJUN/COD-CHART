import { CapabilityError, getDescriptor, resolveEngine, type EncodingChannel } from './registry';
import { ContentsDataError, convertContentsData } from './contents';
import { isPlainObject, sanitizeEngineOptions } from './sanitize';
import { isSafeColor, CYBER_NEON_TOKENS } from './theme';
import {
  SCHEMA_VERSION,
  type AnimationPreset, type ChartDefinition, type ChartEventName, type FieldType, type InteractionName,
  type ValidationIssue, type ValidationResult,
} from './types';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FIELD_RE = /^[A-Za-z_가-힣][A-Za-z0-9_.\-가-힣]{0,63}$/;
/** Server allow-list id. Deliberately excludes '/', ':' and whitespace so a URL can never pass. */
const ENDPOINT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const FIELD_TYPES: FieldType[] = ['string', 'number', 'time', 'boolean'];
const PRESETS: AnimationPreset[] = ['entrance', 'smooth-update', 'emphasis', 'none'];
const EVENT_NAMES: ChartEventName[] = [
  'ready', 'point.click', 'legend.toggle', 'zoom.change', 'drill.change', 'row.click', 'item.select',
  'state.change', 'data.error', 'render.error',
];
const ACTIONS = ['filter-dashboard', 'navigate', 'emit'];
const KNOWN_TOP_LEVEL = new Set([
  'schemaVersion', 'id', 'type', 'title', 'description', 'engine', 'renderer', 'layout', 'dataSource', 'data',
  'encoding', 'options', 'theme', 'animation', 'interactions', 'events', 'locale', 'engineOptions', 'extensions',
]);
export const MIN_POLL_INTERVAL_MS = 1000;

// ── Migrations ─────────────────────────────────────────────────────────────

interface Migration {
  from: string;
  to: string;
  migrate(def: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Forward-only migrations. Each step is pure and tested (tests/core/schema.test.ts).
 * 0.9.0 → 1.0.0: `encoding.series` renamed to `encoding.color`; `options.stacked: boolean`
 * became `options.stack: 'none' | 'stacked' | 'percent'`; `engine: 'g2'` removed (ADR-0001).
 */
const MIGRATIONS: Migration[] = [
  {
    from: '0.9.0',
    to: '1.0.0',
    migrate(def) {
      const out: Record<string, unknown> = { ...def, schemaVersion: '1.0.0' };
      if (isPlainObject(def.encoding)) {
        const enc = { ...def.encoding };
        if ('series' in enc && !('color' in enc)) enc.color = enc.series;
        delete enc.series;
        out.encoding = enc;
      }
      if (isPlainObject(def.options) && 'stacked' in def.options) {
        const { stacked, ...rest } = def.options;
        out.options = { ...rest, stack: stacked === 'percent' ? 'percent' : stacked ? 'stacked' : 'none' };
      }
      if (def.engine === 'g2') out.engine = 'auto';
      return out;
    },
  },
];

export function migrateDefinition(input: Record<string, unknown>): { definition: Record<string, unknown>; applied: string[] } {
  let def = input;
  const applied: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const step = MIGRATIONS.find((m) => m.from === def.schemaVersion);
    if (!step) break;
    def = step.migrate(def);
    applied.push(`${step.from}→${step.to}`);
  }
  return { definition: def, applied };
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate (after migration) and apply registry defaults. Pure; safe on both client
 * and server boundaries. Errors make the definition unusable; warnings do not.
 */
export function validateChartDefinition(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: 'error' });
  const warn = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: 'warning' });

  if (!isPlainObject(input)) {
    err('', 'type', '차트 정의는 객체여야 합니다.');
    return { valid: false, issues };
  }

  const { definition: migrated, applied } = migrateDefinition(input);
  let raw = migrated;
  for (const a of applied) warn('schemaVersion', 'migrated', `스키마를 ${a}로 마이그레이션했습니다.`);

  if ('contentsData' in raw) {
    if ('data' in raw || 'encoding' in raw || 'dataSource' in raw) {
      err('contentsData', 'conflict', 'contentsData는 data, encoding 또는 dataSource와 함께 사용할 수 없습니다.');
      return { valid: false, issues };
    }
    const descriptor = typeof raw.type === 'string' ? getDescriptor(raw.type) : undefined;
    if (!descriptor) {
      err('type', 'unknown-type', `지원하지 않는 차트 유형입니다: ${String(raw.type)}`);
      return { valid: false, issues };
    }
    try {
      const { type, data, encoding, palette } = convertContentsData(descriptor.type, raw.contentsData);
      const { contentsData: _contentsData, ...rest } = raw;
      const theme = isPlainObject(raw.theme) ? raw.theme : {};
      raw = { ...rest, type, data, encoding, ...(palette && !('palette' in theme) ? { theme: { ...theme, palette } } : {}) };
    } catch (e) {
      if (!(e instanceof ContentsDataError)) throw e;
      err(e.path, 'contents-data', e.message);
      return { valid: false, issues };
    }
  }
  const ver = typeof raw.schemaVersion === 'string' ? raw.schemaVersion.match(SEMVER_RE) : null;
  if (!ver) err('schemaVersion', 'required', 'schemaVersion(예: "1.0.0")이 필요합니다.');
  else if (ver[1] !== SCHEMA_VERSION.split('.')[0]) {
    err('schemaVersion', 'unsupported-version', `지원하지 않는 스키마 버전입니다: ${raw.schemaVersion}. 지원: ${SCHEMA_VERSION}`);
  } else if (Number(ver[2]) > Number(SCHEMA_VERSION.split('.')[1])) {
    warn('schemaVersion', 'newer-minor', `더 새로운 스키마(${raw.schemaVersion})입니다. 알 수 없는 속성은 무시됩니다.`);
  }

  for (const k of Object.keys(raw)) if (!KNOWN_TOP_LEVEL.has(k)) warn(k, 'unknown-property', `알 수 없는 속성 '${k}'은(는) 무시됩니다.`);

  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) err('id', 'pattern', 'id는 1–64자의 영문/숫자/_/- 이어야 합니다.');

  const descriptor = typeof raw.type === 'string' ? getDescriptor(raw.type) : undefined;
  if (!descriptor) {
    err('type', 'unknown-type', `지원하지 않는 차트 유형입니다: ${String(raw.type)}`);
    return { valid: false, issues };
  }

  if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > 200)) err('title', 'length', 'title은 200자 이하 문자열이어야 합니다.');
  if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 1000)) err('description', 'length', 'description은 1000자 이하여야 합니다.');

  if (raw.engine !== undefined && !['auto', 'echarts', 'native'].includes(raw.engine as string)) {
    err('engine', 'engine-unknown', `알 수 없는 엔진입니다: ${String(raw.engine)} (auto | echarts | native)`);
  } else if (raw.renderer !== undefined && !['canvas', 'svg'].includes(raw.renderer as string)) {
    err('renderer', 'renderer-unknown', `알 수 없는 렌더러입니다: ${String(raw.renderer)}`);
  } else {
    try {
      resolveEngine(raw as unknown as ChartDefinition);
    } catch (e) {
      if (e instanceof CapabilityError) err(e.code === 'renderer-unsupported' ? 'renderer' : 'engine', e.code, e.message);
      else throw e;
    }
  }

  // data / fields
  const data = raw.data;
  const fieldTypes = new Map<string, FieldType>();
  if (!isPlainObject(data)) {
    if (descriptor.type !== 'text') err('data', 'required', 'data.fields 정의가 필요합니다.');
  } else {
    const fields = data.fields;
    if (!Array.isArray(fields)) {
      if (descriptor.type !== 'text') err('data.fields', 'required', 'data.fields는 배열이어야 합니다.');
    } else {
      if (fields.length > 200) err('data.fields', 'max-items', '필드는 200개 이하여야 합니다.');
      fields.forEach((f, i) => {
        const p = `data.fields[${i}]`;
        if (!isPlainObject(f)) return err(p, 'type', '필드 정의는 객체여야 합니다.');
        if (typeof f.name !== 'string' || !FIELD_RE.test(f.name)) return err(`${p}.name`, 'pattern', `필드 이름이 올바르지 않습니다: ${String(f.name)}`);
        if (fieldTypes.has(f.name)) err(`${p}.name`, 'duplicate', `중복된 필드 이름입니다: ${f.name}`);
        if (!FIELD_TYPES.includes(f.type as FieldType)) err(`${p}.type`, 'enum', `필드 타입은 ${FIELD_TYPES.join(' | ')} 중 하나여야 합니다.`);
        if (f.label !== undefined && (typeof f.label !== 'string' || f.label.length > 100)) err(`${p}.label`, 'length', 'label은 100자 이하여야 합니다.');
        if (f.unit !== undefined && (typeof f.unit !== 'string' || f.unit.length > 20)) err(`${p}.unit`, 'length', 'unit은 20자 이하여야 합니다.');
        fieldTypes.set(f.name, f.type as FieldType);
      });
    }
    if (data.rows !== undefined && !Array.isArray(data.rows)) err('data.rows', 'type', 'data.rows는 배열이어야 합니다.');
    if (data.maxRows !== undefined && !(typeof data.maxRows === 'number' && data.maxRows >= 1 && data.maxRows <= 1_000_000)) {
      err('data.maxRows', 'range', 'maxRows는 1–1,000,000 사이여야 합니다.');
    }
  }

  // encoding
  const enc = raw.encoding;
  if (enc !== undefined && !isPlainObject(enc)) err('encoding', 'type', 'encoding은 객체여야 합니다.');
  const encoding = (isPlainObject(enc) ? enc : {}) as Record<string, unknown>;
  if (descriptor.type === 'bubble' && (encoding.x === undefined) !== (encoding.y === undefined)) {
    err('encoding', 'bubble-coordinates', '버블 차트의 x와 y는 함께 지정해야 합니다.');
  }
  if (descriptor.type === 'bubble' && Array.isArray(encoding.y)) {
    err('encoding.y', 'type', '버블 차트의 y는 단일 숫자 필드여야 합니다.');
  }
  // Heatmap week × hour pattern: y (weekday) is derived from the x timestamp.
  const weekHour = descriptor.type === 'heatmap' && isPlainObject(raw.options) && (raw.options as Record<string, unknown>).pattern === 'week-hour';
  for (const ch of descriptor.required) {
    if (weekHour && ch === 'y') continue;
    const v = encoding[ch];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) err(`encoding.${ch}`, 'required', `'${descriptor.type}' 유형에는 encoding.${ch}가 필요합니다.`);
  }
  const allowed = new Set<string>([...descriptor.required, ...descriptor.optional]);
  for (const [ch, v] of Object.entries(encoding)) {
    if (!allowed.has(ch)) {
      warn(`encoding.${ch}`, 'unused-channel', `'${descriptor.type}' 유형은 encoding.${ch}를 사용하지 않습니다.`);
      continue;
    }
    if (descriptor.type === 'candlestick' && (!Array.isArray(encoding.y) || encoding.y.length !== 4)) {
      err('encoding.y', 'ohlc-fields', '캔들스틱의 encoding.y는 시가, 종가, 저가, 고가 순서의 필드 4개여야 합니다.');
    }
    if (descriptor.type === 'polar-pie' && (!Array.isArray(encoding.path) || encoding.path.length !== 1)) {
      err('encoding.path', 'parent-field', '계층형 파이의 encoding.path는 부모 ID 필드 한 개여야 합니다.');
    }
    const refs = Array.isArray(v) ? v : [v];
    refs.forEach((name, i) => {
      const p = Array.isArray(v) ? `encoding.${ch}[${i}]` : `encoding.${ch}`;
      if (typeof name !== 'string') return err(p, 'type', '인코딩 값은 필드 이름이어야 합니다.');
      const t = fieldTypes.get(name);
      if (!t) return err(p, 'unknown-field', `정의되지 않은 필드를 참조합니다: ${name}`);
      if (descriptor.numeric?.includes(ch as EncodingChannel) && t !== 'number') {
        // Scatter x may be time for time-series scatter.
        if (!(descriptor.type === 'scatter' && ch === 'x' && t === 'time')) err(p, 'field-type', `encoding.${ch}는 number 필드여야 합니다 (현재: ${t}).`);
      }
    });
  }

  // dataSource — server allow-listed endpoints only (SSRF guard)
  const ds = raw.dataSource;
  if (ds !== undefined) {
    if (!isPlainObject(ds)) err('dataSource', 'type', 'dataSource는 객체여야 합니다.');
    else if (ds.kind === 'rest' || ds.kind === 'stream') {
      if (typeof ds.endpointId !== 'string' || !ENDPOINT_RE.test(ds.endpointId)) {
        err('dataSource.endpointId', 'endpoint-id', 'endpointId는 서버에 등록된 ID여야 합니다. URL은 허용되지 않습니다.');
      }
      if ('url' in ds) err('dataSource.url', 'forbidden', '임의 URL 데이터 소스는 허용되지 않습니다. endpointId를 사용하세요.');
      if (ds.params !== undefined) {
        if (!isPlainObject(ds.params)) err('dataSource.params', 'type', 'params는 객체여야 합니다.');
        else for (const [k, v] of Object.entries(ds.params)) {
          if (!PARAM_KEY_RE.test(k)) err(`dataSource.params.${k}`, 'pattern', `파라미터 이름이 올바르지 않습니다: ${k}`);
          if (!['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'string' && v.length > 500)) {
            err(`dataSource.params.${k}`, 'type', '파라미터 값은 500자 이하 문자열/숫자/불리언이어야 합니다.');
          }
        }
      }
      if (ds.kind === 'rest' && isPlainObject(ds.refresh) && ds.refresh.mode === 'poll') {
        const ms = ds.refresh.intervalMs;
        if (typeof ms !== 'number' || ms < MIN_POLL_INTERVAL_MS || ms > 86_400_000) {
          err('dataSource.refresh.intervalMs', 'range', `폴링 주기는 ${MIN_POLL_INTERVAL_MS}ms–24h 사이여야 합니다.`);
        }
      }
      if (ds.kind === 'stream') {
        if (ds.transport !== undefined && !['sse', 'websocket'].includes(ds.transport as string)) err('dataSource.transport', 'enum', 'transport는 sse | websocket 이어야 합니다.');
        if (ds.windowSize !== undefined && !(typeof ds.windowSize === 'number' && ds.windowSize >= 1 && ds.windowSize <= 100_000)) err('dataSource.windowSize', 'range', 'windowSize는 1–100,000 사이여야 합니다.');
      }
    } else if (ds.kind !== 'static') err('dataSource.kind', 'enum', 'dataSource.kind는 static | rest | stream 이어야 합니다.');
  }

  // interactions — must be supported by the type (explicit capability error)
  if (raw.interactions !== undefined) {
    if (!Array.isArray(raw.interactions)) err('interactions', 'type', 'interactions는 배열이어야 합니다.');
    else raw.interactions.forEach((name, i) => {
      if (!descriptor.interactions.includes(name as InteractionName)) {
        err(`interactions[${i}]`, 'interaction-unsupported', `'${descriptor.type}' 유형은 '${String(name)}' 상호작용을 지원하지 않습니다.`);
      }
    });
  }

  // animation
  if (isPlainObject(raw.animation)) {
    const a = raw.animation;
    if (a.preset !== undefined && !PRESETS.includes(a.preset as AnimationPreset)) err('animation.preset', 'enum', `animation.preset은 ${PRESETS.join(' | ')} 중 하나여야 합니다.`);
    if (a.durationMs !== undefined && !(typeof a.durationMs === 'number' && a.durationMs >= 0 && a.durationMs <= 5000)) err('animation.durationMs', 'range', 'durationMs는 0–5000 사이여야 합니다.');
  }

  // theme — literal colours, known tokens only
  if (isPlainObject(raw.theme)) {
    const t = raw.theme;
    if (isPlainObject(t.overrides)) for (const [k, v] of Object.entries(t.overrides)) {
      if (!(k in CYBER_NEON_TOKENS)) err(`theme.overrides.${k}`, 'unknown-token', `알 수 없는 테마 토큰입니다: ${k}`);
      else if (!isSafeColor(v)) err(`theme.overrides.${k}`, 'color', '색상은 #hex 또는 rgb()/rgba() 리터럴이어야 합니다.');
    }
    if (t.mode !== undefined && t.mode !== 'dark' && t.mode !== 'light') err('theme.mode', 'enum', "theme.mode는 'dark' 또는 'light'여야 합니다.");
    if (t.palette !== undefined && (!Array.isArray(t.palette) || !t.palette.every(isSafeColor) || t.palette.length > 12)) {
      err('theme.palette', 'color', 'palette는 12개 이하의 색상 리터럴 배열이어야 합니다.');
    }
    if (t.effects !== undefined) {
      if (!isPlainObject(t.effects)) err('theme.effects', 'type', 'theme.effects는 { gradient?, glow?, depth? } 객체여야 합니다.');
      else for (const [k, v] of Object.entries(t.effects)) {
        if (k !== 'gradient' && k !== 'glow' && k !== 'depth') err(`theme.effects.${k}`, 'unknown-effect', `알 수 없는 효과입니다: ${k}`);
        else if (typeof v !== 'boolean') err(`theme.effects.${k}`, 'type', `${k}는 불리언이어야 합니다.`);
      }
    }
  }

  // events — declarative allow-listed actions
  if (isPlainObject(raw.events)) for (const [name, action] of Object.entries(raw.events)) {
    if (!EVENT_NAMES.includes(name as ChartEventName)) err(`events.${name}`, 'unknown-event', `알 수 없는 이벤트입니다: ${name}`);
    if (!isPlainObject(action) || !ACTIONS.includes(action.action as string)) err(`events.${name}.action`, 'enum', `action은 ${ACTIONS.join(' | ')} 중 하나여야 합니다.`);
  }

  // options sanity
  if (isPlainObject(raw.options)) {
    const o = raw.options;
    if (o.thresholds !== undefined && (!Array.isArray(o.thresholds) || !o.thresholds.every((t) => isPlainObject(t) && typeof t.value === 'number' && Number.isFinite(t.value)))) {
      err('options.thresholds', 'type', 'thresholds는 { value: number } 배열이어야 합니다.');
    }
    if (descriptor.type === 'gauge-group') {
      for (const key of ['min', 'max'] as const) {
        if (o[key] !== undefined && (typeof o[key] !== 'number' || !Number.isFinite(o[key]))) err(`options.${key}`, 'type', '유한한 숫자가 필요합니다.');
      }
      const min = typeof o.min === 'number' ? o.min : 0;
      const max = typeof o.max === 'number' ? o.max : 100;
      if (min >= max || (Number.isFinite(min) && Number.isFinite(max) && !Number.isFinite(max - min))) {
        err('options.max', 'range', 'max는 min보다 커야 하며 범위는 유한해야 합니다.');
      }
    } else if (typeof o.min === 'number' && typeof o.max === 'number' && o.min >= o.max) err('options.max', 'range', 'max는 min보다 커야 합니다.');
    if (o.stack !== undefined && !['none', 'stacked', 'percent'].includes(o.stack as string)) err('options.stack', 'enum', 'stack은 none | stacked | percent 이어야 합니다.');
    if (o.orientation !== undefined && !['vertical', 'horizontal'].includes(o.orientation as string)) err('options.orientation', 'enum', 'orientation은 vertical | horizontal 이어야 합니다.');
    if (o.pageSize !== undefined && !(typeof o.pageSize === 'number' && o.pageSize >= 1 && o.pageSize <= 500)) err('options.pageSize', 'range', 'pageSize는 1–500 사이여야 합니다.');
    if (o.content !== undefined && typeof o.content !== 'string') err('options.content', 'type', 'content는 문자열이어야 합니다.');
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') err('options.zoom', 'type', 'zoom은 불리언이어야 합니다.');
    if (o.realtime !== undefined && typeof o.realtime !== 'boolean') {
      const ws = isPlainObject(o.realtime) ? (o.realtime as Record<string, unknown>).windowSize : null;
      if (!isPlainObject(o.realtime) || (ws !== undefined && !(typeof ws === 'number' && Number.isInteger(ws) && ws >= 2 && ws <= 100_000))) {
        err('options.realtime', 'type', 'realtime은 불리언 또는 { windowSize: 2–100,000 정수 } 이어야 합니다.');
      }
    }
    if (o.drawOrder !== undefined && !['together', 'one-by-one'].includes(o.drawOrder as string)) err('options.drawOrder', 'enum', 'drawOrder는 together | one-by-one 이어야 합니다.');
    if (o.staleAfterMs !== undefined && o.staleAfterMs !== false && !(typeof o.staleAfterMs === 'number' && o.staleAfterMs >= 1000 && o.staleAfterMs <= 86_400_000)) {
      err('options.staleAfterMs', 'range', 'staleAfterMs는 1,000–86,400,000 사이의 숫자 또는 false 이어야 합니다.');
    }
    if (o.alarm !== undefined && typeof o.alarm !== 'boolean') err('options.alarm', 'type', 'alarm은 불리언이어야 합니다.');
    if (o.borderFlow !== undefined && typeof o.borderFlow !== 'boolean') err('options.borderFlow', 'type', 'borderFlow는 불리언이어야 합니다.');
    if (o.pattern !== undefined && o.pattern !== 'week-hour') err('options.pattern', 'enum', "pattern은 'week-hour' 이어야 합니다.");
    if (o.ranking !== undefined && typeof o.ranking !== 'boolean') {
      const top = isPlainObject(o.ranking) ? (o.ranking as Record<string, unknown>).top : null;
      if (!isPlainObject(o.ranking) || (top !== undefined && !(typeof top === 'number' && Number.isInteger(top) && top >= 1 && top <= 50))) {
        err('options.ranking', 'type', 'ranking은 불리언 또는 { top: 1–50 정수 } 이어야 합니다.');
      }
    }
    if (o.autoTour !== undefined && typeof o.autoTour !== 'boolean') {
      const ms = isPlainObject(o.autoTour) ? (o.autoTour as Record<string, unknown>).intervalMs : null;
      if (!isPlainObject(o.autoTour) || (ms !== undefined && !(typeof ms === 'number' && ms >= 1000 && ms <= 600_000))) {
        err('options.autoTour', 'type', 'autoTour는 불리언 또는 { intervalMs: 1,000–600,000 } 이어야 합니다.');
      }
    }
  }

  // native escape hatch
  let engineOptions = raw.engineOptions as ChartDefinition['engineOptions'];
  if (raw.engineOptions !== undefined) {
    if (!isPlainObject(raw.engineOptions)) err('engineOptions', 'type', 'engineOptions는 객체여야 합니다.');
    else {
      for (const k of Object.keys(raw.engineOptions)) {
        if (k !== 'echarts') err(`engineOptions.${k}`, 'engine-unsupported', `'${k}' 엔진 옵션은 지원하지 않습니다 (설치된 엔진: echarts).`);
      }
      if (raw.engineOptions.echarts !== undefined) {
        if (descriptor.engine !== 'echarts') err('engineOptions.echarts', 'engine-unsupported', `'${descriptor.type}'는 ECharts로 렌더링되지 않으므로 engineOptions.echarts를 적용할 수 없습니다.`);
        const { value, removed } = sanitizeEngineOptions(raw.engineOptions.echarts);
        for (const r of removed) warn(`engineOptions.echarts.${r}`, 'sanitized', `보안 정책에 따라 제거했습니다: ${r}`);
        engineOptions = { echarts: value };
      }
    }
  }

  const valid = !issues.some((i) => i.severity === 'error');
  if (!valid) return { valid, issues };

  const def = raw as unknown as ChartDefinition;
  const definition: ChartDefinition = {
    ...def,
    engine: def.engine ?? 'auto',
    data: { format: 'rows', ...(def.data ?? { fields: [] }), fields: def.data?.fields ?? [] },
    encoding: { ...def.encoding },
    options: { ...descriptor.defaults.options, ...def.options },
    interactions: def.interactions ?? descriptor.defaults.interactions ?? [],
    ...(engineOptions ? { engineOptions } : {}),
  };
  if (descriptor.engine === 'echarts') definition.renderer = def.renderer ?? 'canvas';
  return { valid, issues, definition };
}

/** Throwing variant for programmatic use. */
export function assertValidDefinition(input: unknown): ChartDefinition {
  const r = validateChartDefinition(input);
  if (!r.valid || !r.definition) {
    const first = r.issues.find((i) => i.severity === 'error');
    throw new DefinitionError(r.issues, first ? `${first.path}: ${first.message}` : '차트 정의가 올바르지 않습니다.');
  }
  return r.definition;
}

export class DefinitionError extends Error {
  constructor(public readonly issues: ValidationIssue[], message: string) {
    super(message);
    this.name = 'DefinitionError';
  }
}
