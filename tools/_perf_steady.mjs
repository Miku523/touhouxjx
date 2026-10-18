// 稳态每帧调用数（第 2 次调用，跳过一次性烘焙）
let ops = 0, fills = 0, strokes = 0, images = 0;
function makeCtx() {
  const target = {
    canvas: { width: 1280, height: 720 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    save() { ops++; }, restore() { ops++; },
    fill() { ops++; fills++; }, stroke() { ops++; strokes++; }, drawImage() { ops++; images++; },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^(fill|stroke|clip|draw|begin|close|move|line|quadratic|bezier|arc|ellipse|rect|set|scale|translate|rotate|create)/.test(k)) return () => { ops++; };
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }) };
const m = await import('./_scenes_probe.mjs');
const cols = 80, rows = 22;
const grid = new Uint8Array(cols * rows).fill(1);
for (let i = 0; i < cols; i++) { grid[i] = 2; grid[cols + i] = 2; }
const level = { cols, rows, tileAt(cx, cy) { if (cx < 0 || cx >= cols) return 1; if (cy < 0 || cy >= rows) return 0; return grid[cy * cols + cx]; } };
const cam = { x: 300, y: 0 };
function measure(fn) { ops = 0; fills = 0; strokes = 0; images = 0; fn(); return { ops, fills, strokes, images }; }
for (const theme of Object.keys(m.THEMES)) {
  const ctx = makeCtx();
  for (let w = 0; w < 2; w++) { m.drawSky(ctx, theme, cam, 1.2); m.drawParallax(ctx, theme, cam, 1.2); m.drawTiles(ctx, { ...level, theme }, cam, 1.2); m.drawAmbient(ctx, theme, cam, 1.2); }
  let t = { ops: 0, fills: 0, strokes: 0, images: 0 };
  for (const fn of [
    () => m.drawSky(ctx, theme, cam, 1.25),
    () => m.drawParallax(ctx, theme, cam, 1.25),
    () => m.drawTiles(ctx, { ...level, theme }, cam, 1.25),
    () => m.drawAmbient(ctx, theme, cam, 1.25),
  ]) { const r = measure(fn); t.ops += r.ops; t.fills += r.fills; t.strokes += r.strokes; t.images += r.images; }
  console.log(theme.padEnd(9), 'ops', String(t.ops).padStart(6), 'fills', String(t.fills).padStart(5), 'strokes', String(t.strokes).padStart(5), 'images', String(t.images).padStart(4));
}
