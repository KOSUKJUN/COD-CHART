import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateChartDefinition } from '../../src/core/schema';

const markdown = readFileSync('docs/manual/COD-CHART-Contents-ko.md', 'utf8');
const examples = Array.from(markdown.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g), (match) => JSON.parse(match[1]!));

describe('chart contents reference examples', () => {
  it('documents all 22 chart views', () => expect(examples).toHaveLength(22));
  it.each(examples)('validates $id', (definition) => {
    const result = validateChartDefinition(definition);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
