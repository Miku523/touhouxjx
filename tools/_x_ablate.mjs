/** 软件光栅 A/B 消融：定位 55ms 帧到底花在哪个绘制层 */
import { launch, sleep, saveJson, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const PORT = Number(process.env.PORT || 9462);
const KEY = process.env.KEY || 'soft';
const OUT = 'tools/_pt/perf_ablate_' + KEY + '.json';

const INSTR = `(() => {
  const g = window.__game;
  if (window.__abReady) return 'ok';
  const S = { stage: null };
  window.__ab = { noBullets: 0, noFx: 0, noEnemies: 0, noPlayer: 0, noBoss: 0, noBg: 0, noOverlay: 0, noArena: 0, noPickups: 0, noStg: 0 };
  const wrap = (obj, name, flag) => {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__abw) return false;
    const orig = obj[name];
    const f = function () { if (window.__ab[flag]) return undefined; return orig.apply(obj, arguments); };
    f.__abw = true; obj[name] = f; return true;
  };
  window.__abWrap = function (s) {
    S.stage = s;
    wrap(s, '_drawPaintedBg', 'noBg');
    wrap(s, '_drawFallbackBg', 'noBg');
    wrap(s, '_drawPickups', 'noPickups');
    wrap(s, '_drawBossArenaWall', 'noArena');
    if (s.bullets) wrap(s.bullets, 'draw', 'noBullets');
    if (s.fx) wrap(s.fx, 'draw', 'noFx');
    if (s.enemies) wrap(s.enemies, 'draw', 'noEnemies');
    if (s.player) wrap(s.player, 'draw', 'noPlayer');
    if (s.boss) wrap(s.boss, 'draw', 'noBoss');
    if (s.stg) wrap(s.stg, 'draw', 'noStg');
    if (s.shots) wrap(s.shots, 'draw', 'noPlayer');
    const c = g.renderer.ctx;
    if (c && !c.__abw) {
      c.__abw = true;
      const ofr = c.fillRect.bind(c);
      c.fillRect = function (x, y, w, h) {
        if (window.__ab.noOverlay && w >= 1000 && h >= 100) return undefined;
        return ofr(x, y, w, h);
      };
    }
    return true;
  };
  window.__abApply = function (name) {
    const ab = window.__ab;
    for (const k of Object.keys(ab)) ab[k] = 0;
    const r = g.renderer;
    // 恢复画布
    if (r.canvas.width !== 1280 || r.canvas.height !== 720) { r.canvas.width = 1280; r.canvas.height = 720; }
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.imageSmoothingQuality = 'high';
    if (name === 'base') {}
    else if (name === 'noBullets') ab.noBullets = 1;
    else if (name === 'noFx') ab.noFx = 1;
    else if (name === 'noEnemies') ab.noEnemies = 1;
    else if (name === 'noEnemiesBoss') { ab.noEnemies = 1; ab.noBoss = 1; }
    else if (name === 'noBoss') ab.noBoss = 1;
    else if (name === 'noBg') ab.noBg = 1;
    else if (name === 'noOverlay') ab.noOverlay = 1;
    else if (name === 'noArena') ab.noArena = 1;
    else if (name === 'noPlayer') ab.noPlayer = 1;
    else if (name === 'smoothLow') r.ctx.imageSmoothingQuality = 'low';
    else if (name === 'backing075') { r.canvas.width = 960; r.canvas.height = 540; r.ctx.setTransform(0.75, 0, 0, 0.75, 0, 0); }
    else if (name === 'backing067') { r.canvas.width = Math.round(1280 * 0.67); r.canvas.height = Math.round(720 * 0.67); r.ctx.setTransform(0.67, 0, 0, 0.67, 0, 0); }
    else if (name === 'backing05') { r.canvas.width = 640; r.canvas.height = 360; r.ctx.setTransform(0.5, 0, 0, 0.5, 0, 0); }
    return name;
  };
  window.__abReady = true;
  return 'ok';
})()`;

const VARIANTS = ['base', 'noBullets', 'noFx', 'noEnemies', 'noBoss', 'noBg', 'noOverlay', 'noArena', 'noPlayer', 'smoothLow', 'backing075', 'backing067', 'backing05'];

async function sample(T, ms) {
  await T.eval('window.__fp.gaps.length = 0; window.__fp.worst = 0; window.__fp.long.length = 0;');
  await sleep(ms);
  const p = await readFrameProbe(T);
  return p;
}

async function run() {
  const T = await launch({ port: PORT, width: 1280, height: 720, gpu: KEY === 'gpu', headless: true });
  const out = { key: KEY, rinfo: null, scenes: {} };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(400);
    await installFrameProbe(T);
    out.rinfo = await T.eval('window.__rendererInfo');
    await T.eval(INSTR);

    async function bossScene(label) {
      await T.eval(`(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; window.__abWrap(s); return 1; })()`);
      await T.keyDown('KeyZ');
      await sleep(3500);
      const res = {};
      for (const v of VARIANTS) {
        await T.eval('window.__abApply("' + v + '")');
        await sleep(600);
        const s = await T.eval(`(() => { const g = window.__game, s = g.stage; return { bullets: s.bullets ? s.bullets.count() : 0, enemies: s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : 0, fx: s.fx && s.fx.parts ? s.fx.parts.length : 0 }; })()`);
        const p = await sample(T, 2500);
        res[v] = { probe: { frames: p.frames, avg: p.avg, p50: p.p50, p95: p.p95, p99: p.p99, worst: p.worst, longTotal: p.longTotal }, snap: s };
        console.log(KEY, label, v, JSON.stringify(res[v]));
      }
      await T.keyUp('KeyZ');
      return res;
    }

    out.scenes.boss = await bossScene('boss');

    // extra 密集场景再跑一遍关键变体
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; window.__abWrap(s); return 1; })()`);
    await T.keyDown('KeyZ');
    await sleep(8000);
    const res2 = {};
    for (const v of ['base', 'noBullets', 'noFx', 'noEnemies', 'noOverlay', 'backing075', 'backing067']) {
      await T.eval('window.__abApply("' + v + '")');
      await sleep(600);
      const p = await sample(T, 2500);
      res2[v] = { probe: { frames: p.frames, avg: p.avg, p50: p.p50, p95: p.p95, worst: p.worst }, bullets: await T.eval('window.__game.stage.bullets.count()') };
      console.log(KEY, 'extra', v, JSON.stringify(res2[v]));
    }
    await T.keyUp('KeyZ');
    out.scenes.extra = res2;
  } catch (e) {
    out.error = String(e).slice(0, 600);
    console.log('!! ' + KEY, String(e).slice(0, 400));
  }
  saveJson(OUT, out);
  try { await T.close(); } catch {}
}

await run();
console.log('DONE ablate ' + KEY);
