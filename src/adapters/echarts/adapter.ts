import type { AdapterEvent, ExportOptions, RenderContext, RendererAdapter } from '../../core/adapter';
import { registerAdapter } from '../../core/adapter';
import type { RendererChoice } from '../../core/types';
import { buildOption, type BuildResult, type Opt, type SlotMap } from './build';
import { echarts } from './runtime';

type Instance = ReturnType<typeof echarts.init>;

/**
 * Owns exactly one ECharts instance. The native instance and option never leave
 * this module; consumers get normalised CODVIL events only.
 */
export class EChartsAdapter implements RendererAdapter {
  private chart: Instance | null = null;
  private listeners = new Set<(e: AdapterEvent) => void>();
  private last: BuildResult | null = null;
  private ctx: RenderContext | null = null;
  /** Entity → colour slot, persisted across updates so colours follow entities. */
  private readonly slots: SlotMap = new Map();
  warnings: string[] = [];

  constructor(private readonly renderer: RendererChoice) {}

  mount(el: HTMLElement, ctx: RenderContext): void {
    if (this.chart) this.destroy();
    this.chart = echarts.init(el, null, {
      renderer: this.renderer,
      locale: ctx.locale.toLowerCase().startsWith('ko') ? 'KO' : 'EN',
      // Partial canvas repaints can erase other chart elements on selection.
      useDirtyRect: false,
    });
    this.bindEvents();
    this.render(ctx, true);
  }

  update(ctx: RenderContext, structural: boolean): void {
    if (!this.chart) return;
    this.render(ctx, structural);
  }

  private render(ctx: RenderContext, structural: boolean): void {
    this.ctx = ctx;
    const result = buildOption({ ...ctx, slots: this.slots });
    this.last = result;
    this.warnings = result.warnings;
    // Structural changes replace the option; data-only updates merge, which lets
    // ECharts tween values instead of re-entering every mark.
    this.chart!.setOption(result.option, structural ? { notMerge: true } : { replaceMerge: ['series'], lazyUpdate: true });
  }

  resize(width?: number, height?: number): void {
    if (!this.chart) return;
    this.chart.resize({
      width: width ?? 'auto',
      height: height ?? 'auto',
      // Re-layout instantly: animating a resize interrupts in-flight entrance/update tweens.
      animation: { duration: 0 },
    });
  }

  onEvent(listener: (e: AdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  exportImage(options: ExportOptions = {}): string | null {
    if (!this.chart) return null;
    const type = options.type ?? 'png';
    if (type === 'svg' && this.renderer !== 'svg') return null;
    return this.chart.getDataURL({
      type,
      pixelRatio: options.pixelRatio ?? 2,
      backgroundColor: options.background ?? this.ctx?.theme.tokens.bgSurface,
      excludeComponents: ['dataZoom'],
    });
  }

  destroy(): void {
    if (!this.chart) return;
    this.chart.off();
    this.chart.dispose();
    this.chart = null;
    this.last = null;
    this.listeners.clear();
  }

  private emit(e: AdapterEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private bindEvents() {
    const chart = this.chart!;
    chart.on('click', (raw: unknown) => {
      const p = raw as Opt;
      if (p.componentType !== 'series' || p.seriesName === '__center') return;
      if (p.seriesType === 'treemap' || (p.seriesType === 'sunburst' && this.last?.nodeRows)) {
        const id = p.data?.id as string | undefined;
        const rows = id ? this.last?.nodeRows?.get(id) : undefined;
        this.emit({ type: 'point.click', name: p.name, value: p.value, rows, row: rows?.[0], path: pathFromInfo(p.treePathInfo) });
        return;
      }
      const hit = this.last?.lookup(p.seriesIndex, p.dataIndex);
      if (this.ctx?.definition.type === 'gauge-group' && !hit) return;
      this.emit({ type: 'point.click', seriesName: hit?.name ?? p.seriesName, name: p.name, value: hit?.value ?? p.value, row: hit?.row, rows: hit?.rows });
    });
    chart.on('legendselectchanged', (raw: unknown) => {
      const p = raw as Opt;
      this.emit({ type: 'legend.toggle', name: p.name, selected: { ...(p.selected as Record<string, boolean>) } });
    });
    chart.on('datazoom', () => {
      const dz = (chart.getOption() as Opt).dataZoom?.[0];
      if (dz) this.emit({ type: 'zoom.change', range: { start: dz.start, end: dz.end } });
    });
    const onDrill = (raw: unknown) => this.emit({ type: 'drill.change', path: pathFromNode((raw as Opt).targetNode) });
    chart.on('treemapzoomtonode', onDrill);
    chart.on('treemaproottonode', onDrill);
  }
}

function pathFromInfo(info: unknown): string[] {
  return Array.isArray(info) ? info.slice(1).map((n: { name?: unknown }) => String(n?.name ?? '')) : [];
}

/** Walk TreeNode.parentNode defensively (internal ECharts structure). */
function pathFromNode(node: unknown): string[] {
  const path: string[] = [];
  let n = node as { name?: unknown; parentNode?: unknown; depth?: number } | null;
  for (let guard = 0; n && guard < 32; guard++) {
    if (n.parentNode) path.unshift(String(n.name ?? ''));
    n = n.parentNode as typeof n;
  }
  return path;
}

export function installEChartsAdapter(): void {
  registerAdapter('echarts', (renderer) => new EChartsAdapter(renderer));
}

export { ECHARTS_VERSION } from './runtime';
