import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9435, headless: true });
await T.boot({ query: '?v=fgtime' + Date.now(), waitTitle: 15000 });
await T.eval(`(async () => {
  const { Stage } = await import('/src/game/stage.js');
  const P = Stage.prototype;
  window.__fgt = [];
  const orig = P._drawForeground;
  P._drawForeground = function (ctx, theme, cam) {
    if (this.mode === 'stg') return;
    const rec = { t: performance.now() };
    if (!this.__f) {
      this.__f = 1;
      let a = performance.now();
      const layer = this._fgBake(theme);
      let b = performance.now();
      let c = b, d = b;
      if (layer && typeof createImageBitmap === 'function') {
        this._fgPending = true;
        let called = performance.now();
        const pr = createImageBitmap(layer);
        c = performance.now();
        pr.then((bmp) => { this._fgBitmap = bmp; this._fgPending = false; this.__bitmapAt = performance.now(); }).catch(() => {});
        d = called;
      }
      this.__f = { layer, bake: Math.round(b - a), cibCall: Math.round(c - d) };
      window.__fgt.push({ bake: Math.round(b - a), cibSync: Math.round(c - d) });
      return; // 第一次跳过绘制
    }
    const l = this._fgBitmap;
    if (!l) return;
    const t0 = performance.now();
    ctx.save();
    ctx.globalAlpha = 0.94;
    const sway = Math.sin(cam.x * 0.0022 + 0.6) * 16;
    ctx.drawImage(l, -80 + sway - 8, 0, l.width, l.height);
    ctx.restore();
    if (this.__f && !this.__f.draw) this.__f.draw = Math.round(performance.now() - t0);
    return orig.call(this, ctx, theme, cam);
  };
  return true;
})()`);
await T.tap('Enter'); await sleep(400);
await T.tap('KeyN'); await sleep(300);
await T.tap('Digit1'); await sleep(400);
for (let i = 0; i < 60; i++) {
  const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
  if (s.s === 'play' && !s.d) break;
  await T.tap('Enter'); await sleep(140);
}
await sleep(1500);
console.log(JSON.stringify(await T.eval(`({ prewarm: window.__prewarmInfo, fgt: window.__fgt, f: window.__game.stage.__f, bitmapAt: window.__game.stage.__bitmapAt || null, now: performance.now() })`), null, 2));
await T.close();
