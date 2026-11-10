import type { DataSourceSpec, Row } from './types';

/**
 * Host-provided data services. The library never builds URLs, holds credentials,
 * or talks to a database — the host maps an allow-listed `endpointId` onto its own
 * authenticated CODVIL API client (REST / SSE / WebSocket).
 */
export interface DataServices {
  fetch?(request: FetchRequest): Promise<FetchResponse>;
  subscribe?(request: StreamRequest, sink: StreamSink): Unsubscribe;
}

export interface FetchRequest {
  endpointId: string;
  params: Record<string, string | number | boolean>;
  signal: AbortSignal;
}

export interface FetchResponse {
  rows: Row[];
  meta?: { unit?: string; timezone?: string; generatedAt?: string; [k: string]: unknown };
}

export interface StreamRequest {
  endpointId: string;
  params: Record<string, string | number | boolean>;
  transport: 'sse' | 'websocket';
  /** Last applied sequence, for server-side resume (SSE Last-Event-ID). */
  lastSequence: number | null;
}

/** Versioned stream envelope (spec §5). */
export interface StreamMessage {
  v?: 1;
  type: 'snapshot' | 'append' | 'heartbeat';
  sequence: number;
  timestamp?: string;
  payload?: Row[];
}

export interface StreamSink {
  next(message: StreamMessage): void;
  error(error: unknown): void;
}

export type Unsubscribe = () => void;

/** Errors the host may throw to give users a safe message + a trace id. */
export class ChartDataError extends Error {
  constructor(public readonly code: string, message: string, public readonly correlationId?: string) {
    super(message);
    this.name = 'ChartDataError';
  }
}

export interface DataControllerCallbacks {
  onRows(rows: Row[], info: { reason: 'initial' | 'refresh' | 'stream'; meta?: FetchResponse['meta'] }): void;
  onLoading(): void;
  onError(error: { code: string; message: string; correlationId?: string }): void;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export const STREAM_DEFAULTS = { windowSize: 5000, flushIntervalMs: 250, hiddenGraceMs: 15_000, maxBackoffMs: 30_000 } as const;

/** Never surface raw exception text (may contain internals); map to a safe message. */
export function toSafeError(e: unknown): { code: string; message: string; correlationId?: string } {
  if (e instanceof ChartDataError) return { code: e.code, message: e.message, correlationId: e.correlationId };
  if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return { code: 'aborted', message: '요청이 취소되었습니다.' };
  return { code: 'data-unavailable', message: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.' };
}

/**
 * Owns every timer, request and subscription for one chart. `destroy()` releases all.
 */
export class DataController {
  private abort: AbortController | null = null;
  private requestSeq = 0;
  private pollTimer: unknown = null;
  private flushTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private hiddenTimer: unknown = null;
  private unsubscribe: Unsubscribe | null = null;
  private lastSequence: number | null = null;
  private buffer: Row[] = [];
  private pendingReplace = false;
  private streamRows: Row[] = [];
  private attempts = 0;
  private destroyed = false;
  private hidden = false;
  private stalePoll = false;
  private lastUpdateAt = 0;
  /** Exponential moving average of ms between data updates (feeds the motion policy). */
  updateIntervalMs: number | undefined;
  private readonly onVisibility = () => this.handleVisibility();

  constructor(
    private spec: DataSourceSpec | undefined,
    private readonly services: DataServices,
    private readonly cb: DataControllerCallbacks,
    private readonly scheduler: Scheduler = defaultScheduler,
  ) {}

  get kind(): DataSourceSpec['kind'] {
    return this.spec?.kind ?? 'static';
  }

  /** Begin observing page visibility. The source itself starts on `setSpec`. */
  start(): void {
    if (this.destroyed || this.started) return;
    this.started = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.hidden = document.visibilityState === 'hidden';
    }
  }
  private started = false;

  /** Replace the data source spec (definition change). Restarts only if it differs. */
  setSpec(spec: DataSourceSpec | undefined): void {
    if (JSON.stringify(spec) === JSON.stringify(this.spec)) return;
    this.stopAll();
    this.spec = spec;
    this.lastSequence = null;
    this.streamRows = [];
    if (spec?.kind === 'rest') void this.fetchOnce('initial');
    else if (spec?.kind === 'stream') this.startStream();
  }

  refresh(): void {
    if (this.spec?.kind === 'rest') void this.fetchOnce('refresh');
    else if (this.spec?.kind === 'stream') void this.snapshotFallback();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAll();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  // ── REST ──────────────────────────────────────────────────────────────

  private async fetchOnce(reason: 'initial' | 'refresh'): Promise<void> {
    const spec = this.spec;
    if (this.destroyed || spec?.kind !== 'rest') return;
    if (!this.services.fetch) {
      this.cb.onError({ code: 'no-data-service', message: '데이터 서비스가 구성되지 않았습니다.' });
      return;
    }
    this.clearPoll();
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const id = ++this.requestSeq;
    if (reason === 'initial') this.cb.onLoading();
    try {
      const res = await this.services.fetch({ endpointId: spec.endpointId, params: { ...spec.params }, signal: abort.signal });
      // Ignore stale responses: a newer request started, or we were destroyed.
      if (this.destroyed || id !== this.requestSeq) return;
      this.markUpdate();
      this.cb.onRows(Array.isArray(res?.rows) ? res.rows : [], { reason, meta: res?.meta });
    } catch (e) {
      if (this.destroyed || id !== this.requestSeq) return;
      const err = toSafeError(e);
      if (err.code !== 'aborted') this.cb.onError(err);
    } finally {
      if (!this.destroyed && id === this.requestSeq) this.schedulePoll();
    }
  }

  private schedulePoll(): void {
    const spec = this.spec;
    if (spec?.kind !== 'rest' || spec.refresh?.mode !== 'poll') return;
    this.clearPoll();
    this.pollTimer = this.scheduler.setTimeout(() => {
      this.pollTimer = null;
      // Don't poll hidden tabs; refetch as soon as the tab becomes visible.
      if (this.hidden) this.stalePoll = true;
      else void this.fetchOnce('refresh');
    }, spec.refresh.intervalMs);
  }

  private clearPoll(): void {
    if (this.pollTimer !== null) this.scheduler.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  // ── Stream ────────────────────────────────────────────────────────────

  private startStream(): void {
    const spec = this.spec;
    if (this.destroyed || spec?.kind !== 'stream') return;
    if (!this.services.subscribe) {
      // Degrade gracefully to a REST snapshot when streaming isn't wired.
      if (this.services.fetch) void this.snapshotFallback();
      else this.cb.onError({ code: 'no-stream-service', message: '실시간 데이터 서비스가 구성되지 않았습니다.' });
      return;
    }
    if (this.streamRows.length === 0) this.cb.onLoading();
    try {
      this.unsubscribe = this.services.subscribe(
        { endpointId: spec.endpointId, params: { ...spec.params }, transport: spec.transport ?? 'sse', lastSequence: this.lastSequence },
        { next: (m) => this.onMessage(m), error: (e) => this.onStreamError(e) },
      );
    } catch (e) {
      this.onStreamError(e);
    }
  }

  private onMessage(m: StreamMessage): void {
    if (this.destroyed || !m || typeof m.sequence !== 'number') return;
    // Drop duplicates and out-of-order messages.
    if (this.lastSequence !== null && m.sequence <= this.lastSequence) return;
    this.lastSequence = m.sequence;
    this.attempts = 0;
    if (m.type === 'heartbeat') return;
    const rows = Array.isArray(m.payload) ? m.payload : [];
    if (m.type === 'snapshot') {
      this.buffer = rows.slice();
      this.pendingReplace = true;
    } else this.buffer.push(...rows);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    const spec = this.spec;
    const interval = spec?.kind === 'stream' ? spec.flushIntervalMs ?? STREAM_DEFAULTS.flushIntervalMs : 0;
    const since = Date.now() - this.lastUpdateAt;
    this.flushTimer = this.scheduler.setTimeout(() => this.flush(), Math.max(0, interval - since));
  }

  /** Coalesce a burst of messages into one render. */
  private flush(): void {
    this.flushTimer = null;
    if (this.destroyed) return;
    const spec = this.spec;
    const windowSize = spec?.kind === 'stream' ? spec.windowSize ?? STREAM_DEFAULTS.windowSize : STREAM_DEFAULTS.windowSize;
    const next = this.pendingReplace ? this.buffer : this.streamRows.concat(this.buffer);
    this.pendingReplace = false;
    this.buffer = [];
    this.streamRows = next.length > windowSize ? next.slice(next.length - windowSize) : next;
    this.markUpdate();
    this.cb.onRows(this.streamRows, { reason: 'stream' });
  }

  private onStreamError(e: unknown): void {
    if (this.destroyed) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const err = toSafeError(e);
    // Recover with a REST snapshot while we back off and reconnect.
    if (this.services.fetch) void this.snapshotFallback();
    else if (this.streamRows.length === 0) this.cb.onError(err);
    const base = Math.min(STREAM_DEFAULTS.maxBackoffMs, 1000 * 2 ** this.attempts++);
    const delay = base / 2 + Math.random() * (base / 2); // jitter
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.hidden) this.startStream();
    }, delay);
  }

  private async snapshotFallback(): Promise<void> {
    const spec = this.spec;
    if (spec?.kind !== 'stream' || !this.services.fetch) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const id = ++this.requestSeq;
    try {
      const res = await this.services.fetch({ endpointId: spec.endpointId, params: { ...spec.params }, signal: abort.signal });
      if (this.destroyed || id !== this.requestSeq) return;
      const windowSize = spec.windowSize ?? STREAM_DEFAULTS.windowSize;
      const rows = Array.isArray(res?.rows) ? res.rows : [];
      this.streamRows = rows.slice(-windowSize);
      this.markUpdate();
      this.cb.onRows(this.streamRows, { reason: 'refresh', meta: res?.meta });
    } catch (e) {
      if (this.destroyed || id !== this.requestSeq) return;
      const err = toSafeError(e);
      if (err.code !== 'aborted' && this.streamRows.length === 0) this.cb.onError(err);
    }
  }

  // ── Visibility ────────────────────────────────────────────────────────

  private handleVisibility(): void {
    this.hidden = document.visibilityState === 'hidden';
    if (this.spec?.kind === 'rest' && !this.hidden && this.stalePoll) {
      this.stalePoll = false;
      void this.fetchOnce('refresh');
    }
    if (this.spec?.kind === 'stream') {
      if (this.hidden) {
        // Release the server subscription if the tab stays hidden.
        this.hiddenTimer = this.scheduler.setTimeout(() => {
          this.hiddenTimer = null;
          this.unsubscribe?.();
          this.unsubscribe = null;
        }, STREAM_DEFAULTS.hiddenGraceMs);
      } else {
        if (this.hiddenTimer !== null) this.scheduler.clearTimeout(this.hiddenTimer);
        this.hiddenTimer = null;
        if (!this.unsubscribe && this.reconnectTimer === null) this.startStream();
      }
    }
  }

  private markUpdate(): void {
    const now = Date.now();
    if (this.lastUpdateAt) {
      const d = now - this.lastUpdateAt;
      this.updateIntervalMs = this.updateIntervalMs === undefined ? d : this.updateIntervalMs * 0.7 + d * 0.3;
    }
    this.lastUpdateAt = now;
  }

  private stopAll(): void {
    this.abort?.abort();
    this.abort = null;
    this.requestSeq++;
    this.clearPoll();
    for (const t of [this.flushTimer, this.reconnectTimer, this.hiddenTimer]) if (t !== null) this.scheduler.clearTimeout(t);
    this.flushTimer = this.reconnectTimer = this.hiddenTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.buffer = [];
  }
}
