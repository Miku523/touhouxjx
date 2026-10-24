// 设置页行几何：检查卡片 bottom 是否切掉最后一行
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9459, headless: true });
try {
  await T.boot({ query: '?v=setgeo' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(900);
  const geo = await T.eval(`(() => [...document.querySelectorAll('#overlay .set-group')].map(g => {
    const gr = g.getBoundingClientRect();
    const rows = [...g.querySelectorAll('.btn')].map(b => { const r = b.getBoundingClientRect();
      return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), txt: b.innerText.replace(/\\s+/g,' ').trim().slice(0,18) }; });
    return { g: g.dataset.g, top: Math.round(gr.top), bottom: Math.round(gr.bottom), h: Math.round(gr.height),
             clipped: rows.filter(r => r.b > Math.round(gr.bottom) + 0.5).length, rows };
  }))()`);
  console.log(JSON.stringify(geo, null, 1));
} finally { await T.close().catch(() => {}); }
