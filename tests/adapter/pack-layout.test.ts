import { describe, expect, it } from 'vitest';
import { packCircles } from '../../src/adapters/echarts/pack-layout';

describe('packed bubble layout', () => {
  const radii = [51, 24, 72, 43, 91, 15, 64, 34, 84, 33, 56, 12, 76, 25, 94, 44, 68, 18, 38, 81, 57, 28, 99, 48].map((v) => 8 + Math.sqrt(v) * 3);

  it.each([[430, 200], [300, 300], [200, 120]])('fits every circle inside %sx%s without overlap', (w, h) => {
    const out = packCircles(radii, w, h);
    expect(out.every(Boolean)).toBe(true);
    for (const [i, a] of out.entries()) {
      expect(a!.x - a!.r).toBeGreaterThanOrEqual(-1e-6);
      expect(a!.x + a!.r).toBeLessThanOrEqual(w + 1e-6);
      expect(a!.y - a!.r).toBeGreaterThanOrEqual(-1e-6);
      expect(a!.y + a!.r).toBeLessThanOrEqual(h + 1e-6);
      for (const b of out.slice(i + 1)) expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(a!.r + b!.r - 1e-6);
    }
  });

  it('keeps relative sizes and is deterministic', () => {
    const a = packCircles(radii, 400, 220);
    expect(packCircles(radii, 400, 220)).toEqual(a);
    expect(a[22]!.r).toBeGreaterThan(a[11]!.r); // 99 vs 12
  });
});
