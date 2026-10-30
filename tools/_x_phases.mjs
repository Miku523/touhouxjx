/** 帧内相位细分：update / stage 子绘制 / present 子步骤 + ctx 调用计数 */
import { launchCfg, sleep, saveJson, manualRenderScript } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';

const INSTR = `(() => {
  const g = window.__game;
  if (window.__sz) return 'already';
  const S = { draw: {}, upd: {}, ops: {} };
  window.__sz = S;
  const now = () => performance.now();
  let label = null;
  function wrap(obj, name, bucket, key) {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__szw) return false;
    const orig = obj[name];
    const f = function () {
      if (!bucket[key]) bucket[key] = { ms: 0, n: 0 };
      const t = now();
      const r = orig.apply(obj, arguments);
      bucket[key].ms += now() - t;
      bucket[key].n++;
      return r;
    };
    f.__szw = true;
    obj[name] = f;
    return true;
  }
  window.__szWrapStage = function (stage) {
    const s = stage;
    wrap(s, '_drawPaintedBg', S.draw, 'bg');
    wrap(s, '_drawFallbackBg', S.draw, 'bgFallback');
    wrap(s, '_drawPickups', S.draw, 'pickups');
    wrap(s, '_drawCheckpoints', S.draw, 'checkpoints');
    wrap(s, '_drawGoal', S.draw, 'goal');
    wrap(s, '_drawBossArenaWall', S.draw, 'arenaWall');
    wrap(s, '_drawTitleShade', S.draw, 'titleShade');
    if (s.enemies) wrap(s.enemies, 'draw', S.draw, 'enemies');
    if (s.minibosses) wrap(s.minibosses, 'draw', S.draw, 'minibosses');
    if (s.stg) wrap(s.stg, 'draw', S.draw, 'stg');
    if (s.boss) wrap(s.boss, 'draw', S.draw, 'boss');
    if (s.player) wrap(s.player, 'draw', S.draw, 'player');
    if (s.shots) wrap(s.shots, 'draw', S.draw, 'shots');
    if (s.bullets) wrap(s.bullets, 'draw', S.draw, 'bullets');
    if (s.fx) wrap(s.fx, 'draw', S.draw, 'fx');
    if (s.enemies) wrap(s.enemies, 'update', S.upd, 'enemies');
    if (s.minibosses) wrap(s.minibosses, 'update', S.upd, 'minibosses');
    if (s.boss) wrap(s.boss, 'update', S.upd, 'boss');
    if (s.boss) wrap(s.boss, 'damageWithShots', S.upd, 'bossDamage');
    if (s.stg) wrap(s.stg, 'update', S.upd, 'stg');
    if (s.player) wrap(s.player, 'update', S.upd, 'player');
    if (s.shots) wrap(s.shots, 'update', S.upd, 'shots');
    if (s.bullets) wrap(s.bullets, 'update', S.upd, 'bullets');
    if (s.bullets) wrap(s.bullets, 'damagePlayer', S.upd, 'bulletDamage');
    if (s.fx) wrap(s.fx, 'update', S.upd, 'fx');
    return true;
  };
  const r = g.renderer;
  window.__szWrapRenderer = function (renderer) {
    wrap(renderer, 'begin', S.draw, 'begin');
    wrap(renderer, 'present', S.draw, 'present');
    wrap(renderer, '_bloomPass', S.draw, 'bloom');
    wrap(renderer, '_ensureGradWash', S.draw, 'gradWash');
    const c = renderer.ctx;
    if (c && !c.__szw) {
      const wrapCtx = (name) => {
        const orig = c[name];
        c[name] = function () {
          const t = now();
          const res = orig.apply(c, arguments);
          const d = now() - t;
          const k = label || 'unlabeled';
          if (!S.ops[k]) S.ops[k] = { ms: 0, n: 0 };
          S.ops[k].ms += d; S.ops[k].n++;
          return res;
        };
      };
      wrapCtx('drawImage');
      wrapCtx('fillRect');
      wrapCtx('fill');
    }
    // present 各段打 label
    const p = renderer.present.bind(renderer);
    renderer.present = function (t) {
      const prev = label;
      label = 'present';
      const res = p(t);
      label = prev;
      return res;
    };
    return true;
  };
  window.__szLabel = function (v) { label = v; };
  window.__szReset = function () { for (const k in S.draw) delete S.draw[k]; for (const k in S.upd) delete S.upd[k]; for (const k in S.ops) delete S.ops[k]; };
  return 'ok';
})()`;

const REPORT = `(() => { const S = window.__sz; const out = { draw: S.draw, upd: S.upd, ops: S.ops }; return out; })()`;

async function scene(T, name) {
  const snap = await T.eval(`(() => { const g = window.__game, s = g.stage, p = s && s.player; return { mode: s && s.mode, bullets: s && s.bullets ? s.bullets.count() : null, enemies: s && s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : null, boss: s && s.boss ? s.boss.key : null, hp: p ? Math.round(p.x || 0) : null }; })()`);
  await T.eval('window.__szReset()');
  const t0 = Date.now();
  await sleep(6000);
  const sub = await T.eval(REPORT);
  return { name, durMs: Date.now() - t0, snap, sub };
}

async function run(key, gpu, port) {
  const T = await launchCfg({ port, gpu, width: 1280, height: 720, headless: true });
  const out = { key, scenes: {}, errors: [] };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(400);
    out.rinfo = await T.eval('window.__rendererInfo');
    await T.eval(INSTR);
    await T.eval('window.__szWrapRenderer(window.__game.renderer)');

    // boss 场景（platform，stage1 rumia）
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; window.__szWrapStage(s); return 1; })()`);
    await T.keyDown('KeyZ');
    await sleep(3000);
    out.scenes.boss = await scene(T, 'boss');

    // extra 密集
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; window.__szWrapStage(s); return 1; })()`);
    await sleep(7000);
    out.scenes.extra = await scene(T, 'extra');

    // STG 道中
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g.startStage(3, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; window.__szWrapStage(s); return 1; })()`);
    await sleep(14000);
    out.scenes.stg = await scene(T, 'stg');
    await T.keyUp('KeyZ');
    out.manual = await T.eval(manualRenderScript(20));
  } catch (e) {
    out.errors.push(String(e).slice(0, 500));
    console.log('!! ' + key, String(e).slice(0, 400));
  } finally {
    saveJson(OUT + 'perf_phases_' + key + '.json', out);
    try { await T.close(); } catch {}
  }
  for (const [n, sc] of Object.entries(out.scenes)) {
    const d = sc.sub && sc.sub.draw || {};
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v.ms / 6000).toFixed(3)]));
    console.log(key, n, 'bullets=' + (sc.snap && sc.snap.bullets), 'perFrameMS=' + JSON.stringify(round(d)));
  }
  return out;
}

const res = {};
res.soft = await run('soft', false, 9461);
res.gpu = await run('gpu', true, 9462);
saveJson(OUT + 'perf_phases_summary.json', res);
console.log('DONE phases');
