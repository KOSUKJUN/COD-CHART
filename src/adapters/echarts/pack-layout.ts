/**
 * Deterministic circle packing for the packed-bubble form (COD-M "packedbubble").
 * Circles are placed largest first, each at the free tangent position closest to the
 * centre, then the whole cluster is scaled to fit the box. Pure; no DOM.
 */
export interface PackedCircle {
  x: number;
  y: number;
  r: number;
}

const GAP = 2;
const ANGLES = 48;

export function packCircles(radii: number[], width: number, height: number, padding = 6): (PackedCircle | undefined)[] {
  if (!radii.length || width <= 0 || height <= 0) return radii.map(() => undefined);
  const order = radii.map((r, i) => ({ r: Math.max(1, r), i })).sort((a, b) => b.r - a.r || a.i - b.i);
  const placed: { x: number; y: number; r: number; i: number }[] = [];
  const free = (x: number, y: number, r: number) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP - 1e-6);
  for (const { r, i } of order) {
    if (!placed.length) { placed.push({ x: 0, y: 0, r, i }); continue; }
    let best: { x: number; y: number; d: number } | null = null;
    for (const p of placed) {
      for (let k = 0; k < ANGLES; k++) {
        const a = (k / ANGLES) * Math.PI * 2;
        const x = p.x + Math.cos(a) * (p.r + r + GAP);
        // Slightly flattened vertically: dashboard panels are wider than tall.
        const y = p.y + Math.sin(a) * (p.r + r + GAP);
        const d = Math.hypot(x, y * 1.6);
        if ((!best || d < best.d) && free(x, y, r)) best = { x, y, d };
      }
    }
    placed.push({ ...(best ?? { x: 0, y: 0 }), r, i });
  }
  const minX = Math.min(...placed.map((p) => p.x - p.r)), maxX = Math.max(...placed.map((p) => p.x + p.r));
  const minY = Math.min(...placed.map((p) => p.y - p.r)), maxY = Math.max(...placed.map((p) => p.y + p.r));
  const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY), 1.6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const out: (PackedCircle | undefined)[] = new Array(radii.length);
  for (const p of placed) out[p.i] = { x: width / 2 + (p.x - cx) * scale, y: height / 2 + (p.y - cy) * scale, r: p.r * scale };
  return out;
}
