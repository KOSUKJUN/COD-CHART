/**
 * Mock CODVIL data services for the playground. In a real host these map
 * `endpointId` → the authenticated Java/Tomcat API (REST / SSE / WebSocket).
 * The library itself never sees URLs or credentials.
 */
import type { DataServices, StreamMessage } from '../src/core/source';
import type { Row } from '../src/core/types';
import { latencyRows, regionRevenue, rng } from './fixtures';

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

export function createMockServices(): DataServices {
  const r = rng(99);
  return {
    async fetch({ endpointId, signal }) {
      await delay(700 + r() * 500, signal);
      switch (endpointId) {
        case 'revenue.by-region':
          // Simulate fresh numbers on each poll.
          return { rows: regionRevenue.map((x) => ({ ...x, revenue: Math.round((x.revenue as number) * (0.92 + r() * 0.16)) })), meta: { unit: 'KRW' } };
        case 'latency.live':
          return { rows: liveSnapshot() };
        default:
          throw new Error(`unknown endpoint ${endpointId}`);
      }
    },
    subscribe({ endpointId }, sink) {
      if (endpointId !== 'latency.live') {
        queueMicrotask(() => sink.error(new Error('unknown stream')));
        return () => {};
      }
      let seq = 0;
      let last = Date.now();
      sink.next({ type: 'snapshot', sequence: ++seq, payload: liveSnapshot(last) });
      const timer = setInterval(() => {
        last += 60_000;
        const spike = r() > 0.93 ? 160 : 0;
        const msg: StreamMessage = {
          type: 'append', sequence: ++seq, timestamp: new Date().toISOString(),
          payload: [{ timestamp: new Date(last).toISOString(), p50: Math.round(82 + r() * 18), p95: Math.round(215 + r() * 70 + spike) }],
        };
        sink.next(msg);
        if (seq % 5 === 0) sink.next({ type: 'heartbeat', sequence: ++seq });
      }, 1000);
      return () => clearInterval(timer);
    },
  };
}

function liveSnapshot(end = Date.now()): Row[] {
  return latencyRows(60, 13).map((row, i) => ({ ...row, timestamp: new Date(end - (59 - i) * 60_000).toISOString() }));
}
