// POWER 数值加长（0–64）功能自检：等级阈值 / 吃 P 增量 / 符卡消耗 / 起手与再战火力
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.env.PT_BASE || 'http://127.0.0.1:8137';
const PORT = 9421, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-pow64-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/lists`)).json().catch(() => null);
      const list = l || await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

const fails = [];
const check = (name, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' -> ' + JSON.stringify(got)}`); if (!ok) fails.push(name); };

try {
  await send('Page.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
  await sleep(400);

  const consts = await ev(`(async () => {
    const m = await import('/src/game/power.js');
    const s = await import('/src/game/stage.js');
    const P = m.POWER;
    return { max: P.max, perLevel: P.perLevel, levels: P.levels, castCost: P.castCost,
      pickup: P.pickup, kill: P.kill, extend: P.extend,
      retryPower: s.EXTRA_TIMELINE.retryPower };
  })()`);
  check('POWER.max = 64', consts.max === 64, consts.max);
  check('POWER.perLevel = 16', consts.perLevel === 16, consts.perLevel);
  check('POWER.castCost = 24', consts.castCost === 24, consts.castCost);
  check('POWER.extend 仍为 99', consts.extend === 99, consts.extend);
  check('EXTRA retryPower = 48', consts.retryPower === 48, consts.retryPower);

  const lv = await ev(`(async () => {
    const m = await import('/src/game/power.js');
    return [0, 15, 16, 31, 32, 47, 48, 64].map(v => m.powerLevel(v));
  })()`);
  check('powerLevel 0/15/16/31/32/47/48/64 → 1/1/2/2/3/3/4/4', JSON.stringify(lv) === JSON.stringify([1, 1, 2, 2, 3, 3, 4, 4]), lv);

  const can = await ev(`(async () => { const m = await import('/src/game/power.js'); return [23, 24].map(v => m.canSpell(v)); })()`);
  check('canSpell 23/24 → false/true', JSON.stringify(can) === JSON.stringify([false, true]), can);

  // 起手火力：startGame 时 carryPower = 8（Lv.2）
  await ev(`(() => { const g = window.__game; g.char='reimu'; g.difficulty='N'; g.carryPower=0; g.state='play'; return 1; })()`);
  // 直接造关，验证关卡内 / HUD 行为
  const hud = await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play'; g.stage.state = 'play';
    const s = g.stage, p = s.player;
    window.__g = { s, p };
    return { maxPower: p.maxPower, power: p.power, state: s.hudState.maxPower, perLevel: s.hudState.perLevel, castCost: s.hudState.castCost };
  })()`);
  check('关卡内 maxPower = 64', hud.maxPower === 64 && hud.state === 64, hud);
  check('hudState.perLevel = 16 / castCost = 24', hud.perLevel === 16 && hud.castCost === 24, hud);

  const steps = await ev(`(() => {
    const { s, p } = window.__g;
    const fill = () => document.querySelector('#powerFill')?.style.width;
    const lvText = () => document.querySelector('.plv')?.textContent.trim() || document.querySelector('#powerLvNum')?.textContent;
    const out = [];
    p.power = 0; s.update ? 0 : 0;
    // 走 HUD 自己的刷新路径
    window.__game.hud.update(s.hudState, 0);
    out.push({ at: 0, fill: fill(), lv: lvText() });
    for (const target of [1, 16, 32, 48, 64]) {
      p.power = target;
      window.__game.hud.update(s.hudState, 0);
      out.push({ at: target, fill: fill(), lv: lvText(), pips: document.querySelectorAll('#powerPips i.on, #powerPips .on').length, full: document.querySelector('.pbar').classList.contains('full') });
    }
    return out;
  })()`);
  console.log('STEPS', JSON.stringify(steps));
  check('0 点 → fill 0%', String(steps[0].fill) === '0%', steps[0]);
  check('吃 1 颗 P → fill 2%（1/64）', String(steps[1].fill) === '2%', steps[1]);
  check('16 点 → fill 25% / Lv.2', String(steps[2].fill) === '25%' && /2/.test(String(steps[2].lv)), steps[2]);
  check('32 点 → fill 50% / Lv.3', String(steps[3].fill) === '50%' && /3/.test(String(steps[3].lv)), steps[3]);
  check('48 点 → fill 75% / Lv.4', String(steps[4].fill) === '75%' && /4/.test(String(steps[4].lv)), steps[4]);
  check('64 点 → fill 100% + full 类', String(steps[5].fill) === '100%' && steps[5].full === true, steps[5]);

  // 符卡扣费：11 不能放，12 能放（11→false / 12→true），扣完归 0 且掉回 Lv.1
  const cast = await ev(`(async () => {
    const { p } = window.__g;
    const m = await import('/src/game/power.js');
    p.casting = false; p.alive = true;
    p.power = 23; const at11 = p.canCast();
    p.power = 24; const at12 = p.canCast();
    const after = m.spendPower(24);
    return { at11, at12, after, lvAfter: m.powerLevel(after), lvBefore: m.powerLevel(24), castCost: m.POWER.castCost };
  })()`);
  check('canCast 23→false / 24→true', cast.at11 === false && cast.at12 === true, cast);
  check('24 点放符卡扣完为 0 且 Lv.2→Lv.1', cast.after === 0 && cast.lvBefore === 2 && cast.lvAfter === 1, cast);

  const errors = await ev('window.__errors ? window.__errors.length : 0');
  check('无运行时错误', errors === 0, errors);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
  await sleep(300);
  console.log(fails.length ? `RESULT FAIL ${fails.length}: ${fails.join(' | ')}` : 'RESULT PASS all');
  process.exit(fails.length ? 1 : 0);
}
