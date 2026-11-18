import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9414 });
try {
  await T.boot();
  await sleep(500);
  const a = await T.eval(`(() => {
    const g = window.__game;
    return {
      btnHotkeys: (g.menuButtons||[]).map(b => b._spec?.hotkey),
      btnLabels: (g.menuButtons||[]).map(b => b.textContent.trim().replace(/\\s+/g,' ')),
      noDirect: !!g._noDirect,
      hasShowRanking: typeof g.showRanking,
      hasShowReplays: typeof g.showReplays,
      hasShowPractice: typeof g.showPractice,
      page: g._page,
      actionOfR: g.input.actionOf('KeyR'),
      actionOfP: g.input.actionOf('KeyP'),
      actionOfV: g.input.actionOf('KeyV'),
    };
  })()`);
  console.log(JSON.stringify(a, null, 1));
  // direct call to rule out dispatch
  await T.eval(`window.__game.showRanking(); true`);
  await sleep(600);
  const b = await T.eval(`({ found: !!document.querySelector('.rk-root'), vis: !!window.__game.rankingRoom?.visible, state: window.__game.state })`);
  console.log('direct showRanking ->', JSON.stringify(b));
} finally { await T.close(); }
