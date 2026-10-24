// 判定设置卡片「重影」是否来自 backdrop-filter（软光栅）
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9460, headless: true });
try {
  await T.boot({ query: '?v=ghost' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(900);
  await T.shot('_pt/lead_fix/ghost_with_bf.png');
  await T.eval(`(() => { const s = document.createElement('style'); s.textContent = '.overlay.screen-mode .set-group{backdrop-filter:none !important; -webkit-backdrop-filter:none !important; background:rgba(10,6,18,.92) !important;}'; document.head.appendChild(s); })()`);
  await sleep(600);
  await T.shot('_pt/lead_fix/ghost_no_bf.png');
  console.log('shots done');
} finally { await T.close().catch(() => {}); }
