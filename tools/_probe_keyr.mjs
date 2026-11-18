import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9415 });
try {
  await T.boot();
  await sleep(600);
  const s0 = await T.eval(`({bootDone: window.__game._bootDone, introOn: window.__game._titleIntroOn, overlayHidden: window.__game.overlay?.classList.contains('hidden'), state: window.__game.state})`);
  console.log('before KeyR', JSON.stringify(s0));

  // 记录 showRanking 是否被调用
  await T.eval(`(() => { const g = window.__game; window.__log = []; const o = g.showRanking.bind(g); g.showRanking = (...a) => { window.__log.push('showRanking'); return o(...a); }; const o2 = g._onMenuKey.bind(g); g._onMenuKey = (e) => { window.__log.push('menuKey:' + e.code); return o2(e); }; return true; })()`);

  await T.key('KeyR');
  await sleep(500);
  const s1 = await T.eval(`({log: window.__log, rk: !!document.querySelector('.rk-root'), vis: !!window.__game.rankingRoom?.visible, introOn: window.__game._titleIntroOn})`);
  console.log('after 1st KeyR', JSON.stringify(s1));

  await T.key('KeyR');
  await sleep(600);
  const s2 = await T.eval(`({log: window.__log, rk: !!document.querySelector('.rk-root'), vis: !!window.__game.rankingRoom?.visible})`);
  console.log('after 2nd KeyR', JSON.stringify(s2));
} finally { await T.close(); }
