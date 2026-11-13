import type { StatusLevel, ThemeSpec, ThemeTokenName } from './types';

/**
 * CODVIL Cyber Neon — semantic tokens (default theme).
 *
 * Built for COD-M's 3D 상황판 / 메인화면: charts sit on translucent host panels over a
 * deep-space scene, so surfaces are near-black navy and the accents are cyan-led neon.
 *
 * The categorical palette and sequential ramp were validated with the data-viz validator
 * (OKLCH lightness band 0.48–0.67, chroma floor, adjacent CVD ΔE, normal-vision floor,
 * ≥ 3:1 contrast) against both #050B18 and #0B1728. Base hues stay inside the band so every
 * series carries equal visual weight; the neon brightness comes from the effect layer
 * (bright cores, value-end highlights, glow) — see src/adapters/echarts/effects.ts.
 * See docs/decisions/0003-theme-palette-validation.md.
 */
export interface ThemeTokens extends Record<ThemeTokenName, string> {}

export type ThemeMode = 'dark' | 'light';

export interface ResolvedTheme {
  name: string;
  /** dark = COD-M "black" (neon on near-black), light = COD-M "white". */
  mode: ThemeMode;
  tokens: ThemeTokens;
  /** Categorical, fixed order — never cycled. Slot 1 first. */
  palette: string[];
  /** Categorical order for radial forms (see CYBER_NEON_RADIAL). Equals `palette` when the host supplies one. */
  radial: string[];
  /** Single-hue sequential ramp, low → high magnitude. */
  sequential: string[];
  status: Record<StatusLevel, string>;
  fontFamily: string;
  radius: { sm: number; md: number; lg: number };
  /** CODVIL dark-surface effects: value-end gradients, neon glow, and the opt-in 3D style. */
  effects: { gradient: boolean; glow: boolean; depth: boolean };
}

export const CYBER_NEON_TOKENS: ThemeTokens = {
  bgCanvas: '#040A16',
  bgSurface: '#07101F',
  bgElevated: '#0B1A2F',
  bgHover: '#10243F',
  borderSubtle: '#163452',
  textPrimary: '#EAF6FF',
  textSecondary: '#9EC2DC',
  textMuted: '#6C90B0',
  accentCyan: '#00E0FF',
  accentBlue: '#2F7BFF',
  accentViolet: '#8A5CFF',
  success: '#00D68F',
  warning: '#FFB020',
  danger: '#FF2E5B',
  info: '#2FA8FF',
  focus: '#7FE9FF',
  axisLine: '#1A4466',
  gridLine: '#0F2B47',
  tooltipBg: '#061424',
  tooltipBorder: '#1C5C80',
  selection: 'rgba(0, 224, 255, 0.14)',
  disabled: '#3C5670',
};

/**
 * Validated (dark, surfaces #050B18 and #07101F): all inside L 0.48–0.67, chroma ≥ 0.1,
 * adjacent CVD ΔE ≥ 19.9, normal-vision ΔE ≥ 26.4, all ≥ 3:1; the first three also pass all-pairs.
 * Cyan / orange lead (the cyber pair); no pink or magenta hues (product direction, 2026-11-11).
 */
export const CYBER_NEON_PALETTE = [
  '#00A6BD', // cyan
  '#D77800', // orange
  '#3844FF', // electric indigo
  '#00AF73', // neon green
  '#7B39FF', // violet
  '#7CA400', // lime
  '#0D97FF', // sky blue
  '#EC0027', // red
];

/** Validated ordinal ramp (hue 215°, spread 1°): monotone lightness, ΔL ≥ 0.06, low end ≥ 2:1. */
export const CYBER_NEON_SEQUENTIAL = ['#0F505D', '#186F80', '#228FA4', '#2CB0CA', '#37D2F2', '#A6EBFC'];

/** Light mode (COD-M "white" theme, settings group). Surfaces follow COD-M styles/settings/tokens.css. */
export const CYBER_LIGHT_TOKENS: ThemeTokens = {
  bgCanvas: '#F3F5F9',
  bgSurface: '#FFFFFF',
  bgElevated: '#F6F8FB',
  bgHover: '#EBF1F7',
  borderSubtle: '#DDE3EC',
  textPrimary: '#0F1724',
  textSecondary: '#2B3646',
  textMuted: '#5F6F86',
  accentCyan: '#0090A4',
  accentBlue: '#1261ED',
  accentViolet: '#6400FD',
  success: '#00A86B',
  warning: '#C77700',
  danger: '#D4183D',
  info: '#1261ED',
  focus: '#2F7BEA',
  axisLine: '#C9D2DF',
  gridLine: '#E6EBF2',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#C9D2DF',
  selection: 'rgba(18, 97, 237, 0.12)',
  disabled: '#AAB6C6',
};

/**
 * Same hue order as the dark palette, re-stepped for white surfaces. Validated (light,
 * #FFFFFF and #F3F5F9): L 0.43–0.77, chroma ≥ 0.1, adjacent CVD ΔE ≥ 16.8, normal ≥ 23.5, ≥ 3:1.
 */
export const CYBER_LIGHT_PALETTE = ['#008A9D', '#BB6800', '#3121FF', '#00915F', '#6F00F4', '#6C8F00', '#0077CC', '#D50022'];

/** Validated ordinal ramp for white (hue 215°): light → dark, low end 2.23:1 vs #FFFFFF. */
export const CYBER_LIGHT_SEQUENTIAL = ['#30BDDA', '#28A2BB', '#20889D', '#186F80', '#115664', '#0A3F4A'];

/**
 * Radial forms (pie, donut, polar, spider, gauge rings, bubble, word cloud) put every colour
 * side by side in one shape, where a full-wheel palette reads garish. They use a cool neon
 * family (cyan → indigo → violet, teal-green) with one gold accent, stepped in lightness so
 * adjacent pairs separate. No pink/magenta. Validated dark (#050B18, #07101F): L 0.48–0.67,
 * chroma ≥ 0.1, adjacent CVD ΔE ≥ 15.5, normal ≥ 23.3, ≥ 3:1; first three pass all-pairs.
 */
export const CYBER_NEON_RADIAL = ['#00A8AF', '#A100EE', '#B48F00', '#658BFF', '#00AD84', '#763DFF', '#00A1D8', '#3844FF'];
/** Light counterpart. Validated light (#FFFFFF, #F3F5F9): CVD ΔE ≥ 17.2, normal ≥ 26.6, ≥ 3:1. */
export const CYBER_LIGHT_RADIAL = ['#00919D', '#8F00E1', '#A48200', '#4A70FF', '#009772', '#6400EA', '#0092C5', '#2F00FB'];

/** @deprecated Previous default (Premium Dark Blue). Kept so hosts can opt back in via `theme.palette`. */
export const PREMIUM_DARK_BLUE_PALETTE = ['#4D8DFF', '#D96E33', '#1FA89A', '#B88A14', '#C8579F', '#4FA34A', '#9272FF', '#E0605F'];
/** @deprecated Alias of the token names; values are the Cyber Neon defaults. */
export const PREMIUM_DARK_BLUE_TOKENS = CYBER_NEON_TOKENS;

/**
 * Chart forms where every pair of colours can be compared (scatter, bubble) only
 * clear the CVD floors for the first three slots. Beyond that, warn the author.
 */
export const ALL_PAIRS_SAFE_SLOTS = 3;

export const THEME_NAME = 'codvil-cyber-neon';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;

/** Only literal colours are accepted from definitions (no url(), no var(), no expressions). */
export function isSafeColor(value: unknown): value is string {
  return typeof value === 'string' && (HEX.test(value) || RGBA.test(value));
}

export function resolveTheme(spec?: ThemeSpec): ResolvedTheme {
  const mode: ThemeMode = spec?.mode === 'light' ? 'light' : 'dark';
  const light = mode === 'light';
  const tokens: ThemeTokens = { ...(light ? CYBER_LIGHT_TOKENS : CYBER_NEON_TOKENS) };
  for (const [key, value] of Object.entries(spec?.overrides ?? {})) {
    if (key in tokens && isSafeColor(value)) tokens[key as ThemeTokenName] = value;
  }
  const custom = spec?.palette && spec.palette.length > 0 && spec.palette.every(isSafeColor);
  const palette =
    spec?.palette && spec.palette.length > 0 && spec.palette.every(isSafeColor)
      ? [...spec.palette]
      : [...(light ? CYBER_LIGHT_PALETTE : CYBER_NEON_PALETTE)];
  return {
    name: spec?.name ?? (light ? `${THEME_NAME}-light` : THEME_NAME),
    mode,
    tokens,
    palette,
    radial: custom ? [...palette] : [...(light ? CYBER_LIGHT_RADIAL : CYBER_NEON_RADIAL)],
    sequential: [...(light ? CYBER_LIGHT_SEQUENTIAL : CYBER_NEON_SEQUENTIAL)],
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
