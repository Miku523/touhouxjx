// NaN/Infinity 探测：用 mock ctx 跑 7 主题，报告任何传给绘制 API 的非法数值坐标
import { drawSky, drawParallax, drawTiles, drawAmbient, THEMES } from './_scenes_probe.mjs';

const bad = new Map();
function note(name, args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'number' && (!Number.isFinite(a))) {
      const k = name + '#' + i;
      bad.set(k, (bad.get(k) || 0) + 1);
    }
    if (Array.isArray(a)) note(name + '[]', a);
  }
}

function mockCtx() {
  const grad = { addColorStop: () => {} };
  const handler = {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'canvas') return { width: 1280, height: 720 };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern')
        return (...a) => { note(String(prop), a); return prop === 'createPattern' ? null : grad; };
      if (prop === 'measureText') return () => ({ width: 10 });
      return (...a) => { note(String(prop), a); };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  };
  return new Proxy({ save(){}, restore(){}, canvas: { width: 1280, height: 720 } }, handler);
}

function mkCanvas(ctx) {
  return { width: 1, height: 1, getContext: () => ctx };
}
globalThis.document = { createElement: () => mkCanvas(mockCtx()) };

function makeLevel(theme) {
  const cols = 90, rows = 22;
  const grid = new Uint8Array(cols * rows);
  for (let x = 0; x < cols; x++) {
    for (let y = 18; y < rows; y++) grid[y * cols + x] = 1;
    grid[18 * cols + x] = 2;
    if (x > 30 && x < 40) for (let y = 15; y < 18; y++) grid[y * cols + x] = 1;
    if (x > 50 && x < 56) grid[17 * cols + x] = 3;
    if (x > 60 && x < 64) grid[16 * cols + x] = 4;
    if (x > 66 && x < 68) grid[17 * cols + x] = 5;
    if (x > 70 && x < 74) grid[17 * cols + x] = 6;
    if (x > 76 && x < 80) grid[16 * cols + x] = 7;
    if (x > 82 && x < 86) grid[17 * cols + x] = 8;
    grid[17 * cols + (x === 88 ? 88 : 0)] = 9;
    grid[17 * cols + 88] = 9;
  }
  return {
    theme, cols, rows,
    tileAt(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
      return grid[cy * cols + cx];
    },
  };
}

for (const key of Object.keys(THEMES)) {
  const ctx = mockCtx();
  const cam = { x: 640, y: 120, view: { x: 640, y: 120 } };
  const lvl = makeLevel(key);
  drawSky(ctx, key, { x: 0, y: 0 }, 12.5);
  drawParallax(ctx, key, cam, 12.5);
  drawTiles(ctx, lvl, cam, 12.5);
  drawAmbient(ctx, key, cam, 12.5);
  // 极端相机
  drawParallax(ctx, key, { x: -5000, y: -400 }, 90);
  drawTiles(ctx, lvl, { x: 2000, y: 300 }, 90);
}

console.log(bad.size ? [...bad.entries()].map(([k, v]) => k + ' x' + v).join('\n') : 'no NaN/Infinity');
