/** QA: 3+ min continuous play session — input patterns, fps, heap, resize, pause/resume, stage warp, errors. */
import { sleep } from './_pt_core.mjs';
import { bootGame, info, advanceDialogue, warp, heap } from './_x_qa_lib.mjs';
import fs from 'node:fs';

const PORT = 9455;
const SHOTS = 'tools/shots/_qa_player';
const checks = [];
const add = (name, ok, extra = null) => { checks.push({ name, ok: !!ok, extra }); return !!ok; };
const out = (o) => console.log('[qa-endure] ' + JSON.stringify(o));
console.log('[qa-endure] booting');
const { T } = await bootGame(PORT);
console.log('[qa-endure] booted');
setTimeout(() => { console.log('[qa-endure] WATCHDOG'); process.exit(2); }, Number(process.env.QA_SEC || 200) * 1000 + 150000).unref();
const shot = (n) => T.shot(SHOTS + '/' + n + '.png');
const DURATION = Number(process.env.QA_SEC || 200) * 1000;

/* start stage 1 */
await T.key('Enter'); await sleep(250); await T.key('KeyN'); await sleep(250); await T.key('Digit1');
await advanceDialogue(T, 120);
let ok = await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 15000);
add('start.play', ok);
/* plenty of lives so the session survives deaths, still exercises respawn */
await T.eval('(function(){ const p = window.__game.stage.player; p.lives = 99; p.maxLives = 99; return p.lives; })()');
await shot('e1_start');

const down = new Set();
async function allUp() { for (const c of [...down]) { try { await T.keyUp(c); } catch (e) {} down.delete(c); } }
async function hold(c) { if (!down.has(c)) { await T.keyDown(c); down.add(c); } }
async function tap(c) { await T.key(c); }
const PATTERNS = [
  async () => { await hold('ArrowRight'); await hold('KeyZ'); },
  async () => { await hold('KeyZ'); await tap('Space'); },
  async () => { await hold('ArrowLeft'); await hold('KeyZ'); },
  async () => { await hold('ShiftLeft'); await hold('ArrowRight'); },
  async () => { await hold('KeyZ'); await tap('KeyX'); },
  async () => { await hold('KeyZ'); await tap('Space'); await tap('KeyK'); },
];
function fpsExpr() { return 'window.__game.loop.stepCount'; }

const samples = [];
let ssIdx = 0;
const started = Date.now();
let resizeDone = false, pauseDone = false, warpDone = false;
let lastSteps = await T.eval(fpsExpr());
let lastStepT = Date.now();
while (Date.now() - started < DURATION) {
  const pat = PATTERNS[ssIdx % PATTERNS.length]; ssIdx++;
  await allUp();
  await pat();
  await sleep(1100 + Math.floor(Math.random() * 500));
  const steps = await T.eval(fpsExpr());
  const now = Date.now();
  const fps = Math.round(((steps - lastSteps) / ((now - lastStepT) / 1000)) * 10) / 10;
  lastSteps = steps; lastStepT = now;

  const st = await info(T);
  const el = now - started;

  if (!resizeDone && el > 55000) {
    resizeDone = true;
    await allUp();
    const before = await T.eval('JSON.stringify(document.getElementById("game").getBoundingClientRect())');
    await T.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
    await sleep(1800);
    const during = await T.eval('JSON.stringify(document.getElementById("game").getBoundingClientRect())');
    await T.send('Emulation.clearDeviceMetricsOverride');
    await sleep(1200);
    const after = await info(T);
    const b = JSON.parse(before), d = JSON.parse(during);
    add('resize.duringSession', Math.abs(d.width - 960) < 2, { before: b.width, during: d.width });
    add('resize.survives', after.state === 'play' && after.stage && after.stage.lives > 0, { state: after.state, t: after.stage && after.stage.t });
  }
  if (!pauseDone && el > 95000) {
    pauseDone = true;
    await allUp();
    await T.key('Escape');
    let p = await T.waitFor('window.__game.state === "paused"', 5000);
    const tPause = (await info(T)).stage && (await info(T)).stage.t;
    await sleep(800);
    const tPause2 = (await info(T)).stage && (await info(T)).stage.t;
    await T.key('Escape');
    await sleep(400);
    const sp = await info(T);
    add('pause.duringSession', p && tPause === tPause2, { tPause, tPause2 });
    add('pause.resumes', sp.state === 'play', sp.state);
  }
  if (!warpDone && el > 140000) {
    warpDone = true;
    await allUp();
    const w = await warp(T, 3);
    const sw = await info(T);
    add('warp.stage3', w && sw.levelIndex === 2 && /STAGE 3/.test(sw.stageName || ''), { lvl: sw.levelIndex, name: sw.stageName, state: sw.state });
    await T.eval('(function(){ const p = window.__game.stage.player; p.lives = 99; return true; })()');
    await sleep(500);
  }

  /* sample */
  await T.send('HeapProfiler.collectGarbage').catch(() => {});
  const h = await heap(T);
  samples.push({ t: Math.round(el / 1000), state: st.state, lvl: st.levelIndex, lives: st.stage && st.stage.lives, alive: st.stage && st.stage.alive, power: st.stage && st.stage.power, fps, heapUsed: h && h.used, timer: st.timer });
  if (samples.length === 2) await shot('e2_running');
  console.log('[qa-endure] sample ' + JSON.stringify(samples[samples.length - 1]));
  await sleep(300);
}
await allUp();
const endState = await info(T);
await shot('e3_end');
const rep = await T.report();
const errs = rep.errors || [];
const benign = errs.filter((e) => /ERR_CONNECTION_REFUSED|Failed to load resource/.test(String(e)));
const real = errs.filter((e) => !benign.includes(e));
const heaps = samples.map((s) => s.heapUsed).filter((x) => x != null);
const hmin = Math.min(...heaps), hmax = Math.max(...heaps), hlast = heaps[heaps.length - 1];
const fpsVals = samples.map((s) => s.fps).filter((x) => x > 0);
add('session.noJsErrors', real.length === 0, { real: real.slice(0, 5), benign: benign.length });
add('session.noHttpBad', (rep.httpBad || []).length === 0, rep.httpBad);
add('session.stillInteractive', endState.state === 'play' || endState.state === 'paused', endState.state);
add('session.heapBounded', hmax < 250, { hmin, hmax, hlast });
out({ samples: samples.length, fps: { min: Math.min(...fpsVals), max: Math.max(...fpsVals) }, heap: { hmin, hmax, hlast }, final: { state: endState.state, lvl: endState.levelIndex, lives: endState.stage && endState.stage.lives } });
const failed = checks.filter((c) => !c.ok);
fs.writeFileSync('tools/reports/_runner/qa_endure.json', JSON.stringify({ pass: failed.length === 0, checks, failed, samples, report: { errors: errs.slice(0, 20), netFails: rep.netFails, httpBad: rep.httpBad } }, null, 2));
await T.close();
console.log('DONE ' + (failed.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(failed.map((f) => f.name + ':' + JSON.stringify(f.extra)))));
