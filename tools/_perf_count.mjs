// 统计每个主题每帧的 Canvas2D 调用次数，用于性能估算（不依赖浏览器）
let depth = 0, maxDepth = 0, ops = 0, fills = 0, strokes = 0, images = 0, gradients = 0;
const GRAD = { addColorStop() {} };
function makeCtx() {
  const target = {
    canvas: { width: 1280, height: 720 },
    createLinearGradient: () => { gradients++; return GRAD; },
    createRadialGradient: () => { gradients++; return GRAD; },
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    save() { ops++; depth++; if (depth > maxDepth) maxDepth = depth; },
    restore() { ops++; depth--; },
    fill() { ops++; fills++; },
    stroke() { ops++; strokes++; },
    drawImage() { ops++; images++; },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^(fill|stroke|clip|draw|begin|close|move|line|quadratic|bezier|arc|ellipse|rect|roundRect|set|scale|translate|rotate|transform|reset|put|get|create|is)/.test(k)) {
        return () => { ops++; };
      }
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }) };
globalThis.window = { devicePixelRatio: 1 };

const m = await import('./_scenes_probe.mjs');
const cols = 80, rows = 22;
const grid = new Uint8Array(cols * rows).fill(1);
for (let i = 0; i < cols; i++) { grid[i] = 2; grid[cols + i] = 2; }
for (const [x, y, v] of [[10, 12, 3], [11, 12, 4], [12, 12, 5], [13, 12, 6], [14, 12, 8], [15, 12, 9], [20, 12, 7]]) grid[y * cols + x] = v;
const level = {
  cols, rows, w: cols * 32, h: rows * 32, grid,
  tileAt(cx, cy) {
    if (cx < 0 || cx >= cols) return 1;
    if (cy < 0 || cy >= rows) return 0;
    return grid[cy * cols + cx];
  },
};
const cam = { x: 300, y: 0 };

function measure(fn) {
  ops = 0; fills = 0; strokes = 0; images = 0; gradients = 0; depth = 0; maxDepth = 0;
  fn();
  return { ops, fills, strokes, images, gradients, maxDepth };
}

const rowsOut = [];
for (const theme of Object.keys(m.THEMES)) {
  const ctx = makeCtx();
  const fps = [];
  const sky = measure(() => m.drawSky(ctx, theme, cam, 1.23));
  const para = measure(() => m.drawParallax(ctx, theme, cam, 1.23));
  const tiles = measure(() => m.drawTiles(ctx, { ...level, theme }, cam, 1.23));
  const amb = measure(() => m.drawAmbient(ctx, theme, cam, 1.23));
  const total = sky.ops + para.ops + tiles.ops + amb.ops;
  rowsOut.push({ theme, sky: sky.ops, para: para.ops, tiles: tiles.ops, amb: amb.ops, total, gradients: sky.gradients + para.gradients + tiles.gradients, images: sky.images + para.images + tiles.images + amb.images, maxDepth: Math.max(sky.maxDepth, para.maxDepth, tiles.maxDepth, amb.maxDepth), fills: sky.fills + para.fills + tiles.fills + amb.fills, strokes: sky.strokes + para.strokes + tiles.strokes + amb.strokes });
}

console.log('theme      sky   para  tiles  amb   TOTAL  fills strokes img grad  depth');
for (const r of rowsOut) {
  console.log(
    r.theme.padEnd(10),
    String(r.sky).padStart(4), String(r.para).padStart(6), String(r.tiles).padStart(6),
    String(r.amb).padStart(5), String(r.total).padStart(7), String(r.fills).padStart(6),
    String(r.strokes).padStart(8), String(r.images).padStart(4), String(r.gradients).padStart(5),
    String(r.maxDepth).padStart(6)
  );
}
