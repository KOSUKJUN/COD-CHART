/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', 'src');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
/** Source with comments removed, so prose about forbidden APIs doesn't trip the checks. */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const imports = (file: string) =>
  [...code(file).matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]!);

describe('architecture boundaries', () => {
  it('core never imports Vue or an engine', () => {
    for (const f of files(join(root, 'core'))) {
      for (const i of imports(f)) {
        expect(i, `${f} → ${i}`).not.toMatch(/^(vue|echarts)(\/|$)/);
        expect(i, `${f} → ${i}`).not.toMatch(/\.\.\/(vue|adapters)\//);
      }
    }
  });

  it('the ECharts adapter never imports Vue', () => {
    for (const f of files(join(root, 'adapters'))) for (const i of imports(f)) expect(i, f).not.toMatch(/^vue/);
  });

  it('the Vue layer never imports ECharts directly (only through core contracts)', () => {
    for (const f of files(join(root, 'vue'))) for (const i of imports(f)) expect(i, f).not.toMatch(/^echarts|adapters\//);
  });

  it('no innerHTML / v-html anywhere in the library', () => {
    for (const f of files(root)) expect(code(f), f).not.toMatch(/v-html|innerHTML|outerHTML|insertAdjacentHTML|new Function|\beval\(/);
  });
});
