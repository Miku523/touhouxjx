// 复现「进第 1 面瞬间长任务」：用 PerformanceObserver('longtask') + 分段计时定位。
// 用法：node tools/_lead_stage_load.mjs [port]
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9425;
const T = await launch({ port: PORT, headless: true });
const out = { };
try {
  await T.boot({ query: '?v=loadprobe1', waitTitle: 15000 });
  // 装 longtask 观察器 + 给关键函数打点
  await T.eval(`(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__lt.push(Math.round(e.duration));
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) { window.__ltError = String(e); }
    window.__marks = [];
    return true;
  })()`);
  // 进游戏到 play 前（对话期间），记录此时段的长任务
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  out.beforeDialogue = await T.eval('({ state: window.__game.state, lt: window.__lt.slice() })');
  await T.eval('window.__lt.length = 0');
  // 连按 Enter 推进开场对话；每次记录阶段
  const t0 = Date.now();
  const steps = [];
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, has: !!window.__game.stage, lt: window.__lt.length })');
    steps.push({ i, ...s });
    if (s.s === 'play' && !s.d && s.has) break;
    await T.tap('Enter');
    await sleep(140);
  }
  out.enterMs = Date.now() - t0;
  out.steps = steps;
  out.ltAfterEnter = await T.eval('window.__lt.slice()');
  // 再等 3 秒，看进关后是否还有补做的长任务
  await sleep(3000);
  out.ltAfter3s = await T.eval('window.__lt.slice()');
  out.after = await T.eval('({ state: window.__game.state, ltError: window.__ltError || null, x: window.__game.stage && window.__game.stage.player.x, lives: window.__game.stage && window.__game.stage.player.lives })');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_stage_load.json', out);
  await T.close().catch(() => {});
}
