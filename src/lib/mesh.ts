/**
 * Seeded mesh anchors (ported from f13s core `ui/Mesh.tsx`): the same seed always gives
 * the same four anchor points, so every product/collection tile is unique but stable.
 */
export function meshAnchors(seed: string, tall = false): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = (shift: number, min: number, span: number) => Math.round(min + (((hash >>> shift) & 0xff) / 255) * span);
  const a = tall
    ? [`${n(0, 10, 25)}% ${n(4, 2, 12)}%`, `${n(8, 70, 25)}% ${n(12, 15, 20)}%`, `${n(16, 5, 25)}% ${n(20, 62, 20)}%`, `${n(24, 65, 30)}% ${n(28, 82, 16)}%`]
    : [`${n(0, 5, 25)}% ${n(4, 5, 20)}%`, `${n(8, 70, 25)}% ${n(12, 5, 25)}%`, `${n(16, 5, 30)}% ${n(20, 70, 25)}%`, `${n(24, 65, 30)}% ${n(28, 70, 25)}%`];
  return `--a1:${a[0]};--a2:${a[1]};--a3:${a[2]};--a4:${a[3]}`;
}
