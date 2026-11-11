/**
 * Tree-shaken ECharts runtime: only the charts/components the catalog uses are
 * bundled. Add modules here when a new catalog type needs them.
 */
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, CandlestickChart, CustomChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts';
import {
  AriaComponent, DataZoomInsideComponent, DataZoomSliderComponent, GridComponent, LegendScrollComponent,
  MarkLineComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
// Plain locale object (UMD/CJS). The self-registering langKO.js is avoided because it
// require()s a second copy of echarts/lib/echarts.
import * as langKOModule from 'echarts/i18n/langKO-obj.js';

echarts.use([
  BarChart, BoxplotChart, CandlestickChart, CustomChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, TreemapChart,
  AriaComponent, DataZoomInsideComponent, DataZoomSliderComponent, GridComponent, LegendScrollComponent,
  MarkLineComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent,
  LabelLayout, UniversalTransition, CanvasRenderer, SVGRenderer,
]);

const langKO = (langKOModule as { default?: object }).default ?? langKOModule;
if (langKO && typeof langKO === 'object' && 'time' in langKO) echarts.registerLocale('KO', langKO as Parameters<typeof echarts.registerLocale>[1]);

export { echarts };
export const ECHARTS_VERSION: string = echarts.version;
