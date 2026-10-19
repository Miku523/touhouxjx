import { launch, sleep } from './_pt_core.mjs';
import { bootFresh, gameSnap } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9433, width: 1280, height: 720 });
try {
  await bootFresh(T);
  await T.key('Enter'); await sleep(350);
  await T.key('KeyN'); await sleep(400);
  await T.key('Digit1'); await sleep(900);
  const st = () => T.eval(`(() => { const g = window.__game; const d = g.dialogue; return {
    state: g.state, active: !!d?.active, idx: d?.index, scriptLen: d?.script?.length,
    shown: d?.shown, fullLen: (d?.fullText||'').length, cur: (d?.fullText||'').slice(0,30),
    overlay: document.getElementById('overlay')?.className,
  }; })()`);
  console.log('after digit', JSON.stringify(await st()));
  for (let i = 0; i < 12; i++) {
    await T.key('Enter');
    await sleep(220);
    if (i % 3 === 0) console.log('enter', i, JSON.stringify(await st()));
  }
  console.log('end', JSON.stringify(await st()));
  console.log('snap', JSON.stringify(await gameSnap(T)));
  const rep = await T.report();
  console.log('console=', JSON.stringify({ errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad }));
} finally { await T.close(); }
