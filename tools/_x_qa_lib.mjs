/** QA player lib: boot helpers, menu/HUD probes, dialogue advance, stage warp. */
import { launch, sleep } from './_pt_core.mjs';

export async function bootGame(port, opts = {}) {
  const T = await launch({ port, ...opts });
  await T.boot({ timeout: 30000 });
  const bootDone = await T.waitFor('!!window.__game && window.__game._bootDone === true', 20000);
  await sleep(300);
  return { T, bootDone };
}

export const INFO_EXPR = '(() => {' +
  'const g = window.__game; const ov = document.getElementById("overlay");' +
  'const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim().replace(/\\s+/g, " ") : null; };' +
  'const btns = (() => { const b = document.getElementById("buttons"); if (!b) return []; return [...b.querySelectorAll(".btn")].map((el) => ({ t: el.textContent.trim().replace(/\\s+/g, " "), cls: el.className, sel: el.classList.contains("sel") })); })();' +
  'let stage = null; try { const s = g.stage; if (s) stage = { mode: s.mode, st: s.state, finished: !!s.finished, chainIdx: s.chainIdx ?? g._extraChainIdx ?? null, bossKey: s.boss ? s.boss.key : null, bossState: s.boss ? s.boss.state : null, bossHp: s.boss ? Math.round(s.boss.hp) : null, bossMaxHp: s.boss && s.boss.maxHp ? Math.round(s.boss.maxHp) : null, bossStarted: !!s.bossStarted, px: s.player ? Math.round(s.player.x) : null, py: s.player ? Math.round(s.player.y) : null, lives: s.player ? s.player.lives : null, hearts: s.player ? s.player.hearts : null, power: s.player ? Math.round(s.player.power) : null, t: s.t == null ? null : +Number(s.t).toFixed(2), bullets: s.bullets && s.bullets.active ? s.bullets.active.length : null }; } catch (e) { stage = { err: String(e) }; }' +
  'return { state: g.state, page: g._page, inExtra: !!g.inExtra, char: g.char, diff: g.difficulty, levelIndex: g.levelIndex, continues: g.continues, lives: g.lives, carryPower: g.carryPower, bootDone: !!g._bootDone, titleText: txt("title"), subtitle: txt("subtitle"), hint: txt("hint"), overlayCls: ov ? ov.className : null, buttons: btns, dlgActive: !!(g.dialogue && g.dialogue.active), dlgIndex: g.dialogue ? g.dialogue.index : null, dlgLines: g.dialogue && g.dialogue.script ? g.dialogue.script.length : null, dlgTyping: !!(g.dialogue && g.dialogue.isTyping), musicVisible: !!(g.musicRoom && g.musicRoom.visible), hudCls: document.getElementById("hud") ? document.getElementById("hud").className : null, timer: txt("timer"), stageName: txt("stageName"), livesText: txt("lives"), powerText: txt("powerNum"), powerLv: txt("powerLvNum"), bossBarCls: document.getElementById("bossBar") ? document.getElementById("bossBar").className : null, bossName: txt("bossName"), stage, heap: null, loopSteps: window.__game.loop ? window.__game.loop.stepCount : null };' +
' })()';

export async function info(T) { return await T.eval(INFO_EXPR); }

export async function tapSeq(T, codes, gap = 90) {
  for (const c of codes) { await T.key(c); await sleep(gap); }
}

/** Advance dialogue/ending with real confirm+jump keys until it leaves. */
export async function advanceDialogue(T, maxTaps = 140) {
  let last = null;
  for (let i = 0; i < maxTaps; i++) {
    const s = await T.eval('(() => { const g = window.__game; return { st: g.state, dlg: !!(g.dialogue && g.dialogue.active), idx: g.dialogue ? g.dialogue.index : null, typing: !!(g.dialogue && g.dialogue.isTyping) }; })()');
    last = s;
    if (!s.dlg && s.st !== 'ending') return { ok: true, taps: i, last: s };
    await T.key(i % 2 === 0 ? 'Enter' : 'Space');
    await sleep(s.typing ? 45 : 70);
  }
  return { ok: false, taps: maxTaps, last };
}

export async function warp(T, n) {
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: 48 + n, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: 48 + n, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 0 });
  await sleep(250);
  return await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 4000);
}

export async function heap(T) {
  try { const r = await T.send('Runtime.getHeapUsage'); return { used: Math.round(r.usedSize / 1048576), total: Math.round(r.totalSize / 1048576) }; } catch (e) { return null; }
}

export function mk(records) {
  const checks = [];
  const add = (name, ok, extra) => { checks.push({ name, ok: !!ok, extra: extra === undefined ? null : extra }); return !!ok; };
  const run = async (name, fn) => { try { const r = await fn(); if (r === undefined) return true; return add(name, r); } catch (e) { return add(name, false, 'EXC ' + String(e && e.message || e)); } };
  const save = (file, extra = {}) => { const failed = checks.filter((c) => !c.ok); const out = { pass: failed.length === 0, checks, failed, ...extra }; return { out, json: JSON.stringify(out, null, 2), file }; };
  return { add, run, checks, save, records };
}
