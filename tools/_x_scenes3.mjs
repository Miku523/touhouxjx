import { launchCfg, installProbe, readProbe, sleep } from './_pt_perf_lib.mjs';
const T = await launchCfg({ port: 9461, gpu: true, width: 1280, height: 720 });
await T.boot();
await T.waitFor('window.__game._bootDone === true', 10000);
await sleep(400);
const SNAP = `(() => { const g=window.__game,s=g.stage; if(!s) return {noStage:true,gState:g.state}; const stg=s.mode==='stg'; const p=s.player; return {
  gState:g.state, sState:s.state, mode:s.mode, t:+(s.t||0).toFixed(1), bullets:s.bullets?s.bullets.activeCount:null,
  enemies: stg ? (s.stg&&s.stg.enemies?s.stg.enemies.filter(e=>e.alive).length:null) : (s.enemies?(s.enemies.list||[]).filter(e=>e.alive).length:null),
  px: p ? +(stg?p.worldX:p.x).toFixed(0) : null, py: p ? +(stg?p.worldY:p.y).toFixed(0) : null,
  boss: s.boss?{key:s.boss.key||s.boss.name, st:s.boss.state, hp:Math.round(s.boss.hp), spell:s.boss.spellIdx, pdur:+(s.boss.patternDur||0).toFixed(1)}:null,
  chain:g._extraChainIdx, scroll:s.stg?+s.stg.scroll.toFixed(0):null, fps:+(g.loop.fps||0).toFixed(1) }; })()`;
async function probe(ms, label) { await installProbe(T); await sleep(ms); console.log(label, JSON.stringify(await readProbe(T))); }

// stage1 walk 12s
await T.eval(`(() => { const g=window.__game; g.startStage(0,{skipIntro:true}); g.state='play'; g.stage.state='play'; const p=g.stage.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} return true; })()`);
await T.keyDown('KeyZ'); await T.keyDown('ArrowRight');
for (const t of [4000, 4000, 4000]) { await sleep(t); console.log('stage1 walk:', JSON.stringify(await T.eval(SNAP))); }
await probe(4000, 'stage1 12s probe:');
await T.keyUp('ArrowRight');

// extra Flandre chainFrom 3
await T.eval(`(() => { const g=window.__game; g.showTitle(); g._startExtraStage({chainFrom:3}); g.state='play'; g.stage.state='play'; const s=g.stage; const p=s.player; if(p){p.invuln=999999;p.hearts=999;p.alive=true;} return {mode:s.mode, boss:s.boss&&s.boss.key, chain:g._extraChainIdx}; })()`);
for (const t of [3000, 4000, 4000]) { await sleep(t); console.log('flandre:', JSON.stringify(await T.eval(SNAP))); }
await probe(5000, 'flandre probe:');
await T.keyUp('KeyZ');
await T.close();
