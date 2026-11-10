import { describe, expect, it } from 'vitest';
import { layoutWords } from '../../src/adapters/echarts/word-layout';
import { contentsDefinitions } from '../../playground/contents-fixtures';

describe('word cloud layout', () => {
  it.each([[640, 340], [340, 340], [240, 180]])('places all sample words without overlapping at %sx%s', (width, height) => {
    const def = contentsDefinitions.find(d => d.id === 'contents-word-cloud');
    if (!def || def.type !== 'word-cloud') throw new Error('Missing word cloud sample');
    const words = def.contentsData.map(w => ({ text: w.name, weight: Number(w.weight) }));
    const positions = layoutWords(words, width, height);
    expect(positions).toHaveLength(words.length);
    expect(positions.every(Boolean)).toBe(true);
    expect(positions.some(p => p?.rotate)).toBe(true);
    for (const [i, p] of positions.entries()) {
      expect(p!.x - p!.width / 2).toBeGreaterThanOrEqual(0);
      expect(p!.x + p!.width / 2).toBeLessThanOrEqual(width);
      expect(p!.y - p!.height / 2).toBeGreaterThanOrEqual(0);
      expect(p!.y + p!.height / 2).toBeLessThanOrEqual(height);
      for (const q of positions.slice(i + 1)) {
        expect(Math.abs(p!.x - q!.x) >= (p!.width + q!.width) / 2 ||
          Math.abs(p!.y - q!.y) >= (p!.height + q!.height) / 2).toBe(true);
      }
    }
    const biggest = words.findIndex(w => w.weight === Math.max(...words.map(x => x.weight)));
    expect(positions[biggest]!.fontSize).toBeGreaterThan(positions[words.length - 1]!.fontSize);
  });
});
