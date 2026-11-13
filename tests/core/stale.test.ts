import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChart } from '../../src/core/chart';

/** COD-M style real-time content, one bucket per update. */
const feed = (n: number, options: Record<string, unknown> = { realtime: true }) => ({
  schemaVersion: '1.0.0', id: 'stale', type: 'line', options,
  contentsData: { timesArr: Array.from({ length: n }, (_, i) => `t${i}`), data: [{ key: 'A', values: Array.from({ length: n }, (_, x) => ({ x, y: x })) }] },
});

describe('live data delay (state.stale)', () => {
  afterEach(() => vi.useRealTimers());

  it('turns stale after 3× the observed update interval (at least 5 s) and clears on new data', async () => {
    vi.useFakeTimers();
    const h = createChart(null, feed(3), {}, { headless: true });
    for (let n = 4; n <= 6; n++) { await vi.advanceTimersByTimeAsync(2000); h.update(feed(n)); }
    await vi.advanceTimersByTimeAsync(5900);
    expect(h.getState().stale).toBeFalsy(); // 3 × 2 s = 6 s not reached yet
    await vi.advanceTimersByTimeAsync(200);
    expect(h.getState().stale).toBe(true);
    expect(typeof h.getState().lastUpdateAt).toBe('number');
    h.update(feed(7));
    await vi.advanceTimersByTimeAsync(50); // the next render publishes it
    expect(h.getState().stale).toBeFalsy();
    h.destroy();
  });

  it('honours an explicit staleAfterMs, and never fires for static or opted-out charts', async () => {
    vi.useFakeTimers();
    const fixed = createChart(null, feed(3, { realtime: true, staleAfterMs: 2000 }), {}, { headless: true });
    const plain = createChart(null, feed(3, {}), {}, { headless: true });
    const off = createChart(null, feed(3, { realtime: true, staleAfterMs: false }), {}, { headless: true });
    for (const h of [plain, off]) { await vi.advanceTimersByTimeAsync(1000); h.update(feed(4, h === off ? { realtime: true, staleAfterMs: false } : {})); }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fixed.getState().stale).toBe(true);
    expect(plain.getState().stale).toBeFalsy();
    expect(off.getState().stale).toBeFalsy();
    [fixed, plain, off].forEach((h) => h.destroy());
  });
});
