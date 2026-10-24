import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9727 });
try {
  await T.boot({ waitTitle: true });
  await T.eval(`localStorage.setItem('hks.progress.v1','{oops');localStorage.setItem('hks.settings.v1','null');localStorage.setItem('hks.keybinds.v1','["x"]');localStorage.setItem('hks.music.v1','42');1`);
  await T.reload();
  await sleep(4000);
  const st = await T.eval(`({ hasGame: !!window.__game, state: window.__game && window.__game.state, ready: document.readyState, url: location.href })`);
  const rep = await T.report();
  console.log('all-four', JSON.stringify(st));
  console.log('errors:', JSON.stringify(rep.errors.slice(0,5)));
  console.log('netFails:', JSON.stringify(rep.netFails.slice(0,5)));
} finally { await T.close(); }
