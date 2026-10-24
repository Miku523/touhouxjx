// 前景层改造后的视觉检查：拍 stage1（shrine）与 stage6（moon）实机画面。
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: Number(process.argv[2]) || 9437, headless: true, width: 1280, height: 720 });
try {
  await T.boot({ query: '?v=fgshot' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  await sleep(900);
  await T.shot('_pt/lead_fg/stage1.png');
  const info1 = await T.eval('({ prewarm: window.__prewarmInfo || null, state: window.__game.state })');
  // 跳 stage6（moon 主题）
  await T.eval('window.__game._warpToStage(6)');
  await sleep(1200);
  for (let i = 0; i < 40; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  await sleep(900);
  await T.shot('_pt/lead_fg/stage6.png');
  const info6 = await T.eval('({ prewarm: window.__prewarmInfo || null, theme: window.__game.stage.level.theme, state: window.__game.state })');
  console.log(JSON.stringify({ info1, info6 }, null, 2));
} finally {
  await T.close().catch(() => {});
}
