import type { ResolvedMotion } from './animation';
import type { ResolvedTheme } from './theme';
import type { ChartDefinition, ChartEventPayload, EngineId, RendererChoice, Row } from './types';

export interface RenderContext {
  definition: ChartDefinition;
  rows: Row[];
  theme: ResolvedTheme;
  motion: ResolvedMotion;
  locale: string;
  /** Plain-language summary for aria-label. */
  summary: string;
}

export type AdapterEvent = Omit<ChartEventPayload, 'chartId'>;

export interface ExportOptions {
  type?: 'png' | 'svg';
  pixelRatio?: number;
  background?: string;
}

/**
 * Engine adapters own exactly one engine instance: create / update / resize /
 * subscribe / destroy. They never expose the native instance or option object.
 */
export interface RendererAdapter {
  mount(el: HTMLElement, ctx: RenderContext): void;
  /** `structural` = definition changed (not just data) → no merge with previous option. */
  update(ctx: RenderContext, structural: boolean): void;
  resize(width?: number, height?: number): void;
  onEvent(listener: (event: AdapterEvent) => void): () => void;
  exportImage?(options?: ExportOptions): string | null;
  /** Non-fatal notices produced while building the render (e.g. series folded). */
  readonly warnings?: string[];
  destroy(): void;
}

export type AdapterFactory = (renderer: RendererChoice) => RendererAdapter;

const adapters = new Map<EngineId, AdapterFactory>();

/** Engines are plugged in from outside core so core never imports an engine. */
export function registerAdapter(engine: EngineId, factory: AdapterFactory): void {
  adapters.set(engine, factory);
}

export function getAdapterFactory(engine: EngineId): AdapterFactory | undefined {
  return adapters.get(engine);
}
