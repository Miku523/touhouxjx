// Boss 场地几何探针：读运行时 Level.tileAt，找空列/尖刺/单向平台，判断是否存在可坠落缺口。
import { launch, sleep } from './_pt_core.mjs';
const stageNo = Number(process.argv[2] || 1); // 1-based
const T = await launch({ port: Number(process.argv[3]) || 9438, headless: true });
try {
  await T.boot({ query: '?v=arena' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  if (stageNo !== 1) { await T.eval(`window.__game._warpToStage(${stageNo})`); await sleep(800); }
  for (let i = 0; i < 40; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  const r = await T.eval(`(() => {
    const L = window.__game.stage.level;
    const p = window.__game.stage.player;
    const cols = L.cols, rows = L.rows;
    const out = { cols, rows, w: L.w, h: L.h, player: { x: p.x, y: p.y, h: p.h }, arena: [], holes: [], spikes: [], plats: [] };
    const bossStart = Math.max(0, cols - 50);
    for (let c = bossStart; c < cols; c++) {
      let topSolid = -1;
      for (let rr = 0; rr < rows; rr++) { const t = L.tileAt(c, rr); if (t && t !== 9) { topSolid = rr; break; } }
      out.arena.push([c, topSolid, L.tileAt(c, topSolid === -1 ? rows - 1 : topSolid)]);
      if (topSolid === -1) out.holes.push(c);
    }
    // 全面扫整关的坑列（连续 topSolid === -1 的列），用于对照
    let run = 0;
    for (let c = 0; c < cols; c++) {
      let any = false;
      for (let rr = 0; rr < rows; rr++) { const t = L.tileAt(c, rr); if (t && t !== 9) { any = true; break; } }
      if (!any) { run++; } else if (run) { out.holes.push({ from: c - run, len: run }); run = 0; }
    }
    if (run) out.holes.push({ from: cols - run, len: run });
    return out;
  })()`);
  console.log(JSON.stringify(r));
} finally { await T.close().catch(() => {}); }
