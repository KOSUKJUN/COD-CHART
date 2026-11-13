/**
 * Count-up for formatted values ("1,234 건", "112 건 · 11.18%", "1.4억"): every number in the
 * text is interpolated from 0 to its final value while the surrounding text, decimals and
 * digit grouping stay exactly as formatted. Dates/times are left alone. Pure; no DOM.
 */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

/** Text that should not count (dates, times, ranges written with digits on both sides). */
export function isCountable(text: string): boolean {
  return /\d/.test(text) && !/\d[-:/]\d/.test(text);
}

/** The text at animation progress `k` (0 → 1). `k = 1` returns the original text. */
export function countFrame(text: string, k: number): string {
  if (k >= 1) return text;
  return text.replace(NUMBER, (m) => {
    const grouped = m.includes(',');
    const decimals = m.includes('.') ? m.split('.')[1]!.length : 0;
    const value = Number(m.replace(/,/g, '')) * k;
    return value.toLocaleString('en-US', { useGrouping: grouped, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  });
}

/** Ease used for the count (fast start, gentle landing). */
export const countEase = (t: number) => 1 - Math.pow(1 - t, 3);
export const COUNT_MS = 520;
