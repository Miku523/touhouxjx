// POWER 数值加长（0–128 / Lv.1–5）功能自检：等级阈值 / 吃 P 增量 / 符卡消耗 / 起手与再战火力
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.env.PT_BASE || 'http://127.0.0.1:8137';
const PORT = 9421, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-pow128-'));
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
  check('POWER.max = 128', consts.max === 128, consts.max);
  check('POWER.perLevel = 24', consts.perLevel === 24, consts.perLevel);
  check('POWER.levels = 5', consts.levels === 5, consts.levels);
  check('POWER.castCost = 48', consts.castCost === 48, consts.castCost);
  check('POWER.pickup 仍为 4（单颗点数不变）', consts.pickup === 4, consts.pickup);
  check('POWER.extend 仍为 99', consts.extend === 99, consts.extend);
  check('EXTRA retryPower = 72（Lv.4 起手）', consts.retryPower === 72, consts.retryPower);

  const lv = await ev(`(async () => {
    const m = await import('/src/game/power.js');
    return [0, 23, 24, 47, 48, 71, 72, 95, 96, 128].map(v => m.powerLevel(v));
  })()`);
  check('powerLevel 0/23/24/47/48/71/72/95/96/128 → 1/1/2/2/3/3/4/4/5/5', JSON.stringify(lv) === JSON.stringify([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]), lv);

  const can = await ev(`(async () => { const m = await import('/src/game/power.js'); return [47, 48].map(v => m.canSpell(v)); })()`);
  check('canSpell 47/48 → false/true', JSON.stringify(can) === JSON.stringify([false, true]), can);

  // 起手火力：新开一局时 carryPower = 24（Lv.2）
  const carry = await ev(`(() => { const g = window.__game; return { carry: g.carryPower, pips: document.querySelectorAll('#powerPips i').length }; })()`);
  check('开局 carryPower = 24（Lv.2）', carry.carry === 24, carry);
  check('HUD 火力菱形共 5 颗', carry.pips === 5, carry);

  const hud = await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play'; g.stage.state = 'play';
    const s = g.stage, p = s.player;
    window.__g = { s, p };
    return { maxPower: p.maxPower, state: s.hudState.maxPower, perLevel: s.hudState.perLevel, castCost: s.hudState.castCost };
  })()`);
  check('关卡内 maxPower = 128', hud.maxPower === 128 && hud.state === 128, hud);
  check('hudState.perLevel = 24 / castCost = 48', hud.perLevel === 24 && hud.castCost === 48, hud);

  const steps = await ev(`(() => {
    const { s, p } = window.__g;
    const fill = () => document.querySelector('#powerFill')?.style.width;
    const lvText = () => document.querySelector('#powerLvNum')?.textContent;
    const out = [];
    p.power = 0;
    window.__game.hud.update(s.hudState, 0);
    out.push({ at: 0, fill: fill(), lv: lvText() });
    for (const target of [4, 24, 48, 72, 96, 128]) {
      p.power = target;
      window.__game.hud.update(s.hudState, 0);
      out.push({ at: target, fill: fill(), lv: lvText(), pips: document.querySelectorAll('#powerPips i.on').length, full: document.querySelector('.pbar').classList.contains('full') });
    }
    return out;
  })()`);
  console.log('STEPS', JSON.stringify(steps));
  check('0 点 → fill 0% / Lv.1', String(steps[0].fill) === '0%' && steps[0].lv === '1', steps[0]);
  check('吃 1 颗 P（4 点）→ fill 3%', String(steps[1].fill) === '3%', steps[1]);
  check('24 点 → fill 19% / Lv.2', String(steps[2].fill) === '19%' && steps[2].lv === '2', steps[2]);
  check('48 点 → fill 38% / Lv.3', String(steps[3].fill) === '38%' && steps[3].lv === '3', steps[3]);
  check('72 点 → fill 56% / Lv.4', String(steps[4].fill) === '56%' && steps[4].lv === '4', steps[4]);
  check('96 点 → fill 75% / Lv.5（5 颗菱形全亮）', String(steps[5].fill) === '75%' && steps[5].lv === '5' && steps[5].pips === 5, steps[5]);
  check('128 点 → fill 100% + full 类', String(steps[6].fill) === '100%' && steps[6].full === true, steps[6]);

  // 符卡扣费：47 不能放，48 能放，扣完归 0 且 Lv.3→Lv.1
  const cast = await ev(`(async () => {
    const { p } = window.__g;
    const m = await import('/src/game/power.js');
    p.casting = false; p.alive = true;
    p.power = 47; const at47 = p.canCast();
    p.power = 48; const at48 = p.canCast();
    const after = m.spendPower(48);
    return { at47, at48, after, lvAfter: m.powerLevel(after), lvBefore: m.powerLevel(48), castCost: m.POWER.castCost };
  })()`);
  check('canCast 47→false / 48→true', cast.at47 === false && cast.at48 === true, cast);
  check('48 点放符卡扣完为 0 且 Lv.3→Lv.1', cast.after === 0 && cast.lvBefore === 3 && cast.lvAfter === 1, cast);

  // Lv.1–5 主弹数：每级多一发，Lv.5 = 5 发（playerShots 的 shots 表）
  const shots = await ev(`(() => {
    const { s } = window.__g;
    const count = (lv) => {
      s.shots.fireCount = 0;
      s.shots.pool.forEach((b) => { b.active = false; });
      s.shots.fire(0, 0, 1, 'reimu', lv, 0, 0.14, false);
      return s.shots.pool.filter((b) => b.active).length;
    };
    return [1, 2, 3, 4, 5].map(count);
  })()`);
  check('Lv.1–5 主弹数 1/2/3/4/5', JSON.stringify(shots) === JSON.stringify([1, 2, 3, 4, 5]), shots);

  const errors = await ev('window.__errors ? window.__errors.length : 0');
  check('无运行时错误', errors === 0, errors);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
  await sleep(300);
  console.log(fails.length ? `RESULT FAIL ${fails.length}: ${fails.join(' | ')}` : 'RESULT PASS all');
  process.exit(fails.length ? 1 : 0);
}
