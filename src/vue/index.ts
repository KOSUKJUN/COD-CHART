import type { App, Plugin } from 'vue';
import './styles.css';
import CvChart from './CvChart.vue';
import { CODVIL_CHART_CONFIG, type CodvilChartConfig } from './context';

export { CvChart };
export { default as CvMarkdown } from './widgets/Markdown';
export { useChart, type UseChartOptions, type UseChartReturn } from './useChart';
export { useChartConfig, CODVIL_CHART_CONFIG, type CodvilChartConfig } from './context';

/**
 * Optional plugin: app-wide defaults (locale, theme, motion, data services).
 * Nothing is registered globally unless `registerComponents: true`.
 */
export function createCodvilChart(config: CodvilChartConfig = {}): Plugin {
  return {
    install(app: App) {
      app.provide(CODVIL_CHART_CONFIG, config);
      if (config.registerComponents) app.component('CvChart', CvChart);
    },
  };
}
