// 复核隐藏跳关的残机口径：设置残机=3，局内打到只剩 1 条，再跳关，看新关开局残机。
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: Number(process.argv[2]) || 9488, headless: true, width: 1280, height: 720 });
const snap = () => T.eval(`(() => {
  const g = window.__game, p = g.stage && g.stage.player;
  return {
    state: g.state, levelIndex: g.levelIndex,
    settingLives: g.lives, playerLives: p ? p.lives : null, runLives: g.runLives,
    continues: g.continues, power: p ? p.power : null,
  };
})()`);
try {
  await T.boot({ query: '?v=warpcheck' + Date.now(), waitTitle: 20000 });
  await T.tap('Enter'); await sleep(300);
  await T.tap('KeyN'); await sleep(250);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 40; i++) {
    const d = await T.eval('({ s: window.__game.state, a: window.__game.dialogue.active })');
    if (d.s === 'play' && !d.a) break;
    await T.tap('Enter'); await sleep(110);
  }
  console.log('start   ', JSON.stringify(await snap()));
  // 打到只剩 1 条残机
  await T.eval(`(() => { const p = window.__game.stage.player; p.lives = 1; })()`);
  console.log('lives=1 ', JSON.stringify(await snap()));
  await T.eval('window.__game._warpToStage(6)');
  await sleep(1200);
  for (let i = 0; i < 20; i++) {
    const d = await T.eval('({ s: window.__game.state, a: window.__game.dialogue.active })');
    if (d.s === 'play' && !d.a) break;
    await T.tap('Enter'); await sleep(110);
  }
  console.log('warp S6 ', JSON.stringify(await snap()));
} finally {
  await T.close().catch(() => {});
}
