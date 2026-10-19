import * as L from './_pt_flow_chain_lib.mjs';
import { sleep } from './_pt_core.mjs';
const T = await L.openGame({ port: 9416, clearStorage: true });
try {
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'title', press: false });
  await T.eval(`localStorage.setItem('hks.progress.v1', JSON.stringify({extraUnlocked:true, extraChar:'reimu'}));1`);
  await T.reload(); await T.waitFor('!!window.__game', 30000); await sleep(400);
  await T.key('KeyE', 22);
  await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 60000, label: 'extra play', press: true });
  const w = await L.warpStg(T, { frac: 0.3 });
  console.log('lib warpStg ->', JSON.stringify(w));
  const now = await T.eval(`(() => { const st=window.__game.stage, stg=st.stg; return { scroll: stg.scroll, stageSame: st === window.__game.stage, camx: st.camera && st.camera.x }; })()`);
  console.log('immediate', JSON.stringify(now));
  await sleep(400);
  const later = await T.eval(`(() => { const st=window.__game.stage, stg=st.stg; return { scroll: stg.scroll, extraT: st.extraT }; })()`);
  console.log('later', JSON.stringify(later));
  const src = await T.eval(`String(window.__game.stage.stg.constructor.name)`);
  console.log('stg ctor', src);
} finally { await T.close(); }
