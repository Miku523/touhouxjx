// 软件光栅 backing 上限调整后的帧率复测（1600×900 / 1920×1080）
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';
async function run(port, width, height) {
  const T = await launch({ port, headless: true, width, height });
  try {
    await T.boot({ query: '?v=soft_' + width + '_' + Date.now(), waitTitle: 20000 });
    await T.tap('Enter'); await sleep(300);
    await T.tap('KeyE'); await sleep(250);
    await T.tap('Digit1'); await sleep(300);
    for (let i = 0; i < 80; i++) {
      const s = await T.eval('({s:window.__game.state,p:window.__game._page,d:window.__game.dialogue.active})');
      if (s.s === 'play' && !s.d) break;
      if (s.s === 'menu' && s.p === 'charselect') await T.tap('Digit1'); else await T.tap('Enter');
      await sleep(140);
    }
    await installFrameProbe(T);
    await sleep(6000);
    const fp = await readFrameProbe(T);
    const info = await T.eval('({backing: window.__rendererInfo.backing, canvasW: window.__rendererInfo.canvasW, renderer: window.__rendererInfo})');
    await T.shot(`_pt/lead_r3/soft_${width}x${height}.png`);
    return { ...fp, info };
  } finally { await T.close().catch(() => {}); }
}
const out = { f1600: await run(9531, 1600, 900), f1920: await run(9532, 1920, 1080) };
console.log(JSON.stringify(out, null, 2));
