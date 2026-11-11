import type { StatusLevel, ThemeSpec, ThemeTokenName } from './types';

/**
 * Premium Dark Blue — semantic tokens.
 *
 * Categorical palette and sequential ramp were validated with the data-viz
 * validator (OKLCH lightness band, chroma floor, CVD ΔE, contrast) against
 * `bgSurface` (#0B1728). See docs/decisions/0003-palette-validation.md.
 */
export interface ThemeTokens extends Record<ThemeTokenName, string> {}

export interface ResolvedTheme {
  name: string;
  tokens: ThemeTokens;
  /** Categorical, fixed order — never cycled. Slot 1 first. */
  palette: string[];
  /** Single-hue sequential ramp, low → high magnitude. */
  sequential: string[];
  status: Record<StatusLevel, string>;
  fontFamily: string;
  radius: { sm: number; md: number; lg: number };
  /** CODVIL dark-surface effects: value-end gradients, soft glow, and the opt-in 3D style. */
  effects: { gradient: boolean; glow: boolean; depth: boolean };
}

export const PREMIUM_DARK_BLUE_TOKENS: ThemeTokens = {
  bgCanvas: '#07111F',
  bgSurface: '#0B1728',
  bgElevated: '#10223A',
  bgHover: '#142B47',
  borderSubtle: '#203650',
  textPrimary: '#F3F7FC',
  textSecondary: '#A9B9CC',
  textMuted: '#8396AD',
  accentCyan: '#36D6F5',
  accentBlue: '#4D8DFF',
  accentViolet: '#9272FF',
  success: '#2DD4A7',
  warning: '#F6B84A',
  danger: '#FF637D',
  info: '#58A6FF',
  focus: '#9BC7FF',
  axisLine: '#2A4363',
  gridLine: '#17293F',
  tooltipBg: '#10223A',
  tooltipBorder: '#2A4363',
  selection: 'rgba(77, 141, 255, 0.18)',
  disabled: '#4A5D75',
};

/** Validated (dark, surface #0B1728): adjacent CVD ΔE ≥ 11.8, normal-vision ΔE ≥ 18.6, all ≥ 3:1. */
export const PREMIUM_DARK_BLUE_PALETTE = [
  '#4D8DFF', // blue
  '#D96E33', // orange
  '#1FA89A', // teal
  '#B88A14', // ochre
  '#C8579F', // magenta
  '#4FA34A', // green
  '#9272FF', // violet
  '#E0605F', // coral
];

/** Validated ordinal ramp: monotone lightness, single hue (6° spread), low end ≥ 2:1 vs surface. */
export const PREMIUM_DARK_BLUE_SEQUENTIAL = ['#1F4B7E', '#2862A6', '#3A7EDB', '#5E9BFF', '#8DB8FF', '#C2DAFF'];

/**
 * Chart forms where every pair of colours can be compared (scatter, bubble) only
 * clear the CVD floors for the first three slots. Beyond that, warn the author.
 */
export const ALL_PAIRS_SAFE_SLOTS = 3;

export const THEME_NAME = 'codvil-premium-dark-blue';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;

/** Only literal colours are accepted from definitions (no url(), no var(), no expressions). */
export function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && (HEX.test(value) || RGBA.test(value));
}

export function resolveTheme(spec?: ThemeSpec): ResolvedTheme {
  const tokens: ThemeTokens = { ...PREMIUM_DARK_BLUE_TOKENS };
  for (const [key, value] of Object.entries(spec?.overrides ?? {})) {
    if (key in tokens && isSafeColor(value)) tokens[key as ThemeTokenName] = value;
  }
  const palette =
    spec?.palette && spec.palette.length > 0 && spec.palette.every(isSafeColor)
      ? [...spec.palette]
      : [...PREMIUM_DARK_BLUE_PALETTE];
  return {
    name: spec?.name ?? THEME_NAME,
    tokens,
    palette,
    sequential: [...PREMIUM_DARK_BLUE_SEQUENTIAL],
    status: { ok: tokens.success, info: tokens.info, warning: tokens.warning, critical: tokens.danger },
    fontFamily:
      "Pretendard, 'Inter', system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    radius: { sm: 6, md: 10, lg: 14 },
    effects: { gradient: spec?.effects?.gradient !== false, glow: spec?.effects?.glow !== false, depth: spec?.effects?.depth === true },
  };
}

/** Palette colour for a series slot. Stable by slot index — colour follows the entity, never rank. */
export function seriesColor(theme: ResolvedTheme, slot: number): string {
  return theme.palette[slot % theme.palette.length]!;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS custom properties for DOM (native) widgets, applied on the chart root element. */
export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.tokens) as [string, string][]) vars[`--cv-${kebab(k)}`] = v;
  theme.palette.forEach((c, i) => (vars[`--cv-series-${i + 1}`] = c));
  vars['--cv-font-family'] = theme.fontFamily;
  vars['--cv-radius-sm'] = `${theme.radius.sm}px`;
  vars['--cv-radius-md'] = `${theme.radius.md}px`;
  vars['--cv-radius-lg'] = `${theme.radius.lg}px`;
  return vars;
}

/** Status presentation: never colour alone — each level has an icon glyph and a label. */
export const STATUS_META: Record<StatusLevel, { label: string; icon: string; rank: number }> = {
  critical: { label: 'Critical', icon: '▲', rank: 3 },
  warning: { label: 'Warning', icon: '◆', rank: 2 },
  info: { label: 'Info', icon: '●', rank: 1 },
  ok: { label: 'OK', icon: '✓', rank: 0 },
};

const STATUS_ALIASES: Record<string, StatusLevel> = {
  critical: 'critical', crit: 'critical', high: 'critical', error: 'critical', danger: 'critical', severe: 'critical',
  warning: 'warning', warn: 'warning', medium: 'warning', major: 'warning',
  info: 'info', low: 'info', notice: 'info', minor: 'info',
  ok: 'ok', normal: 'ok', success: 'ok', good: 'ok', resolved: 'ok',
};

export function toStatusLevel(value: unknown): StatusLevel {
  return STATUS_ALIASES[String(value ?? '').trim().toLowerCase()] ?? 'info';
}

/** Status for a numeric value given ascending thresholds (the highest crossed threshold wins). */
export function statusForValue(value: number, thresholds: { value: number; status?: StatusLevel }[] = []): StatusLevel {
  let level: StatusLevel = 'ok';
  for (const t of [...thresholds].sort((a, b) => a.value - b.value)) {
    if (value >= t.value) level = t.status ?? 'warning';
  }
  return level;
}
