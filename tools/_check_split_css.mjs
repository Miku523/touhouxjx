// 检查 title.css / style.css 的分工是否落地：
// 首屏只应有 title.css；进关前 style.css 必须已补上（#hks-game-css 生效）。
import { launch, sleep, BASE } from './_pt_core.mjs';

const T = await launch({ port: 9602, width: 1100, height: 620 });
const out = {};
try {
  await T.boot(BASE + '/index.html');
  for (let i = 0; i < 120; i++) {
    if (await T.eval('!!(window.__game && window.__game._bootDone)')) break;
    await sleep(250);
  }
  out.firstScreen = await T.eval(`(() => {
    const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => (l.getAttribute('href')||'').split('?')[0]);
    const sheetHrefs = [];
    for (const s of document.styleSheets) { try { if (s.href) sheetHrefs.push(s.href.split('?')[0]); } catch(e){} }
    return { links, sheetHrefs, gameCss: !!document.getElementById('hks-game-css') };
  })()`);
  // 进关
  await T.key('Enter'); await sleep(700);
  await T.key('Enter'); await sleep(700);
  await T.key('Enter'); await sleep(900);
  for (let i = 0; i < 40; i++) {
    const st = await T.eval('window.__game && window.__game.state');
    if (st === 'stage') break;
    await T.key('Enter'); await sleep(380);
  }
  await sleep(1200);
  out.inStage = await T.eval(`(() => {
    const g = window.__game;
    const l = document.getElementById('hks-game-css');
    return {
      state: g && g.state,
      stage: !!(g && g.stage),
      gameCss: !!l,
      gameCssHref: l ? (l.getAttribute('href')||'') : '',
      cssLoaded: l ? !!(l.sheet) : false,
      sheetCount: document.styleSheets.length,
      // 游戏内标志性元素：HUD 容器的样式是否生效（style.css 里定义的定位/字号）
      hudVisible: !!(g && g.hudEl && g.hudEl.style && getComputedStyle(g.hudEl).display !== 'none')
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await T.close?.();
}
