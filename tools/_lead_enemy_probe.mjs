import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9491, width: 1280, height: 720 });
try {
  await T.boot();
  await T.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(()=>{});
  for (let i = 0; i < 80; i++) {
    if (await T.eval("window.__game.state") === 'play') break;
    await T.key('Enter'); await sleep(160);
  }
  for (const w of [1500, 1500, 2000]) {
    await sleep(w);
    const raw = await T.eval("JSON.stringify((()=>{const st=window.__game.stage,cam=st.camera,list=st.enemies.list;const p=st.player;const near=list.filter(e=>Math.abs(e.x-p.x)<900);return{t:+window.__game.t.toFixed(1),px:Math.round(p.x),total:list.length,near:near.map(e=>[Math.round(e.x),e.entryState,e.alive?'a':'d',e.entry])};})())");
    console.log(raw);
  }
  await T.shot('_perf/verify_enemy2.png');
} finally { await T.close(); }
