import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9462, headless: true, width: 1280, height: 720 });
try {
  await T.boot({ query: '?v=crop' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(900);
  await requirement_shot();
  async function requirement_shot() {
    const r = await T.eval(`(() => { const g = document.querySelector('.set-group[data-g="sound"]'); const b = g.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + b.height * 0.55), w: Math.round(b.width), h: Math.round(b.height * 0.45 + 20) }; })()`);
    console.log(JSON.stringify(r));
    const f = await T.screenshotClip ? null : null;
  }
} finally { await T.close().catch(() => {}); }
