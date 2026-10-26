// 复现 5/6 面开场「出现以前的背景图」（= 厚涂背景还没就绪时画的程序化天空兜底）。
// 用法：
//   node tools/_probe56_bg.mjs delay  3 [delayMs]  # 把背景图加载人为延后，量开场兜底画面持续多久
//   node tools/_probe56_bg.mjs block  3            # 屏蔽背景图请求，验证「失败后是否自愈」
//   node tools/_probe56_bg.mjs plain  3            # 正常网络（回归用）
// 参数2：fromIdx，3 = 从第4面过关进第5面，4 = 从第5面过关进第6面。
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'delay';
const fromIdx = Number(process.argv[3] ?? 3);
const delayMs = Number(process.argv[4] ?? 2500);
const dwellMs = Number(process.env.PT_DWELL ?? 1600);
const tag = `${mode}_s${fromIdx + 1}`;
mkdirSync('_probe56', { recursive: true });
const T = await launch({ port: 9451 });

try {
  await T.boot();
  // 背景图 src 请求日志（判断「进关才请求」还是「上一面就预取」）；delay 模式顺便把请求推迟
  await T.eval(`(() => {
    if (window.__imgLog) return 'ok';
    window.__imgLog = [];
    const I0 = window.Image;
    const DELAY = ${mode === 'delay' ? delayMs : 0};
    window.Image = function (...a) {
      const im = new I0(...a);
      const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      try {
        Object.defineProperty(im, 'src', {
          configurable: true,
          get() { return d.get.call(this); },
          set(v) {
            const isBg = /\\/bg\\//.test(String(v));
            window.__imgLog.push([Math.round(performance.now()), String(v).split('/').slice(-2).join('/'), isBg && DELAY ? 'delayed' : 'now']);
            if (isBg && DELAY) setTimeout(() => d.set.call(im, v), DELAY);
            else d.set.call(im, v);
          },
        });
      } catch (e) { /* ignore */ }
      return im;
    };
    return 'ok';
  })()`);

  await T.eval(`(() => {
    window.__px = [];
    const r0 = __game.render.bind(__game);
    __game.render = function (a) {
      const out = r0(a);
      try {
        const c = __game.renderer.ctx;
        const s = __game.stage;
        const th = (s && s.level && s.level.theme) || '-';
        const layers = s && s._bgLayers && s._bgLayers[th] ? s._bgLayers[th].filter(Boolean).length : 0;
        const p = c.getImageData(640, 220, 1, 1).data;
        window.__px.push([Math.round(performance.now()), __game.state, __game.levelIndex, th, layers, p[0], p[1], p[2]]);
      } catch (e) {}
      return out;
    };
    return 'ok';
  })()`);

  // 先进上一面
  if (mode === 'block') {
    // 必须在下一次预取之前就屏蔽，才能测到「加载失败 → 重试自愈」这条路径
    const theme = await T.eval(`(() => { const m = __game._mainStages(); return (m[${fromIdx + 1}] || {}).theme || ''; })()`);
    await T.send('Network.setBlockedURLs', { urls: [`*bg/${theme}*`] });
    console.log('blocked (from start):', theme);
  }
  await T.eval(`__game.startStage(${fromIdx}, { skipIntro: true })`);
  await T.waitFor('!!__game.stage', 8000);
  await sleep(dwellMs);
  const prev = JSON.parse(await T.eval('JSON.stringify({ idx: __game.levelIndex, theme: __game.stage.level.theme })'));
  console.log('prev stage:', prev);

  const tClear = Date.now();
  await T.eval('__game._onStageClear()');

  const shots = [];
  const t0 = Date.now();
  let sawNext = false, nextAt = 0, firstPainted = 0, fallbackShots = 0;
  // block 模式要在重试预算用完之前就解除屏蔽，否则测不到自愈
  const loopLimit = mode === 'block' ? 9000 : 45000;
  while (Date.now() - t0 < loopLimit) {
    const idx = await T.eval('__game.levelIndex');
    const state = await T.eval('__game.state');
    const dlg = await T.eval('!!(__game.dialogue && __game.dialogue.active)');
    const layers = await T.eval(`(() => { const s = __game.stage; const th = s && s.level && s.level.theme; return s && s._bgLayers && s._bgLayers[th] ? s._bgLayers[th].filter(Boolean).length : 0; })()`);
    if (idx > fromIdx) {
      if (!sawNext) { sawNext = true; nextAt = Date.now(); }
      if (layers > 0 && !firstPainted) {
        firstPainted = Date.now();
        await T.shot(`_probe56/${tag}_01_first_painted.png`);
      }
      if (mode !== 'plain' && layers === 0 && fallbackShots < 3) {
        await T.shot(`_probe56/${tag}_00_fallback_${fallbackShots}.png`);
        fallbackShots++;
      }
      if (shots.length < 6) {
        const f = `_probe56/${tag}_02_${String(shots.length).padStart(2, '0')}_${state}.png`;
        await T.shot(f); shots.push(f);
      }
    }
    if (dlg) await T.eval('__game.dialogue.advance()').catch(() => {});
    if (sawNext && firstPainted && shots.length >= 4 && !dlg) break;
    await sleep(80);
  }

  if (mode === 'block') {
    // 恢复请求：看「曾经失败的图」会不会自愈（旧实现不会，因为 e.failed 一票否决）
    await T.send('Network.setBlockedURLs', { urls: [] });
    const tUnblock = Date.now();
    let healed = 0;
    while (Date.now() - tUnblock < 45000) {
      const layers = await T.eval(`(() => { const s = __game.stage; const th = s && s.level && s.level.theme; return s && s._bgLayers && s._bgLayers[th] ? s._bgLayers[th].filter(Boolean).length : 0; })()`);
      if (layers > 0) { healed = Date.now() - tUnblock; break; }
      await sleep(200);
    }
    console.log('unblock -> painted after', healed ? healed + 'ms' : 'NEVER (45s)');
    await T.shot(`_probe56/${tag}_03_after_unblock.png`);
    await sleep(1500);
    await T.shot(`_probe56/${tag}_04_faded.png`);
  }

  const px = JSON.parse(await T.eval('JSON.stringify(window.__px)'));
  writeFileSync(`_probe56/${tag}_timeline.json`, JSON.stringify(px, null, 0));
  if (firstPainted && nextAt) console.log('FALLBACK WINDOW =', firstPainted - nextAt, 'ms（第5/6面开场可见程序化天空兜底的时长）');
  const imgLog = JSON.parse(await T.eval('JSON.stringify(window.__imgLog)'));
  console.log('bg image src sets:', JSON.stringify(imgLog.filter((e) => /bg\//.test(e[1]))));
  console.log('screenshots:', fallbackShots, 'fallback /', shots.length, 'seq');
  const rep = await T.report();
  console.log('errors=', JSON.stringify(rep.errors.slice(0, 6)));
  console.log('netFails=', JSON.stringify(rep.netFails.slice(0, 6)));
  console.log('RESULT=' + JSON.stringify({ mode, fromIdx, fallbackWindowMs: firstPainted && nextAt ? firstPainted - nextAt : null }));
} catch (e) {
  console.error('PROBE FAIL', (e && e.stack) || e);
} finally {
  await T.close();
}
