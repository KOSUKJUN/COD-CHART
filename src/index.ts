/**
 * @codvil/chart — Vue 3 chart components on Apache ECharts.
 *
 * Importing this entry registers the ECharts adapter with the core runtime.
 * For framework-free use import `@codvil/chart/core` and call
 * `installEChartsAdapter()` yourself.
 */
import { installEChartsAdapter } from './adapters/echarts/adapter';

installEChartsAdapter();

export * from './core';
export { installEChartsAdapter, ECHARTS_VERSION } from './adapters/echarts/adapter';
export * from './vue';
