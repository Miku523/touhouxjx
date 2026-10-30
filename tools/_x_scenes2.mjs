import { launchCfg, installProbe, readProbe, sleep } from './_pt_perf_lib.mjs';
const T = await launchCfg({ port: 9461, gpu: true, width: 1280, height: 720 });
await T.boot();
await T.waitFor('window.__game._bootDone === true', 10000);
await sleep(500);
const ev = (e) => T.eval(e);
const st = `(() => { const g=window.__game,s=g.stage; return { gState:g.state, sState:s.state, t:+s.t.toFixed(1), bullets:s.bullets.activeCount, enemies:s.enemies?(s.enemies.list.filter(e=>e.active).length):null, px:s.player?+s.player.x.toFixed(0):null, py:s.player?+s.player.y.toFixed(0):null, boss:s.boss?{key:s.boss.key,st:s.boss.state,hp:Math.round(s.boss.hp),spell:s.boss.spellIdx}:null, chain:g._extraChainIdx, scroll:s.stg?+s.stg.scroll.toFixed(0):null, fps:+g.loop.fps.toFixed(1) }; })()`;

async function probe(ms, label) {
  await installProbe(T);
  await sleep(ms);
  const p = await readProbe(T);
  console.log(label, JSON.stringify(p));
}

// A: stage4 STG mid
let r = await ev(`(() => { const g=window.__game; g.startStage(3,{skipIntro:true}); g.state='play'; g.stage.state='play'; const p=g.stage.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} return {mode:g.stage.mode}; })()`);
console.log('A stage4 enter:', JSON.stringify(r));
await T.keyDown('KeyZ');
await sleep(5000);
console.log('A stage4 @5s:', JSON.stringify(await ev(st)));
await probe(4000, 'A stage4 probe:');
// B: stage1 walk
r = await ev(`(() => { const g=window.__game; g.showTitle(); g.startStage(0,{skipIntro:true}); g.state='play'; g.stage.state='play'; const p=g.stage.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} return {mode:g.stage.mode}; })()`);
console.log('B stage1 enter:', JSON.stringify(r));
await T.keyDown('ArrowRight');
await sleep(9000);
console.log('B stage1 @9s:', JSON.stringify(await ev(st)));
await probe(4000, 'B stage1 walk probe:');
await T.keyUp('ArrowRight');
// C: extra Flandre
r = await ev(`(() => { const g=window.__game; g.showTitle(); g._startExtraStage({chainFrom:3}); g.state='play'; g.stage.state='play'; const s=g.stage; const p=s.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} if(s.boss){s.boss.state='battle'; s.boss.alpha=1; s.boss.spellLock=0; s.boss.patternDur=1e9;} return {mode:s.mode, boss:s.boss&&s.boss.key, chain:g._extraChainIdx}; })()`);
console.log('C extra from3 enter:', JSON.stringify(r));
await sleep(6000);
console.log('C extra @6s:', JSON.stringify(await ev(st)));
await probe(5000, 'C extra probe:');
await T.keyUp('KeyZ');
await T.close();
