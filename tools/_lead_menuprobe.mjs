// 验证 fuzz 命中的 menu-without-overlay 是否只是「音乐回忆室打开」这一合法状态。
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: Number(process.argv[2]) || 9487, headless: true, width: 1280, height: 720 });
const snap = async () => T.eval(`(() => {
  const g = window.__game;
  const mr = document.querySelector('.music-room, .mroom, #musicRoom');
  return {
    state: g.state, page: g._page,
    overlayVisible: !!(g.overlay && !g.overlay.classList.contains('hidden')),
    musicRoomVisible: !!(mr && !mr.classList.contains('hidden')),
    musicClass: mr ? mr.className : null,
    panelTitle: (document.querySelector('.panel-title, .title-main, .dash-title') || {}).textContent || null,
  };
})()`);
try {
  await T.boot({ query: '?v=menuprobe' + Date.now(), waitTitle: 20000 });
  console.log('title      ', JSON.stringify(await snap()));
  await T.tap('KeyM'); await sleep(500);
  console.log('after M    ', JSON.stringify(await snap()));
  await T.shot('_pt/lead_fuzz/musicroom.png');
  await T.tap('Escape'); await sleep(500);
  console.log('after Esc  ', JSON.stringify(await snap()));
  await T.tap('KeyS'); await sleep(500);
  console.log('after S    ', JSON.stringify(await snap()));
  await T.tap('Escape'); await sleep(500);
  console.log('after Esc2 ', JSON.stringify(await snap()));
} finally {
  await T.close().catch(() => {});
}
