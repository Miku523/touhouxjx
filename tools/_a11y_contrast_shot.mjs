// 弹幕高对比模式截图对比：同一帧、同一种子，分别出「默认」与「高对比+a11y 调色板」两张。
// 用法: node tools/_a11y_contrast_shot.mjs [stageIndex] [outDir]
// 前置：本机 8137 端口有 HKS 静态服务（index.html 可访问）。
// 存在的理由：a11y 的对比度是画出来才看得见的东西，光靠单元测试断言不了
// 「亮樱花背景上这排子弹还认不认得出来」，所以必须真的渲一帧。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stage = Number(process.argv[2] ?? 2);
const outDir = process.argv[3] ?? '.tmp_shots';
const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const SEED = 77;
const profile = mkdtempSync(join(tmpdir(), 'edge-a11yshot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// 两轮：先默认，再高对比。两轮都从全新的页面开始（seed 相同 → 弹幕相同），
// 这样两张图的唯一变量就是 a11y 开关本身。
const VARIANTS = [
  { name: 'default', a11y: null },
  { name: 'contrast', a11y: { contrast: true, palette: 'contrast', fxLevel: 'reduced' } },
];

const shots = [];
for (const v of VARIANTS) {
  let ready = false;
  await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?seed=${SEED}&shot=${Date.now()}` });
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!window.__game');
    if (ready) break;
    await sleep(150);
  }
  if (!ready) throw new Error('game did not boot');

  // 进 Boss 战并推进固定帧数（固定 1/60 步长 → 同 seed 下两轮到这里弹幕形态一致）
  const info = await evaluate(`(async () => {
    const g = window.__game;
    // 停掉 rAF 主循环：否则它会在我们手动 render 之后又用 title 状态重绘，截到的是标题页
    try { g.loop?.stop?.(); } catch (e) {}
    g.showTitle();
    g.difficulty = 'H';
    // startStage 是 async 的（内部要等背景图 / 曲目），必须等出 stage 再动它
    const p0 = g.startStage(${stage});
    for (let i = 0; i < 200 && !g.stage; i++) await new Promise((r) => setTimeout(r, 50));
    if (p0 && p0.then) { try { await p0; } catch (e) {} }
    if (!g.stage) return JSON.stringify({ error: 'no stage' });
    try { g.dialogue.stop(); } catch (e) {}
    g.state = 'play';
    const s = g.stage;
    s.state = 'play';
    s.beginBoss();
    const b = s.boss, p = s.player;
    p.alive = true; p.hearts = 999; p.invuln = 9999;
    p.x = Math.max(120, b.x - 360);
    p.y = (s.mode === 'stg' ? 620 : s.level.h - 190);
    p.focus = true;           // 判定点只在低速时出现，截图要看得见它
    if (s.camera?.snapTo) s.camera.snapTo(b.x - 420);
    b.maxHp = 1e9; b.hp = 1e9; b.spellMaxHp = 1e9; b.spellHp = 1e9;
    document.getElementById('overlay')?.classList.add('hidden');
    document.getElementById('dialogue')?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');

    // a11y 接线（这一步是给 Lead 的接线样板：接上这些，效果就是下面这张图）
    const A = await import('/src/game/a11y.js');
    A.initA11y();
    const preset = ${JSON.stringify(v.a11y)};
    if (preset) A.setA11y(preset);
    A.installPool(s.bullets);
    if (s.boss?.bullets) A.installPool(s.boss.bullets);

    // 让高对比遮罩真的参与合成：包一层 stage.draw，在它画完背景+世界之后、
    // 相机变换已经 restore 回屏幕空间时铺压暗层（等价于 Lead 在 stage.js:2555-2558 之间的插入点）。
    if (${v.a11y ? 'true' : 'false'}) {
      const orig = s.draw.bind(s);
      s.draw = (ctx, a) => {
        orig(ctx, a);
        A.drawContrastVeil(ctx, 1280, 720);
        A.drawHitboxAura(ctx, p.hitPoint, g.t);
      };
    }

    for (let i = 0; i < 540; i++) g.update(1 / 60);
    g.state = 'play';
    // 进关/等待背景图时 DOM 会盖一层「正在准备…」不透明遮罩，截屏前必须全撤
    for (const el of document.querySelectorAll('#overlay,#dialogue,#kit-loading,.kit-loading')) el.classList.add('hidden');
    g.render(0);
    const cv = g.renderer.canvas;
    const px = cv.getContext('2d')?.getImageData(640, 400, 1, 1)?.data;
    return JSON.stringify({
      active: s.bullets.activeCount, state: b.state, gstate: g.state, hasStage: !!g.stage,
      palette: A.getA11y().palette, contrast: A.getA11y().contrast,
      hit: A.getHitboxColor(),
      overlayCls: document.getElementById('overlay')?.className,
      pixel: px ? [px[0], px[1], px[2]] : null,
    });
  })()`);

  // 不用 Page.captureScreenshot：headless 的合成器会给出加载时的旧帧（截出来永远是标题页），
  // 而 canvas 里的像素已经是最新的。直接从 canvas 导 PNG 才是这张「游戏画面」本身。
  const dataUrl = await evaluate(`(() => {
    const g = window.__game;
    return g.renderer.canvas.toDataURL('image/png');
  })()`);
  const path = join(outDir, `a11y_${v.name}.png`);
  writeFileSync(path, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  shots.push({ variant: v.name, path, info: JSON.parse(info) });
  console.log(v.name, info);
}

writeFileSync(join(outDir, 'a11y_shots.json'), JSON.stringify(shots, null, 2));
ws.close();
proc.kill();
console.log('DONE', shots.map((s) => s.path).join(' '));
