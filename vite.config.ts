import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: {
      '@codvil/chart/core': src('./src/core/index.ts'),
      '@codvil/chart': src('./src/index.ts'),
    },
  },
  build:
    mode === 'lib'
      ? {
          outDir: 'dist',
          emptyOutDir: false,
          sourcemap: true,
          cssCodeSplit: false,
          lib: {
            entry: { 'codvil-chart': src('./src/index.ts'), core: src('./src/core/index.ts') },
            formats: ['es'],
          },
          rolldownOptions: {
            // Consumers bring their own Vue and ECharts (peer dependencies).
            external: [/^vue$/, /^echarts(\/.*)?$/],
            output: { assetFileNames: 'codvil-chart[extname]' },
          },
        }
      : { outDir: 'dist-demo' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
}));
