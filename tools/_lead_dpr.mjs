// P2-2 复核：DPR=2 时的 backing / 截图（判定「世界画面发糊」是超采样还是真缺陷）
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9466, headless: true, width: 1280, height: 720, deviceScaleFactor: 2 });
try {
  await T.boot({ query: '?v=dpr' + Date.now(), waitTitle: 15000 });
  await sleep(600);
  const info = await T.eval('({ dpr: window.devicePixelRatio, info: window.__rendererInfo })');
  await T.tap('Enter'); await sleep(350); await T.tap('KeyN'); await sleep(250); await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(110);
  }
  await sleep(800);
  const play = await T.eval('({ dpr: window.devicePixelRatio, info: window.__rendererInfo, canvas: (() => { const c = document.querySelector("canvas"); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) }; })() })');
  await T.shot('_pt/lead_fix/dpr2_stage.png');
  console.log(JSON.stringify({ info, play }, null, 1));
} finally { await T.close().catch(() => {}); }
