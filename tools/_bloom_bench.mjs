// bloom 变体基准（GPU 路径）：测「画一帧 bloom 段」的 JS 提交耗时（不读回，避免把 canvas 拖进 CPU 路径）。
//   node tools/_bloom_bench.mjs --variant all                 # 单页内对比全部变体
//   node tools/_bloom_bench.mjs --shot current --out _pt/perf  # 单独起页拍一个变体截图（避免读回污染）
//
// 变体：
//   current     现行：filter(brightness/contrast/saturate/blur) 整帧降采样 + lighter 叠回
//   noBlur      去掉 blur()（辉光本就靠 1/4 降采样 + 双线性放大获得柔化）
//   filterSmall 先无滤镜降采样，再在 1/4 缓冲上自绘一次滤镜（滤镜只处理小图，视觉同一套参数）
//   filterSmallNoBlur 同上但无 blur
//   downOnly    只做整帧降采样（隔离读回成本）
//   compositeOnly 只做 lighter 叠回（隔离合成成本）
//   none        空操作
//
// 输出：stdout JSON；--shot 时写 PNG。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
const PORT = Number(argv.port || 9461);
const DSF = Number(argv.dsf || 1);
const ITER = Number(argv.iter || 240);
const STRESS = Number(argv.stress ?? 320);
const VARIANT = argv.variant || 'all';
const SHOT = argv.shot || '';
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const OUT = argv.out || '_pt/perf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-bloom-'));
// 本基准专门测 GPU 路径的整帧读回成本，因此不禁 GPU（低配/软件光栅下 post 全关，测了也没意义）
const proc = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  ...(DSF !== 1 ? [`--force-device-scale-factor=${DSF}`] : []),
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 120; i++) {
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
ws.onclose = () => { for (const [, p] of pending) p.rej(new Error('ws closed')); pending.clear(); };
const pageErrors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    const x = msg.params.exceptionDetails;
    pageErrors.push(String((x.exception && x.exception.description) || x.text || '').split('\n')[0]);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    pageErrors.push('CONSOLE: ' + (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    return;
  }
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: DSF, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?bloom=${Date.now()}` });
let booted = false;
for (let i = 0; i < 150; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) { console.error('boot timeout'); ws.close(); proc.kill(); process.exit(3); }

const out = await evaluate(`(async () => {
  const g = window.__game;
  const r = g.renderer;
  const env = {
    dpr: devicePixelRatio, viewport: innerWidth + 'x' + innerHeight,
    scale: +r.scale.toFixed(3), backing: +r.backing.toFixed(3),
    canvas: r.canvas.width + 'x' + r.canvas.height,
    bloom: r.bloom.width + 'x' + r.bloom.height,
    lowSpec: !!r.lowSpec, postLevel: r.postLevel,
    gpu: (() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; } })(),
  };
  env.rafFps = await new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const t = () => { n++; const dt = performance.now() - t0; if (dt < 700) requestAnimationFrame(t); else res(+(n / (dt / 1000)).toFixed(1)); };
    requestAnimationFrame(t);
  });
  if (r.lowSpec) return { error: 'lowSpec path - GPU required', env };

  const bot = (await import('/tools/sim_bot.js?t=' + Date.now())).install({ god: true, maxRetries: 0 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  g.startStage(0);
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  const s = g.stage;
  if (!s) return { error: 'stage missing', env, state: g.state };
  s.beginBoss();
  step(240);
  if (${STRESS} > 0) {
    const cols = Math.ceil(Math.sqrt(${STRESS} * 1.6));
    const rows = Math.ceil(${STRESS} / cols);
    const types = [0, 1, 2, 3, 4], colors = ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0'];
    for (let i = 0; i < ${STRESS}; i++) {
      s.bullets.spawn({ x: -100 + (1260 / cols) * ((i % cols) + 0.5), y: -80 + (760 / rows) * (Math.floor(i / cols) + 0.5),
        vx: 0, vy: 0, r: 6 + (i % 3), type: types[i % 5], color: colors[i % 5], life: 999 });
    }
    step(6);
  }

  const ctx = r.ctx, cw = r.canvas.width, ch = r.canvas.height;
  const bctx = r._bloomCtx, bw = r.bloom.width, bh = r.bloom.height;
  const FILTER = 'brightness(0.86) contrast(2.35) saturate(1.34)';
  const BLUR = 'blur(' + Math.max(0.8, bw / 360).toFixed(2) + 'px)';
  const drawScene = () => { r.begin('#05030a'); s.draw(ctx, 1); };

  function clearB() { bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalCompositeOperation = 'source-over'; bctx.clearRect(0, 0, bw, bh); }
  function down() { bctx.filter = 'none'; bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'low'; bctx.drawImage(r.canvas, 0, 0, bw, bh); }
  function composite() {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.40;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(r.bloom, 0, 0, cw, ch);
    ctx.restore();
  }
  const V = {
    none: () => {},
    current: () => { clearB(); bctx.filter = FILTER + ' ' + BLUR; bctx.drawImage(r.canvas, 0, 0, bw, bh); bctx.filter = 'none'; composite(); },
    noBlur: () => { clearB(); bctx.filter = FILTER; bctx.drawImage(r.canvas, 0, 0, bw, bh); bctx.filter = 'none'; composite(); },
    filterSmall: () => { clearB(); down(); bctx.filter = FILTER + ' ' + BLUR; bctx.drawImage(r.bloom, 0, 0); bctx.filter = 'none'; composite(); },
    filterSmallNoBlur: () => { clearB(); down(); bctx.filter = FILTER; bctx.drawImage(r.bloom, 0, 0); bctx.filter = 'none'; composite(); },
    downOnly: () => { clearB(); down(); },
    compositeOnly: () => { clearB(); down(); composite(); },
    // 与 src/engine/renderer.js 现行 _bloomPass 完全一致的刷新段（不含分级/暗角/颗粒）
    newImpl: () => {
      clearB(); down();
      bctx.filter = FILTER + ' ' + BLUR; bctx.drawImage(r.bloom, 0, 0); bctx.filter = 'none';
      composite();
    },
    // 真实实现（含自适应调度 + 分级/暗角/颗粒），用来验证线上耗时和外观
    live: () => { r._bloomDirty = true; r.present(performance.now()); },
  };

  // 提交耗时：只计 JS + 命令入队，不做任何读回（读回会让 Chrome 把 canvas 降级到 CPU 光栅）
  const ITER = ${ITER};
  function bench(fn) {
    for (let i = 0; i < 24; i++) fn();
    const reps = [];
    for (let rp = 0; rp < 3; rp++) {
      // 每 8 次重画一次场景，避免叠加混合把画面烧成白色影响滤镜成本
      const t0 = performance.now();
      for (let i = 0; i < ITER; i++) { if (i % 8 === 0) drawScene(); fn(); }
      reps.push(performance.now() - t0);
    }
    reps.sort((a, b) => a - b);
    return +(reps[1] / ITER).toFixed(4);
  }
  // 真实循环里的自适应结果（现行实现）
  const sampleLive = () => new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (performance.now() - t0 < 1800) requestAnimationFrame(tick);
      else resolve({ postLevel: r.postLevel, interval: r.bloomInterval, ema: +r.bloomEmaMs.toFixed(3) });
    };
    requestAnimationFrame(tick);
  });

  // ab 模式：在真实游戏循环里交替替换 _bloomPass（老/新），用 renderer 自己的 EMA 对比。
  // 同一页面、同一场景、同一负载，这是唯一能直接反映「线上每帧成本」的对比方式。
  if (${JSON.stringify(VARIANT)} === 'ab') {
    const proto = Object.getPrototypeOf(r);
    const newPass = proto._bloomPass;
    // HEAD 版旧实现：filter 直接挂在整帧降采样上
    const oldPass = function (cw2, ch2) {
      const b2 = this._bloomCtx;
      const bw2 = this.bloom.width, bh2 = this.bloom.height;
      const tk = this._bloomTick++;
      if (this._bloomDirty || tk % this.bloomInterval === 0) {
        const t0b = performance.now();
        b2.setTransform(1, 0, 0, 1, 0, 0);
        b2.globalCompositeOperation = 'source-over';
        b2.clearRect(0, 0, bw2, bh2);
        b2.filter = 'brightness(0.86) contrast(2.35) saturate(1.34) blur(' + Math.max(0.8, bw2 / 360) + 'px)';
        b2.drawImage(this.canvas, 0, 0, bw2, bh2);
        b2.filter = 'none';
        this._tuneBloom(performance.now() - t0b);
        this._bloomDirty = false;
      }
      const c2 = this.ctx;
      c2.save(); c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = 0.40;
      c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'low';
      c2.drawImage(this.bloom, 0, 0, cw2, ch2);
      c2.restore();
    };
    const sampleEma = () => new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => { if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else resolve(+r.bloomEmaMs.toFixed(3)); };
      requestAnimationFrame(tick);
    });
    const acc = { old: [], new: [], oldInterval: [], newInterval: [] };
    for (let k = 0; k < 8; k++) {
      const useNew = k % 2 === 0;
      r._bloomPass = useNew ? newPass : oldPass;
      r.bloomEmaMs = 0; r._bloomWarm = 0; r._bloomIdle = 0; r.bloomInterval = 1; r.postLevel = 2; r._bloomTick = 0; r._bloomDirty = true;
      acc[useNew ? 'new' : 'old'].push(await sampleEma());
      acc[useNew ? 'newInterval' : 'oldInterval'].push(r.bloomInterval);
    }
    r._bloomPass = newPass;
    const mean = (a2) => a2.reduce((x, y) => x + y, 0) / Math.max(1, a2.length);
    const o = mean(acc.old), n = mean(acc.new);
    return { env, bullets: s.bullets.activeCount,
      ab: { oldEma: +o.toFixed(3), newEma: +n.toFixed(3), savePct: +((1 - n / o) * 100).toFixed(1),
        oldAll: acc.old, newAll: acc.new, oldInterval: acc.oldInterval, newInterval: acc.newInterval } };
  }

  // pair 模式：老/新实现的刷新段交替跑（同步循环），同一页同一负载，消掉机器负载漂移
  if (${JSON.stringify(VARIANT)} === 'pair') {
    const reps = { old: [], new: [] };
    for (let rp = 0; rp < 9; rp++) {
      const names = rp % 2 ? ['newImpl', 'current'] : ['current', 'newImpl'];
      for (const name of names) {
        drawScene();
        const t0 = performance.now();
        for (let i = 0; i < 120; i++) { if (i % 8 === 0) drawScene(); V[name](); }
        reps[name === 'current' ? 'old' : 'new'].push((performance.now() - t0) / 120);
      }
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const min = (a) => Math.min(...a);
    // 机器上还有其他 agent 在跑浏览器，中位数会被负载尖峰带偏；min 才是「无干扰能力值」
    const oldMs = min(reps.old), newMs = min(reps.new);
    const oldMed = med(reps.old), newMed = med(reps.new);
    return { env, bullets: s.bullets.activeCount,
      pair: {
        oldMinMs: +oldMs.toFixed(4), newMinMs: +newMs.toFixed(4), savePctMin: +((1 - newMs / oldMs) * 100).toFixed(1),
        oldMedMs: +oldMed.toFixed(4), newMedMs: +newMed.toFixed(4), savePctMed: +((1 - newMed / oldMed) * 100).toFixed(1),
        oldAll: reps.old.map((v) => +v.toFixed(3)), newAll: reps.new.map((v) => +v.toFixed(3)) },
      live: await sampleLive() };
  }

  const wantAll = ${JSON.stringify(VARIANT)} === 'all';
  const res = {};
  const order = wantAll ? Object.keys(V) : [${JSON.stringify(VARIANT)}];
  for (const name of order) { drawScene(); V[name](); res[name] = bench(V[name]); }
  const live = await sampleLive();

  // 合成场景：确定性画面，专门用来对比各变体的辉光差异（游戏实时场景有随机弹幕，没法做像素对比）
  function drawSynth() {
    r.begin('#06040c');
    ctx.save();
    ctx.setTransform(r.backing, 0, 0, r.backing, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#101a3a'); g.addColorStop(1, '#241018');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    let gr = ctx.createRadialGradient(300, 250, 0, 300, 250, 90);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#ffe9a8'); gr.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = gr; ctx.fillRect(180, 130, 240, 240);
    gr = ctx.createRadialGradient(900, 420, 0, 900, 420, 70);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#9fd8ff'); gr.addColorStop(1, 'rgba(80,160,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(800, 320, 200, 200);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = ['#ff7ab8', '#8fe8ff', '#ffd76a', '#c9a2ff'][i % 4];
      ctx.beginPath(); ctx.arc(120 + i * 42, 560 + ((i * 37) % 90), 5 + (i % 4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(80, 120, 420, 3);
    ctx.fillRect(640, 660, 520, 2);
    ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, 680); ctx.lineTo(520, 300); ctx.stroke();
    ctx.fillStyle = '#f7f2ff'; ctx.font = 'bold 46px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('BLOOM TEST 辉光', 640, 120);
    ctx.fillStyle = '#7fe0a8'; ctx.font = '700 24px monospace';
    ctx.fillText('sharp edges / low contrast panel', 640, 170);
    ctx.restore();
  }

  let shot = null;
  if (${JSON.stringify(SHOT)}) {
    drawSynth();
    V[${JSON.stringify(SHOT)}]();
    shot = r.canvas.toDataURL('image/png');
  }

  const base = res.none;
  const net = {};
  for (const k of Object.keys(res)) if (k !== 'none') net[k] = +(res[k] - base).toFixed(4);
  return { env, bullets: s.bullets.activeCount, iter: ITER, res, net, live, shot };
})()`);

if (out.error) { console.error('BENCH FAILED:', out.error, JSON.stringify(out.env || {})); ws.close(); proc.kill(); process.exit(2); }
const shot = out.shot; delete out.shot;
if (shot) {
  mkdirSync(OUT, { recursive: true });
  const b64 = String(shot).replace(/^data:image\/png;base64,/, '');
  const suffix = DSF !== 1 ? `-dsf${DSF}` : '';
  const name = VARIANT === 'all' ? 'all' : VARIANT;
  writeFileSync(join(OUT, `bloom-${name}${suffix}.png`), Buffer.from(b64, 'base64'));
  console.error('shot saved:', join(OUT, `bloom-${name}${suffix}.png`));
}
mkdirSync(OUT, { recursive: true });
out.pageErrors = pageErrors;
const suffix = DSF !== 1 ? `-dsf${DSF}` : '';
if (VARIANT === 'all') writeFileSync(join(OUT, `bloom-bench${suffix}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
if (pageErrors.length) { console.error(`页面报错 ${pageErrors.length} 条:`, pageErrors.slice(0, 5)); process.exitCode = 4; }
ws.close();
proc.kill();
