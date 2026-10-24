// 排查设置卡片底部「幽灵行」：用 elementsFromPoint 找该点上的 DOM
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9461, headless: true });
try {
  await T.boot({ query: '?v=ghost2' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(900);
  const info = await T.eval(`(() => {
    const pick = (x, y) => document.elementsFromPoint(x, y).slice(0, 4).map(e => ({
      tag: e.tagName, cls: e.className && String(e.className).slice(0, 40),
      txt: (e.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 30),
      rect: (() => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
    }));
    return { pt470_565: pick(470, 565), pt300_570: pick(300, 570), pt360_610: pick(360, 610), overlayHTMLlen: document.querySelector('#overlay').innerHTML.length };
  })()`);
  console.log(JSON.stringify(info, null, 1));
} finally { await T.close().catch(() => {}); }
