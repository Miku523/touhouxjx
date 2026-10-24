// 各主线关 Boss 场地封闭性检查：Boss 触发区（cols-50 起）是否存在整列空洞。
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9444, headless: true });
try {
  await T.boot({ query: '?v=arenas' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(350);
  await T.tap('KeyN'); await sleep(250);
  await T.tap('Digit1'); await sleep(350);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(130);
  }
  const out = [];
  for (let n = 1; n <= 6; n++) {
    if (n > 1) {
      await T.eval(`window.__game._warpToStage(${n})`);
      await sleep(600);
      for (let i = 0; i < 40; i++) {
        const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
        if (s.s === 'play' && !s.d) break;
        await T.tap('Enter'); await sleep(120);
      }
    }
    const r = await T.eval(`(() => {
      const L = window.__game.stage.level;
      const cols = L.cols, rows = L.rows;
      const bossStart = Math.max(0, cols - 50);
      const holes = [];
      let run = 0;
      for (let c = bossStart; c < cols; c++) {
        let any = false;
        for (let rr = 0; rr < rows; rr++) { const t = L.tileAt(c, rr); if (t && t !== 9) { any = true; break; } }
        if (!any) run++; else { if (run) holes.push({ from: c - run, len: run }); run = 0; }
      }
      if (run) holes.push({ from: cols - run, len: run });
      return { stage: window.__game.levelIndex + 1, name: L.name, cols, rows, bossStart, holes };
    })()`);
    out.push(r);
  }
  console.log(JSON.stringify(out, null, 1));
} finally { await T.close().catch(() => {}); }
