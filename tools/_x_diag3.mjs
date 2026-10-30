import { launchCfg, sleep } from './_pt_perf_lib.mjs';
const T = await launchCfg({ port: 9461, gpu: true, width: 1280, height: 720 });
await T.boot();
await T.waitFor('window.__game._bootDone === true', 10000);
await sleep(400);
const r = await T.eval(`(() => { const g=window.__game; g.startStage(3,{skipIntro:true}); g.state='play'; g.stage.state='play'; const p=g.stage.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} return {mode:g.stage.mode, hasT: ('t' in g.stage), t: g.stage.t, keys: Object.keys(g.stage).slice(0,40)}; })()`);
console.log('enter A:', JSON.stringify(r));
await T.keyDown('KeyZ');
for (const ms of [500, 2000, 2000]) {
  await sleep(ms);
  const s = await T.eval(`(() => { const g=window.__game,s=g.stage; return { gState:g.state, sNull: s===null, sState:s&&s.state, t:s&&s.t, tType: typeof (s&&s.t), bullets:s&&s.bullets&&s.bullets.activeCount, enemies:s&&s.enemies?(s.enemies.list||[]).filter(e=>e.alive).length:null, boss:s&&s.boss?{key:s.boss.key,st:s.boss.state}:null, fps:+(g.loop.fps||0).toFixed(1), stageIdx: g.stage&&g.stage.index }; })()`);
  console.log('A @' + ms + ':', JSON.stringify(s));
}
await T.keyUp('KeyZ');
await T.close();
