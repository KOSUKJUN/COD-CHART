import { describe, expect, it } from 'vitest';
import { countFrame, isCountable } from '../../src/adapters/echarts/count-up';

describe('tooltip count-up', () => {
  it('interpolates every number while keeping text, grouping and decimals', () => {
    expect(countFrame('1,234 건', 0.5)).toBe('617 건');
    expect(countFrame('112 건 · 11.18%', 0.5)).toBe('56 건 · 5.59%');
    expect(countFrame('1,002', 0)).toBe('0');
    expect(countFrame('1,234 건', 1)).toBe('1,234 건');
  });

  it('leaves dates, times and wordless text alone', () => {
    expect(isCountable('2024-01-01')).toBe(false);
    expect(isCountable('17:05')).toBe(false);
    expect(isCountable('—')).toBe(false);
    expect(isCountable('1,234 건')).toBe(true);
    expect(isCountable('1,234 건')).toBe(true); // stateless across calls
  });
});
