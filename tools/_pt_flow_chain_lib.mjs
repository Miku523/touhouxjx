/**
 * flow-chain 分区测试封装：关卡链 / 结局 / EXTRA / GameOver / 持久化。
 *
 * 约束：不修改 tools/_pt_core.mjs 与 src/**；只用真实键盘事件 + 真实 update 路径。
 * 允许的加速（均在每条 finding / report 的 accel 里注明）：
 *   - stage.player.invuln = 999             免死，专注流程
 *   - boss.damage(boss.spellHp+1)           逐张符卡走真实伤害→切卡→defeat→dead 路径
 *   - boss.spellLock = 0                    跳过符卡宣言无敌（否则每张卡等 0.6s 逻辑）
 *   - boss.defeatT = 2.25                   跳过 2.2s 击破动画（dead 仍由 update 触发）
 *   - stage.extraT / stg.scroll 直接拨表     EXTRA 6 分钟道中不可能实时跑
 *   - 玩家位置瞬移到道中对话阈值 / Boss 触发线（仍由 Stage.update 自己判定进度）
 * 禁止：直接改 g.state / g.levelIndex / 直接调 startStage 伪造流转。
 */
import fs from 'node:fs';
import { launch, sleep, snapshot, saveJson } from './_pt_core.mjs';

export const BASE_OUT = '_pt/flow_chain';
export const PORT = 9412;
export const SEED_QUERY = '?seed=12345';

/* ------------------------------------------------------------------ *
 * 轻量状态读取（一次 eval 拿全：状态机 + stage + HUD + 结局 DOM + 存档）
 * ------------------------------------------------------------------ */
const STATE_EXPR = `(() => {
  const g = window.__game, st = g.stage, d = g.dialogue, en = g.ending;
  const $ = (id) => document.getElementById(id);
  const txt = (id) => { const e = $(id); return e ? String(e.textContent || '').trim() : null; };
  const p = st && st.player;
  const b = st && st.boss;
  const s = {
    state: g.state,
    level: g.levelIndex,
    inExtra: !!g.inExtra,
    char: g.char,
    diff: g.difficulty,
    continues: g.continues,
    runLives: g.runLives,
    carryPower: g.carryPower,
    lives: g.lives,
    unlockedExtra: !!g.unlockedExtra,
    extraChar: g.extraChar || null,
    dlg: !!(d && d.active),
    dlgIndex: d ? d.index : -1,
    dlgShown: d ? d.shown : -1,
    dlgFull: d ? String(d.fullText || '').length : -1,
    dlgLines: d && d.script ? d.script.length : -1,
    edPhase: en ? en.phase : null,
    edLine: en ? en.lineIndex : -1,
    edShot: en ? en.shotIndex : -1,
    edCardT: en ? +(+en.cardT || 0).toFixed(2) : -1,
    edActive: !!(en && en.active),
    title: txt('title'),
    overlayHidden: $('overlay') ? $('overlay').classList.contains('hidden') : null,
    buttons: $('overlay') ? [...$('overlay').querySelectorAll('.btn')].map((x) => ({
      t: String(x.textContent || '').replace(/\\s+/g, ' ').trim(),
      disabled: !!x.disabled || x.classList.contains('disabled'),
      cls: x.className,
    })) : [],
    endingVisible: $('ending') ? !$('ending').classList.contains('hidden') : null,
    edChapter: txt('edChapter'),
    edCardNo: txt('edCardNo'),
    edCardKind: txt('edCardKind'),
    edCardTitle: txt('edCardTitle'),
    edCardChar: txt('edCardChar'),
    edCardVisible: $('edCard') ? !$('edCard').classList.contains('hidden') : null,
    edPrompt: txt('edPrompt'),
    edPromptVisible: $('edPrompt') ? !$('edPrompt').classList.contains('hidden') : null,
    hud: {
      stage: txt('stageName'),
      timer: txt('timer'),
      power: txt('powerNum'),
      powerMax: txt('powerMax'),
      lives: [...document.querySelectorAll('#lives .life')].filter((e) => !e.classList.contains('off')).length,
      livesTotal: document.querySelectorAll('#lives .life').length,
      bossVisible: $('bossBar') ? !$('bossBar').classList.contains('hidden') : null,
      bossName: txt('bossName'),
      bossPhase: txt('bossPhase'),
    },
    st: st ? {
      mode: st.mode, extra: !!st.extra, state: st.state,
      time: +(+st.time || 0).toFixed(2), extraT: +(+st.extraT || 0).toFixed(2),
      bossStarted: !!st.bossStarted, bossPending: !!st.bossPending, bossMid: !!st.bossMid,
      midbossDone: !!st.midbossDone, finished: !!st.finished,
      bullets: st.bullets ? (st.bullets.activeCount != null ? st.bullets.activeCount : -1) : null,
      enemies: st.enemies && st.enemies.list ? st.enemies.list.length : null,
      stgEnemies: st.stg && st.stg.enemies ? st.stg.enemies.length : null,
      px: p ? Math.round(p.x) : null, py: p ? Math.round(p.y) : null,
      player: p ? {
        alive: !!p.alive, lives: p.lives, hearts: p.hearts,
        power: +(+p.power || 0).toFixed(1), maxPower: p.maxPower,
        invuln: +(+p.invuln || 0).toFixed(1), x: Math.round(p.x), y: Math.round(p.y),
        vx: Math.round(p.vx || 0), vy: Math.round(p.vy || 0), dashing: !!p.dashing,
      } : null,
      boss: b ? {
        key: b.key, state: b.state, hp: Math.round(b.hp), maxHp: b.maxHp,
        spellIdx: b.spellIdx, spellCount: b.spellCount, phaseName: b.phaseName,
        spellHp: Math.round(b.spellHp), spellMaxHp: b.spellMaxHp,
        spellLock: +(+b.spellLock || 0).toFixed(2), defeatT: +(+b.defeatT || 0).toFixed(2),
      } : null,
      stg: st.stg ? {
        scroll: Math.round(st.stg.scroll || 0), trigger: st.stg.bossTriggerScroll,
        reachedBoss: !!st.stg.reachedBoss, speed: st.stg.speed,
        waves: st.stg.waves ? st.stg.waves.length : 0, waveIdx: st.stg.waveIdx,
        spawnPaused: !!st.stg.spawnPaused,
      } : null,
      levelW: st.level ? st.level.w : null,
      levelH: st.level ? st.level.h : null,
      progress: st.progress !== undefined ? +(+st.progress).toFixed(3) : null,
    } : null,
  };
  try { s.prog = JSON.parse(localStorage.getItem('hks.progress.v1') || 'null'); }
  catch (e) { s.prog = 'parse-error'; }
  return s;
})()`;

/** 完整状态（不执行断言） */
export async function read(T) { return T.eval(STATE_EXPR); }

/** 读状态并用页面内表达式断言：表达式里用 s.xxx 引用状态（如 s.state==='play'） */
export async function poll(T, expr) {
  return T.eval(`(() => { const s = ${STATE_EXPR}; try { s.ok = !!( ${expr} ); } catch (e) { s.ok = false; s.okErr = String(e); } return s; })()`);
}

export async function openGame({ port = PORT, query = SEED_QUERY, clearStorage = false, reload = false } = {}) {
  const T = await launch({ port, width: 1280, height: 720 });
  if (clearStorage) {
    await T.nav('http://127.0.0.1:8138/index.html');
    await T.waitFor('!!window.__game', 30000);
    await T.eval(`(() => { ['hks.progress.v1','hks.music.v1','hks.settings.v1','hks.keybinds.v1'].forEach((k) => localStorage.removeItem(k)); return 1; })()`);
  }
  await T.boot({ query });
  return T;
}

/** 清存档并 reload，之后停在标题页 */
export async function resetToTitle(T, { query = SEED_QUERY } = {}) {
  await T.eval(`(() => { ['hks.progress.v1','hks.music.v1'].forEach((k) => localStorage.removeItem(k)); return 1; })()`);
  await T.nav('http://127.0.0.1:8138/index.html' + query);
  await T.waitFor('!!window.__game', 30000);
  await sleep(300);
  await drive(T, `s.state === 'menu'`, { timeout: 40000, label: '标题页', press: false });
  return read(T);
}

/* ------------------------------------------------------------------ *
 * 驱动：轮询 + 对话自动连按 Enter（真实确认键）
 * ------------------------------------------------------------------ */
const DLG_LIGHT = `(() => {
  const g = window.__game, d = g.dialogue;
  return { s: g.state, a: !!(d && d.active), i: d ? d.index : -1, sh: d ? d.shown : -1, fu: d ? String(d.fullText || '').length : -1 };
})()`;

/** 连按 Enter 把当前这段对话按完（每按一次都检查对话是否还活跃）；返回按键次数 */
export async function mashDialogue(T, { maxPress = 400 } = {}) {
  let n = 0;
  while (n < maxPress) {
    const l = await T.eval(DLG_LIGHT);
    if (!l.a) return n;
    await T.key('Enter', 14);
    n += 1;
    await sleep(34);
  }
  return n;
}

export async function drive(T, expr, { timeout = 180000, label = '', press = true, pollMs = 130, onTick = null } = {}) {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < timeout) {
    s = await poll(T, expr);
    if (onTick) { try { onTick(s); } catch (e) { /* 记录器自身错误不影响流程 */ } }
    if (s.ok) {
      // 稳定确认：立绘预加载期间 state 会短暂停在 play，随后才进 dialogue。
      // 多等一小段再确认一次，避免把「即将开对话」误判成已自由行动。
      if (press) {
        await sleep(220);
        const s2 = await poll(T, expr);
        if (s2.ok && !s2.dlg) return s2;
        if (s2.dlg) { await mashDialogue(T); continue; }
        s = s2;
      } else {
        return s;
      }
      continue;
    }
    if (press && s.dlg) { await mashDialogue(T); continue; }
    await sleep(pollMs);
  }
  const err = new Error(`drive 超时[${label}] 等待 ${expr}；last=${JSON.stringify(s).slice(0, 1200)}`);
  err.state = s;
  throw err;
}

/** 观察一段时间内是否出现过某种状态（不按键），返回命中的状态或 null */
export async function observe(T, expr, { timeout = 5000, pollMs = 120 } = {}) {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < timeout) {
    s = await poll(T, expr);
    if (s.ok) return s;
    await sleep(pollMs);
  }
  return null;
}

/** 等这一段对话开始（用于验证道中对话真的被触发） */
export async function waitDialogue(T, { timeout = 6000 } = {}) {
  return observe(T, `s.state === 'dialogue' || s.dlg`, { timeout, pollMs: 100 });
}

/** 把当前（可能多段连续的）对话全部按完，直到 expr 满足 */
export async function skipDialogueUntil(T, expr, { timeout = 120000, label = '' } = {}) {
  return drive(T, expr, { timeout, label, press: true });
}

/* ------------------------------------------------------------------ *
 * 加速 / 定位辅助
 * ------------------------------------------------------------------ */
export async function ensureInvuln(T) {
  return T.eval(`(() => { const st = window.__game.stage; if (!st || !st.player) return false; st.player.invuln = 999; return true; })()`);
}

export async function ensureAlive(T) {
  return T.eval(`(() => {
    const st = window.__game.stage; if (!st || !st.player) return null;
    const p = st.player;
    if (!p.alive) { p.alive = true; p.hearts = Math.max(p.hearts || 0, 1); }
    p.invuln = 999;
    return { hearts: p.hearts, lives: p.lives, alive: p.alive };
  })()`);
}

/**
 * 平台关：把玩家瞬移到目标进度 / Boss 触发线附近的实心地面上。
 * 仍然由 Stage.update 的下一次判定触发道中对话 / bossTrigger（不伪造事件）。
 */
export async function warpPlatform(T, { frac = null, boss = false } = {}) {
  return T.eval(`(() => {
    const g = window.__game, st = g.stage, p = st && st.player;
    if (!st || !p) return { ok: false, why: 'no-stage' };
    if (st.mode !== 'platform') return { ok: false, why: 'not-platform' };
    const L = st.level, TILE = 32;
    const bossX = L.w - 520;
    const goalX = st.goalX || (L.w - 300);
    const triggerX = Math.max(200, Math.min(goalX - 120, bossX - 420));
    const targetX = ${boss ? 'triggerX + 48' : `Math.round(L.w * ${Number(frac)})`};
    const cx = Math.max(2, Math.min(L.cols - 3, Math.floor(targetX / TILE)));
    let gy = -1;
    for (let cy = 2; cy < L.rows - 1; cy++) {
      if (L.isSolidTile(cx, cy) && !L.isSolidTile(cx, cy - 1) && !L.isSolidTile(cx, cy - 2)) { gy = cy; break; }
    }
    let ground = false;
    if (gy > 0) { p.x = cx * TILE + 8; p.y = gy * TILE - p.h; ground = true; }
    else { p.x = targetX; }
    p.vx = 0; p.vy = 0; p.invuln = 999;
    if (ground && p.setCheckpoint) p.setCheckpoint(p.x, p.y);
    st._safeSpot = { x: p.x, y: p.y };
    if (st.camera && st.camera.snapTo) st.camera.snapTo(p.x + p.w / 2);
    return { ok: true, x: Math.round(p.x), y: Math.round(p.y), triggerX: Math.round(triggerX), targetX, ground, progress: +((p.x + p.w / 2) / L.w).toFixed(3) };
  })()`);
}

/** STG 关：把滚动条拨到目标进度（仍由 stg.update 判定到线触发 Boss） */
export async function warpStg(T, { frac = null, boss = false, scroll = null } = {}) {
  return T.eval(`(() => {
    const g = window.__game, st = g.stage;
    if (!st || !st.stg) return { ok: false, why: 'no-stg' };
    const stg = st.stg;
    let target;
    if (${scroll != null}) target = ${Number(scroll)};
    else if (${!!boss}) target = Math.max(0, stg.bossTriggerScroll - 2);
    else target = Math.round((stg.bossTriggerScroll || 0) * ${Number(frac == null ? 0 : frac)});
    stg.scroll = target;
    if (st._skipPastWaves) st._skipPastWaves();
    if (st.camera) st.camera.x = stg.scroll;
    return { ok: true, scroll: Math.round(stg.scroll), trigger: stg.bossTriggerScroll, waveIdx: stg.waveIdx, waves: stg.waves ? stg.waves.length : 0 };
  })()`);
}

/** EXTRA：把 extraT + scroll 拨到指定时间（仍由 _updateExtraTimeline 触发 remilia/flandre） */
export async function warpExtraClock(T, at) {
  return T.eval(`(() => {
    const st = window.__game.stage;
    if (!st || !st.stg || !st.extra) return { ok: false, why: 'no-extra-stage' };
    const speed = st.stg.speed || 165;
    st.extraT = ${Number(at)};
    if (!st.bossStarted && !st.bossPending) {
      st.stg.scroll = Math.min(st.stg.bossTriggerScroll, Math.round(${Number(at)} * speed));
      if (st._skipPastWaves) st._skipPastWaves();
    }
    return { ok: true, extraT: st.extraT, scroll: Math.round(st.stg.scroll) };
  })()`);
}

/** 逐张符卡真实击杀 Boss：damage(spellHp+1) → spellBroken → _advanceSpell → defeat → dead */
export async function killBoss(T, { label = 'boss', timeout = 240000, skipDefeatAnim = true, pollMs = 110, onAct = null } = {}) {
  await drive(T, `s.st && s.st.boss`, { timeout: 180000, label: label + ' 出现' });
  await ensureInvuln(T);
  const t0 = Date.now();
  let hits = 0, defs = 0;
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await poll(T, `s.st && (s.st.state === 'clear' || !s.st.boss)`);
    if (last.ok) return { state: last, hits, defeated: true };
    const act = await T.eval(`(() => {
      const st = window.__game.stage;
      if (!st) return null;
      const p = st.player;
      if (p) p.invuln = 999;
      const b = st.boss;
      if (!b) return { none: true };
      if (b.state === 'battle') {
        if (b.spellLock > 0) { b.spellLock = 0; return { unlocked: true, spell: b.spellIdx }; }
        const was = b.spellIdx;
        b.damage(Math.max(1, Math.floor(b.spellHp) + 1));
        return { hit: true, spell: was, count: b.spellCount, state: b.state };
      }
      if (b.state === 'defeat' && b.defeatT < 2.2) {
        if (${skipDefeatAnim ? 'true' : 'false'}) b.defeatT = 2.25;
        return { fastForwardDefeat: true, defeatT: b.defeatT };
      }
      return { wait: b.state };
    })()`);
    if (act && act.hit) { hits += 1; if (onAct) onAct(act); }
    if (act && act.fastForwardDefeat) defs += 1;
    await sleep(pollMs);
  }
  const err = new Error(`killBoss 超时[${label}] hits=${hits} last=${JSON.stringify(last).slice(0, 800)}`);
  err.state = last;
  throw err;
}

/* ------------------------------------------------------------------ *
 * 流程动作
 * ------------------------------------------------------------------ */
export async function startRun(T, { diff = 'KeyE', char = 'Digit1' } = {}) {
  await drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '标题页', press: false });
  await T.key('Enter', 22); await sleep(320);
  await T.key(diff, 22); await sleep(320);
  await T.key(char, 22); await sleep(320);
  return drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 180000, label: '进入第一面' });
}

export async function quitToTitle(T) {
  await T.key('Escape', 22);
  await drive(T, `s.state === 'paused'`, { timeout: 15000, label: '暂停面板', press: false });
  await T.key('KeyQ', 22);
  return drive(T, `s.state === 'menu' && s.st === null`, { timeout: 20000, label: '退出到标题', press: false });
}

/** 让玩家耗尽残机触发 GameOver（真实 hurt→die→deathT→respawn false→gameover） */
export async function dieToGameOver(T, { label = 'gameover' } = {}) {
  await ensureAlive(T);
  const setup = await T.eval(`(() => {
    const st = window.__game.stage; if (!st || !st.player) return { ok: false };
    const p = st.player;
    p.lives = 1; p.hearts = 1; p.invuln = 0; p.alive = true; p.casting = 0;
    p.hurt(1);
    return { ok: true, lives: p.lives, hearts: p.hearts, alive: p.alive };
  })()`);
  const s = await drive(T, `s.state === 'gameover'`, { timeout: 60000, label, press: false });
  return { setup, state: s };
}

/** 点击面板按钮（键盘失效时的等价用户操作；仍走按钮真实 click 处理器） */
export async function clickPanelButton(T, idx = 0) {
  return T.eval(`(() => {
    const bs = document.querySelectorAll('#buttons .btn');
    const b = bs[Math.min(${Number(idx)}, bs.length - 1)];
    if (!b) return null;
    const txt = String(b.textContent || '').replace(/\\s+/g, ' ').trim();
    b.click();
    return { idx: ${Number(idx)}, text: txt };
  })()`);
}

/**
 * GameOver → 续命。先真实按 Enter（验证键盘路径），若 gameover 面板对键盘无响应
 * （已知 bug：main.js 只在 menu/paused 状态处理菜单键），退回按钮 click 把流程走下去。
 */
export async function continueFromGameOver(T) {
  const before = await read(T);
  await T.key('Enter', 22);
  let s = await observe(T, `s.state !== 'gameover'`, { timeout: 1800 });
  let keyboardWorks = !!s;
  let clicked = null;
  if (!s) {
    clicked = await clickPanelButton(T, 0);
    s = await observe(T, `s.state !== 'gameover'`, { timeout: 3000 });
  }
  const f = await drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 120000, label: '续命重开本关' });
  f.keyboardWorks = keyboardWorks;
  f.clicked = clicked;
  f.before = before;
  return f;
}

/** GameOver → 返回标题（同样先验证 Esc，再退回按钮点击） */
export async function gameOverToTitle(T) {
  const before = await read(T);
  await T.key('Escape', 22);
  let s = await observe(T, `s.state !== 'gameover'`, { timeout: 1800 });
  const keyboardWorks = !!s;
  let clicked = null;
  if (!s) {
    const n = await T.eval(`document.querySelectorAll('#buttons .btn').length`);
    clicked = await clickPanelButton(T, Math.max(0, n - 1));
    s = await observe(T, `s.state !== 'gameover'`, { timeout: 3000 });
  }
  const f = await drive(T, `s.state === 'menu'`, { timeout: 30000, label: 'GameOver 返回标题', press: false });
  f.keyboardWorks = keyboardWorks;
  f.clicked = clicked;
  f.before = before;
  return f;
}

/* ------------------------------------------------------------------ *
 * 结局页动作
 * ------------------------------------------------------------------ */
export async function advanceEnding(T, n = 1, { wait = 220 } = {}) {
  const before = await read(T);
  for (let i = 0; i < n; i++) { await T.key('Enter', 20); await sleep(wait); }
  const after = await read(T);
  return { before, after };
}

/* ------------------------------------------------------------------ *
 * 结果收集（截图 + report.json + findings.json）
 * ------------------------------------------------------------------ */
export class Run {
  constructor(name, T) {
    this.name = name;
    this.T = T;
    this.checks = [];
    this.findings = [];
    this.accel = [];
    this.evidence = [];
    this.snaps = {};
    this.t0 = Date.now();
  }
  chk(ok, name, detail = '') {
    const row = { ok: !!ok, name, detail: String(detail).slice(0, 700) };
    this.checks.push(row);
    if (!ok) this.error = true;
    return !!ok;
  }
  info(name, detail = '') { this.checks.push({ ok: true, info: true, name, detail: String(detail).slice(0, 700) }); }
  accelNote(txt) { if (!this.accel.includes(txt)) this.accel.push(txt); }
  finding(f) {
    const rec = {
      id: f.id, title: f.title, severity: f.severity || 'minor',
      where: f.where || '', steps: f.steps || [], expect: f.expect || '',
      actual: f.actual || '', evidence: f.evidence || [], snapshot: f.snapshot || {},
      accel: f.accel || this.accel.join('；'),
    };
    this.findings.push(rec);
    return rec;
  }
  async shot(label) {
    const f = `${BASE_OUT}/${this.name}/${label}.png`;
    await this.T.shot(f);
    this.evidence.push(f);
    return f;
  }
  snap(key, s) { this.snaps[key] = s; }
  summary() {
    const fail = this.checks.filter((c) => !c.ok && !c.info).length;
    const pass = this.checks.filter((c) => c.ok && !c.info).length;
    return { pass: fail === 0, passCount: pass, failCount: fail, findings: this.findings.length, ms: Date.now() - this.t0 };
  }
  async write(extra = {}) {
    const report = {
      name: this.name, ...this.summary(), accel: this.accel, evidence: this.evidence,
      checks: this.checks, snaps: this.snaps, ...extra,
    };
    saveJson(`${BASE_OUT}/${this.name}/report.json`, report);
    saveJson(`${BASE_OUT}/${this.name}/findings.json`, this.findings);
    return report;
  }
}

/**
 * 把单个脚本的结果并入 _pt/flow_chain/report.json（按 section 分节）与 findings.json。
 * 所有脚本都结束后，report.json 里的 summary 是各分节汇总。
 */
export function writeCombined(section, report, findings) {
  const reportFile = `${BASE_OUT}/report.json`;
  const findFile = `${BASE_OUT}/findings.json`;
  let all = {};
  try { all = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch (e) { all = {}; }
  all[section] = report;
  // 汇总
  const runs = Object.entries(all).map(([k, v]) => ({
    section: k, pass: !!v.pass,
    passCount: v.passCount || 0, failCount: v.failCount || 0,
    findings: (v.findings || 0), ms: v.ms || 0,
  }));
  all.summary = {
    sections: runs,
    pass: runs.every((r) => r.pass),
    failCount: runs.reduce((a, r) => a + r.failCount, 0),
  };
  saveJson(reportFile, all);

  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(findFile, 'utf8')); } catch (e) { prev = []; }
  const keep = prev.filter((f) => f.run !== section);
  saveJson(findFile, [...keep, ...findings.map((f) => ({ ...f, run: section }))]);
  return all.summary;
}

export { snapshot, saveJson };
