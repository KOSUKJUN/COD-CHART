import { inject, type App, type InjectionKey } from 'vue';
import type { ChartServices } from '../core/chart';

export interface CodvilChartConfig extends ChartServices {
  /** Register <CvChart> globally. Default false — import it where used. */
  registerComponents?: boolean;
}

export const CODVIL_CHART_CONFIG: InjectionKey<CodvilChartConfig> = Symbol('codvil-chart-config');

/** Optional root defaults (locale, theme, motion, data services). Never required. */
export function useChartConfig(): CodvilChartConfig {
  return inject(CODVIL_CHART_CONFIG, {});
}

export function provideChartConfig(app: App, config: CodvilChartConfig): void {
  app.provide(CODVIL_CHART_CONFIG, config);
}
