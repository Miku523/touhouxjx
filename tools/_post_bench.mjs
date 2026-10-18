// 后期处理分项基准：复制 Renderer.present 的四段，逐段开关，测每段在软件光栅下的成本。
//   node tools/_post_bench.mjs [--port 9395] [--stress 0]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9395);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STRESS = Number(argv.stress || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-post-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?pb=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

const out = await evaluate(`(async () => {
  const g = window.__game;
  const bot = (await import('/tools/sim_bot.js?t=' + Date.now())).install({ god: true, maxRetries: 0 });
  const step = () => { bot.decide(); g.update(1/60); bot.after(); };
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step();
  const s = g.stage;
  s.beginBoss();
  for (let i = 0; i < 300; i++) step();
  if (${STRESS} > 0) {
    const cols = Math.ceil(Math.sqrt(${STRESS} * 1.6));
    const rows = Math.ceil(${STRESS} / cols);
    const types = [0, 1, 2, 3, 4], colors = ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0'];
    for (let i = 0; i < ${STRESS}; i++) {
      s.bullets.spawn({ x: -100 + (1260 / cols) * ((i % cols) + 0.5), y: -80 + (760 / rows) * (Math.floor(i / cols) + 0.5),
        vx: 0, vy: 0, r: 6 + (i % 3), type: types[i % 5], color: colors[i % 5], life: 999 });
    }
    for (let i = 0; i < 6; i++) step();
  }

  const r = g.renderer;
  const ctx = r.ctx, cw = r.canvas.width, ch = r.canvas.height;
  const bctx = r._bloomCtx;

  const drawScene = () => { r.begin('#05030a'); s.draw(ctx, 1); };

  function presentVariant(t, F) {
    if (F.bloom) {
      const bw = r.bloom.width, bh = r.bloom.height;
      bctx.setTransform(1,0,0,1,0,0);
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0,0,bw,bh);
      bctx.filter = F.bloomFilter || ('brightness(0.86) contrast(2.35) saturate(1.34) blur(' + Math.max(0.8, bw/360) + 'px)');
      bctx.drawImage(r.canvas, 0, 0, bw, bh);
      bctx.filter = 'none';
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.40;
      ctx.drawImage(r.bloom, 0, 0, cw, ch);
      ctx.restore();
    }
    if (F.grade) {
      ctx.save();
      ctx.setTransform(r.backing,0,0,r.backing,0,0);
      ctx.globalCompositeOperation = F.gradeMode || 'soft-light';
      ctx.globalAlpha = 0.55;
      if (!F.gradeCached || !presentVariant._grade) {
        const gr = ctx.createLinearGradient(0,0,0,720);
        gr.addColorStop(0, 'rgba(72,104,220,0.34)');
        gr.addColorStop(0.52, 'rgba(20,16,40,0.06)');
        gr.addColorStop(1, 'rgba(255,146,72,0.24)');
        presentVariant._grade = gr;
      }
      ctx.fillStyle = presentVariant._grade;
      ctx.fillRect(0,0,1280,720);
      ctx.restore();
    }
    if (F.vignette) {
      ctx.save();
      ctx.setTransform(r.backing,0,0,r.backing,0,0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (!presentVariant._vg) {
        const vg = ctx.createRadialGradient(640,345.6,172.8,640,360,676.8);
        vg.addColorStop(0,'rgba(2,1,6,0)');
        vg.addColorStop(0.58,'rgba(2,1,6,0.10)');
        vg.addColorStop(1,'rgba(2,1,6,0.58)');
        presentVariant._vg = vg;
      }
      ctx.fillStyle = presentVariant._vg;
      ctx.fillRect(0,0,1280,720);
      ctx.restore();
    }
    if (F.grain) {
      if (!r._grainPattern) r._grainPattern = ctx.createPattern(r.grainTile, 'repeat');
      ctx.save();
      ctx.setTransform(r.backing,0,0,r.backing,0,0);
      const ox = Math.floor((t*13)%160), oy = Math.floor((t*7)%160);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.055;
      ctx.translate(-ox,-oy);
      ctx.fillStyle = r._grainPattern;
      ctx.fillRect(0,0,1440,880);
      ctx.restore();
    }
  }

  const VARIANTS = {
    full:            { bloom: 1, grade: 1, vignette: 1, grain: 1, gradeCached: 1 },
    bloomOnly:       { bloom: 1 },
    noBloom:         { grade: 1, vignette: 1, grain: 1 },
    noGrade:         { bloom: 1, vignette: 1, grain: 1 },
    noVignette:      { bloom: 1, grade: 1, grain: 1 },
    noGrain:         { bloom: 1, grade: 1, vignette: 1 },
    bloomNoBlur:     { bloom: 1, bloomFilter: 'brightness(0.86) contrast(2.35) saturate(1.34)' },
    bloomNoFilter:   { bloom: 1, bloomFilter: 'none' },
    gradeMultiply:   { bloom: 1, grade: 1, gradeMode: 'multiply', vignette: 1 },
    none:            {},
  };
  const FR = 16;
  const res = {};
  // 预热
  drawScene(); presentVariant(0, { bloom:1, grade:1, vignette:1, grain:1 });
  for (const name of Object.keys(VARIANTS)) {
    const F = VARIANTS[name];
    const tt = { scene: 0, post: 0 };
    for (let i = 0; i < FR; i++) {
      const a = performance.now(); drawScene(); const b = performance.now();
      presentVariant(i*0.016, F); const c = performance.now();
      tt.scene += b-a; tt.post += c-b;
      // 让 GPU/光栅队列结算，避免成本漂移到下一帧
      if (i % 4 === 3) { ctx.getImageData(0,0,1,1); }
    }
    res[name] = { sceneMs: +(tt.scene/FR).toFixed(2), postMs: +(tt.post/FR).toFixed(2), totalMs: +((tt.scene+tt.post)/FR).toFixed(2) };
  }
  return { bullets: s.bullets.activeCount, size: cw + 'x' + ch, res };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
