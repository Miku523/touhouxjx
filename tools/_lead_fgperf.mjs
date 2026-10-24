// 前景层每帧成本：对比开启/关闭 _drawForeground 的帧间隔（软件光栅，端口 9483）
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const T = await launch({ port: 9483, headless: true });
try {
  await T.boot({ query: '?v=perf' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(300); await T.tap('KeyN'); await sleep(200); await T.tap('Digit1'); await sleep(350);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(100);
  }
  await sleep(500);
  // 让自机停止不动，弹幕少一点，纯看渲染
  await T.eval('(() => { const p = window.__game.stage.player; p.x = 300; p.vx = 0; })()');
  await installFrameProbe(T);
  await sleep(1600);
  const on = await readFrameProbe(T);
  const wrap = await T.eval('({ backing: window.__rendererInfo.backing, w: document.querySelector("canvas").width })');

  // 关掉前景绘制
  const patched = await T.eval(`(async () => {
    const m = await import('/src/game/stage.js');
    m.Stage.prototype._drawForeground = function () {};
    return true;
  })()`);
  await sleep(300);
  await installFrameProbe(T);
  await sleep(1600);
  const off = await readFrameProbe(T);
  console.log(JSON.stringify({ patched, wrap, on, off }, null, 1));
} finally { await T.close().catch(() => {}); }
