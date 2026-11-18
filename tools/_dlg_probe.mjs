import { launch, sleep, BASE } from './_pt_core.mjs';
const T = await launch({ port: 9494, width: 1280, height: 720 });
await T.boot();
await T.key('Enter');
await sleep(600);
await T.key('Enter');
await sleep(1200);
await T.key('Enter');
for (let i = 0; i < 24; i++) {
  const s = await T.eval("JSON.stringify({st:window.__game.state,act:!!window.__game.dialogue.active,line:(window.__game.dialogue.index ?? -1),text:(document.querySelector('#dlg .dlg-text')?.textContent||'').slice(0,20),t:+window.__game.t.toFixed(1)})");
  console.log(i, s);
  if (JSON.parse(s).st === 'play') break;
  await T.key('Enter');
  await sleep(400);
}
await T.close();