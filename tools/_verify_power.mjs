// 火力系统验证：吃 P 升级 / 符卡扣 50 POWER 并清弹、降级 / 平台+STG 两模式 / HUD
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-power-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
const shot = async (name) => {
  writeFileSync(name, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?power=${Date.now()}` });
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(500);

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const FE = `const fake = { axisX: 1, down: (a) => a === 'shoot' ? false : false, pressed: (a) => a === 'cast', released: () => false };`;

// 0) 纯函数边界
const fn = await ev(`(async () => {
  const m = await import('/src/game/power.js');
  return {
    lv: [0, 31, 32, 63, 64, 95, 96, 128].map(v => m.powerLevel(v)),
    can: [49, 50, 51].map(v => m.canSpell(v)),
    spend: m.spendPower(50),
    next: [0, 31, 64].map(v => m.powerToNextLevel(v)),
  };
})()`);
check('powerLevel 阈值 0/31/32/63/64/95/96/128 → 1/1/2/2/3/3/4/4', JSON.stringify(fn.lv) === JSON.stringify([1, 1, 2, 2, 3, 3, 4, 4]), JSON.stringify(fn.lv));
check('canSpell 49/50/51 → false/true/true', JSON.stringify(fn.can) === JSON.stringify([false, true, true]), JSON.stringify(fn.can));
check('spendPower(50) = 0', fn.spend === 0, String(fn.spend));

// 1) 平台关
const idx = JSON.parse(await ev(`JSON.stringify({
  platform: window.__game._mainStages().findIndex(d => (d.mode || 'platform') !== 'stg'),
  stg: window.__game._mainStages().findIndex(d => d.mode === 'stg'),
})`));
check('存在平台关与 STG 关', idx.platform >= 0 && idx.stg >= 0, JSON.stringify(idx));

const platform = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.state = 'paused';
  g._createStage(g._mainStages()[${idx.platform}], ${idx.platform}, false);
  g.dialogue.stop();
  g.hudEl.classList.remove('hidden');
  g.state = 'play';
  const st = g.stage;
  st.state = 'play';
  const p = st.player;
  p.power = 128; p.alive = true; p.casting = false; p.invuln = 0; p.shootCd = 0;
  st.shots.clear(); st.bullets.clear();
  g.hud.update(st.hudState, 1 / 60); // 让 HUD 先稳定在 Lv.4，才能观察到施法后的下降浮字

  // 火力 Lv.4 → 4 发
  st._tryShoot({ down: () => false, axisX: 1 });
  const shotsLv4 = st.shots.pool.filter(b => b.active).length;

  // 吃 P：20 → 32，应升到 Lv.2
  p.power = 20;
  const beforeEat = p.fireLevel;
  g.hud.update(st.hudState, 1 / 60);
  st.pickups.push({ kind: 'power', x: p.x + p.w / 2, y: p.y + p.h / 2, taken: false, t: 0 });
  st._updatePickups(1 / 60, p);
  g.hud.update(st.hudState, 1 / 60);
  const eat = { power: p.power, level: p.fireLevel, beforeEat, hudLevel: document.getElementById('powerLvNum')?.textContent, pop: document.getElementById('powerPop')?.textContent };

  // 符卡：128 → 78，清屏，降级 4 → 3
  p.power = 128; p.casting = false; p.invuln = 0;
  g.hud.update(st.hudState, 1 / 60);
  st.shots.clear(); st.bullets.clear();
  for (let i = 0; i < 12; i++) st.bullets.spawn({ x: 400, y: 200, vx: 10, vy: 0, life: 5, r: 4, color: '#ff5ea8' });
  const bulletsBefore = st.bullets.activeCount;
  const invulnBefore = p.invuln;
  ${FE}
  st.update(1 / 60, fake);
  g.hud.update(st.hudState, 1 / 60);
  const hudPips = [...document.querySelectorAll('#powerPips i.on')].length;
  return JSON.stringify({
    char: g.char, levelBefore: 4,
    shotsLv4,
    eat,
    powerAfter: p.power, levelAfter: p.fireLevel,
    bulletsBefore, bulletsAfter: st.bullets.activeCount,
    invulnBefore, invulnAfter: p.invuln,
    castFx: st.castFx,
    hudLevel: document.getElementById('powerLvNum')?.textContent,
    hudPips,
    hudPop: document.getElementById('powerPop')?.textContent,
    hudPopShow: document.getElementById('powerPop')?.classList.contains('show'),
    castable: document.getElementById('powerBar')?.classList.contains('castable'),
    castMarkLeft: document.getElementById('powerCastMark')?.style.left,
    hudState: st.hudState,
    state: st.state,
  });
})()`));

check('平台 Lv.4 射击 4 发', platform.shotsLv4 === 4, String(platform.shotsLv4));
check('吃 P 20→32 且 Lv.1→2', platform.eat.power === 32 && platform.eat.level === 2 && platform.eat.beforeEat === 1, JSON.stringify(platform.eat));
check('吃 P 时 HUD 显示 Lv.2 与升级浮字', platform.eat.hudLevel === '2' && platform.eat.pop === '火力 Lv.2 ↑', JSON.stringify(platform.eat));
check('符卡扣 50：128→78', platform.powerAfter === 78, String(platform.powerAfter));
check('符卡后火力 4→3', platform.levelAfter === 3, String(platform.levelAfter));
check('符卡清空 12 发弹幕', platform.bulletsBefore === 12 && platform.bulletsAfter === 0, `${platform.bulletsBefore}→${platform.bulletsAfter}`);
check('符卡给 2s 无敌', platform.invulnAfter >= 1.9, `${platform.invulnBefore}→${platform.invulnAfter}`);
check('平台 HUD Lv=3 / 4 格亮 3', platform.hudLevel === '3' && platform.hudPips === 3, `${platform.hudLevel}/${platform.hudPips}`);
check('平台 HUD 浮字 -50 · Lv.3', platform.hudPop === '-50 · Lv.3', platform.hudPop);
check('HUD 符卡刻度 39%', platform.castMarkLeft === '39%', platform.castMarkLeft);
check('hudState 暴露 fireLevel/castCost', platform.hudState.fireLevel === 3 && platform.hudState.castCost === 50, JSON.stringify(platform.hudState));
await shot('_power_platform.png');

// 2) STG 关
const stg = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.state = 'paused';
  g._createStage(g._mainStages()[${idx.stg}], ${idx.stg}, false);
  g.dialogue.stop();
  g.hudEl.classList.remove('hidden');
  g.state = 'play';
  const st = g.stage;
  st.state = 'play';
  const p = st.player;
  p.power = 128; p.alive = true; p.casting = false; p.invuln = 0; p.shootCd = 0;
  st.shots.clear(); st.bullets.clear();
  st._tryShoot({ down: () => false, axisX: 1 });
  const shotsLv4 = st.shots.pool.filter(b => b.active).length;

  p.power = 128; p.casting = false; p.invuln = 0;
  st.shots.clear(); st.bullets.clear();
  for (let i = 0; i < 12; i++) st.bullets.spawn({ x: p.worldX + 60, y: p.worldY, vx: -10, vy: 0, life: 5, r: 4, color: '#ff5ea8' });
  const bulletsBefore = st.bullets.activeCount;
  ${FE}
  st.update(1 / 60, fake);
  g.state = 'paused';
  g.hud.update(st.hudState, 1 / 60);
  return JSON.stringify({
    mode: st.mode,
    shotsLv4,
    powerAfter: p.power, levelAfter: p.fireLevel,
    bulletsBefore, bulletsAfter: st.bullets.activeCount,
    invulnAfter: p.invuln,
    hudLevel: document.getElementById('powerLvNum')?.textContent,
    hudPop: document.getElementById('powerPop')?.textContent,
    hudState: st.hudState,
  });
})()`));

check('STG 模式生效', stg.mode === 'stg', String(stg.mode));
check('STG Lv.4 射击 4 发', stg.shotsLv4 === 4, String(stg.shotsLv4));
check('STG 符卡扣 50：128→78', stg.powerAfter === 78, String(stg.powerAfter));
check('STG 符卡后火力 4→3', stg.levelAfter === 3, String(stg.levelAfter));
check('STG 符卡清空弹幕（修复前不清）', stg.bulletsBefore === 12 && stg.bulletsAfter === 0, `${stg.bulletsBefore}→${stg.bulletsAfter}`);
check('STG 符卡 2s 无敌', stg.invulnAfter >= 1.9, String(stg.invulnAfter));
check('STG HUD Lv=3', stg.hudLevel === '3', String(stg.hudLevel));
await shot('_power_stg.png');

// 3) HUD 满级 / 吃 P 浮字
const hudUp = JSON.parse(await ev(`(() => {
  const g = window.__game;
  const st = g.stage;
  st.player.power = 20;
  g.hud.update(st.hudState, 1 / 60);
  st.player.power = 32;
  g.hud.update(st.hudState, 1 / 60);
  return JSON.stringify({
    level: document.getElementById('powerLvNum')?.textContent,
    pop: document.getElementById('powerPop')?.textContent,
    cls: document.getElementById('powerPop')?.className,
  });
})()`));
check('吃 P 升 Lv.2 浮字', hudUp.level === '2' && hudUp.pop === '火力 Lv.2 ↑' && /up/.test(hudUp.cls), JSON.stringify(hudUp));

const fail = checks.filter((c) => !c.ok);
const result = { ok: !fail.length && !errors.length, fail, errors, checks, platform, stg, hudUp };
writeFileSync('_power_verify.json', JSON.stringify(result, null, 2));
console.log('RESULT', JSON.stringify(result, null, 2));
ws.close(); proc.kill(); await sleep(300); process.exit(result.ok ? 0 : 1);
