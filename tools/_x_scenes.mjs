import { launchCfg, installProbe, readProbe, sleep } from './_pt_perf_lib.mjs';

const T = await launchCfg({ port: 9461, gpu: true, width: 1280, height: 720 });
await T.boot();
await sleep(1200);

const enterStage = `(() => {
  const g = window.__game;
  g.startStage(0);
  g.dialogue.stop();
  g.state = 'play';
  const s = g.stage;
  s.state = 'play';
  const p = s.player;
  if (p) { p.invuln = 999999; p.hearts = 999; p.alive = true; }
  return { stage: !!s, mode: s.mode, state: s.state, player: !!p, pxy: p && [p.x, p.y], bossPending: s.bossPending };
})()`;
console.log('enter stage1:', JSON.stringify(await T.eval(enterStage)));
await T.keyDown('KeyZ');
await T.keyDown('ArrowRight');
await sleep(4000);
const m1 = await T.eval(`(() => { const g = window.__game, s = g.stage; return { state: s.state, t: +s.t.toFixed(1), bullets: s.bullets.activeCount, enemies: s.enemies?.list?.length ?? null, bossPending: s.bossPending, bossStarted: s.bossStarted, playerX: +s.player.x.toFixed(0), scroll: s.mode==='stg'? +s.stg.scroll.toFixed(0): null, camera: s.camera ? +s.camera.x.toFixed(0) : null, fps: +g.loop.fps.toFixed(1), postLevel: g.renderer.postLevel, interval: g.renderer.bloomInterval }; })()`);
console.log('midfight snap:', JSON.stringify(m1));
await T.keyUp('ArrowRight');
await installProbe(T);
await sleep(2000);
console.log('midfight probe:', JSON.stringify(await readProbe(T)));

// boss
const boss = await T.eval(`(() => {
  const g = window.__game, s = g.stage;
  for (const m of (s.minibosses ? [s.minibosses] : [])) { try { m.clear?.(); } catch {} }
  s.beginBoss();
  const b = s.boss;
  if (!b) return { error: 'no boss', bossPending: s.bossPending, bossStarted: s.bossStarted };
  b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9;
  const p = s.player; if (p) { p.invuln = 999999; p.hearts = 999; p.alive = true; }
  return { boss: b.key ?? b.name ?? '?', hp: Math.round(b.hp), state: b.state, patternIdx: b.patternIdx };
})()`);
console.log('boss:', JSON.stringify(boss));
await installProbe(T);
await sleep(5000);
console.log('boss snap:', JSON.stringify(await T.eval(`(() => { const g = window.__game, s = g.stage; return { bullets: s.bullets.activeCount, enemies: s.enemies?.list?.length ?? null, bossState: s.boss && s.boss.state, bossHp: s.boss && Math.round(s.boss.hp), fps: +g.loop.fps.toFixed(1), postLevel: g.renderer.postLevel, interval: g.renderer.bloomInterval, qualityLabel: g.renderer.qualityInfo().label }; })()`)));
console.log('boss probe:', JSON.stringify(await readProbe(T)));

// extra / dense
const extra = await T.eval(`(() => {
  const g = window.__game;
  g.showTitle();
  g._startExtraStage();
  g.dialogue.stop();
  g.state = 'play';
  const s = g.stage; s.state = 'play'; s.bossPending = false;
  const p = s.player; if (p) { p.invuln = 999999; p.hearts = 999; p.alive = true; }
  return { extra: !!s.extra, mode: s.mode, level: s.def && (s.def.key || s.def.name), boss: s.boss && (s.boss.key ?? '?'), state: s.state };
})()`);
console.log('extra:', JSON.stringify(extra));
await installProbe(T);
await sleep(6000);
console.log('dense snap:', JSON.stringify(await T.eval(`(() => { const g = window.__game, s = g.stage; return { t: +s.t.toFixed(1), bullets: s.bullets.activeCount, enemies: s.enemies?.list?.length ?? null, boss: s.boss && { key: s.boss.key, state: s.boss.state, hp: Math.round(s.boss.hp), spell: s.boss.spellIdx }, chain: g._extraChainIdx, fps: +g.loop.fps.toFixed(1), postLevel: g.renderer.postLevel, interval: g.renderer.bloomInterval }; })()`)));
console.log('dense probe:', JSON.stringify(await readProbe(T)));
await T.keyUp('KeyZ');
console.log('errors:', JSON.stringify(T.errors.slice(0, 5)));
await T.close();
