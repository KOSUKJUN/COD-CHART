import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartDataError, DataController, type DataServices, type StreamSink } from '../../src/core/source';
import type { Row } from '../../src/core/types';


function harness(spec: ConstructorParameters<typeof DataController>[0], services: DataServices) {
  const rows: Row[][] = [];
  const errors: { code: string; message: string; correlationId?: string }[] = [];
  let loading = 0;
  const c = new DataController(spec, services, {
    onRows: (r) => rows.push(r),
    onLoading: () => loading++,
    onError: (e) => errors.push(e),
  });
  return { c, rows, errors, loading: () => loading };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

describe('REST', () => {
  it('ignores stale responses when a newer request wins', async () => {
    const resolvers: ((rows: Row[]) => void)[] = [];
    const fetch = vi.fn(() => new Promise<{ rows: Row[] }>((res) => resolvers.push((rows) => res({ rows }))));
    const h = harness(undefined, { fetch });
    h.c.setSpec({ kind: 'rest', endpointId: 'a' });
    h.c.refresh();
    resolvers[1]!([{ v: 'new' }]);
    resolvers[0]!([{ v: 'old' }]);
    await vi.runAllTimersAsync();
    expect(h.rows).toEqual([[{ v: 'new' }]]);
    h.c.destroy();
  });

  it('passes an AbortSignal and aborts on destroy', async () => {
    let signal: AbortSignal | undefined;
    const h = harness(undefined, { fetch: (req) => ((signal = req.signal), new Promise(() => {})) });
    h.c.setSpec({ kind: 'rest', endpointId: 'a', params: { from: 1 } });
    h.c.destroy();
    expect(signal?.aborted).toBe(true);
  });

  it('polls with chained timeouts and stops after destroy', async () => {
    const fetch = vi.fn(async () => ({ rows: [{ v: 1 }] }));
    const h = harness(undefined, { fetch });
    h.c.setSpec({ kind: 'rest', endpointId: 'a', refresh: { mode: 'poll', intervalMs: 1000 } });
    await vi.advanceTimersByTimeAsync(3500);
    expect(fetch).toHaveBeenCalledTimes(4);
    h.c.destroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('surfaces safe messages and correlation ids, never raw exceptions', async () => {
    const h1 = harness(undefined, { fetch: async () => { throw new Error('SQL syntax near password=hunter2'); } });
    h1.c.setSpec({ kind: 'rest', endpointId: 'a' });
    await vi.runAllTimersAsync();
    expect(h1.errors[0]!.message).not.toMatch(/hunter2|SQL/);
    const h2 = harness(undefined, { fetch: async () => { throw new ChartDataError('forbidden', '권한이 없습니다.', 'req-123'); } });
    h2.c.setSpec({ kind: 'rest', endpointId: 'a' });
    await vi.runAllTimersAsync();
    expect(h2.errors[0]).toEqual({ code: 'forbidden', message: '권한이 없습니다.', correlationId: 'req-123' });
    h1.c.destroy();
    h2.c.destroy();
  });

  it('reports a missing data service', () => {
    const h = harness(undefined, {});
    h.c.setSpec({ kind: 'rest', endpointId: 'a' });
    expect(h.errors[0]!.code).toBe('no-data-service');
  });
});

describe('stream', () => {
  function streamHarness(extra: Partial<DataServices> = {}) {
    let sink: StreamSink | null = null;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((_req, s: StreamSink) => ((sink = s), unsubscribe));
    const h = harness(undefined, { subscribe, ...extra });
    h.c.setSpec({ kind: 'stream', endpointId: 's', windowSize: 5, flushIntervalMs: 100 });
    return { ...h, sink: () => sink!, subscribe, unsubscribe };
  }

  it('coalesces bursts, drops duplicate/out-of-order messages, keeps a window', async () => {
    const h = streamHarness();
    h.sink().next({ type: 'snapshot', sequence: 1, payload: [{ i: 0 }] });
    for (let i = 2; i <= 9; i++) h.sink().next({ type: 'append', sequence: i, payload: [{ i: i - 1 }] });
    h.sink().next({ type: 'append', sequence: 5, payload: [{ i: 'dup' }] });
    h.sink().next({ type: 'heartbeat', sequence: 10 });
    await vi.advanceTimersByTimeAsync(150);
    expect(h.rows).toHaveLength(1); // one render for the whole burst
    expect(h.rows[0]!.map((r) => r.i)).toEqual([4, 5, 6, 7, 8]);
    h.c.destroy();
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it('recovers via REST snapshot and reconnects with backoff after an error', async () => {
    const fetch = vi.fn(async () => ({ rows: [{ i: 'snap' }] }));
    const h = streamHarness({ fetch });
    h.sink().error(new Error('socket closed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(h.rows.at(-1)).toEqual([{ i: 'snap' }]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.subscribe).toHaveBeenCalledTimes(2);
    h.c.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to REST when no stream service exists', async () => {
    const fetch = vi.fn(async () => ({ rows: [{ i: 1 }] }));
    const h = harness(undefined, { fetch });
    h.c.setSpec({ kind: 'stream', endpointId: 's' });
    await vi.runAllTimersAsync();
    expect(h.rows).toEqual([[{ i: 1 }]]);
    h.c.destroy();
  });
});
