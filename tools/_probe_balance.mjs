let depth = 0, maxDepth = 0;
const gradient = { addColorStop() {} };
function makeCtx() {
  const target = {
    canvas: { width: 1280, height: 720 },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    save() { depth++; if (depth > maxDepth) maxDepth = depth; },
    restore() { depth--; },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^(fill|stroke|clip|draw|begin|close|move|line|quadratic|bezier|arc|ellipse|rect|roundRect|set|scale|translate|rotate|transform|reset|put|get|create|is)/.test(k)) {
        return () => (k === 'createLinearGradient' || k === 'createRadialGradient' ? gradient : undefined);
      }
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
};
globalThis.window = { devicePixelRatio: 1 };

const m = await import('./_scenes_probe.mjs');

const cols = 80, rows = 22;
const grid = new Uint8Array(cols * rows).fill(1);
for (let i = 0; i < cols; i++) grid[i] = 2;
for (let i = 8; i < 14; i++) grid[15 * cols + i] = 2;
for (const [x, y, v] of [[10, 10, 3], [11, 10, 4], [12, 10, 5], [13, 10, 6], [14, 10, 8], [15, 10, 9], [20, 10, 7], [25, 10, 4], [30, 10, 3]]) {
  grid[y * cols + x] = v;
}
const level = {
  theme: 'shrine', cols, rows, w: cols * 32, h: rows * 32, grid,
  tileAt(cx, cy) {
    if (cx < 0 || cx >= cols) return 1;
    if (cy < 0 || cy >= rows) return 0;
    return grid[cy * cols + cx];
  },
};
const cam = { x: 300, y: 0 };
const themes = Object.keys(m.THEMES);

for (const theme of themes) {
  const ctx = makeCtx();
  depth = 0;
  m.drawSky(ctx, theme, cam, 1.23);
  const dSky = depth;
  m.drawParallax(ctx, theme, cam, 1.23);
  const dPara = depth;
  m.drawTiles(ctx, { ...level, theme }, cam, 1.23);
  const dTiles = depth;
  m.drawAmbient(ctx, theme, cam, 1.23);
  const dAmb = depth;
  console.log(theme.padEnd(9), 'sky', dSky, 'parallax', dPara, 'tiles', dTiles, 'ambient', dAmb, 'maxDepth', maxDepth);
}
