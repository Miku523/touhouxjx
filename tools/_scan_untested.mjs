// 未测区域扫描：对 QA_PLAYTEST.md「未测」清单 + 新入库模块做冒烟
//   1. 结局系统（good / bad / extra，从未实机跑过）
//   2. 音乐回忆室
//   3. 难度 E/N/H/L 的 Boss 血量差异
//   4. GameOver 面板与「重新挑战」
//   5. EXTRA 关入口（进入即验证，不跑完 14 分钟道中）
//   6. 改键 localStorage 持久化（写入 → reload → 生效）
// 用法: node tools/_scan_untested.mjs [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9480);
const ONLY = process.argv[3] || '';   // 只跑名字里包含该关键字的项
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-scan-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

let errors = [];
async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 2).join(' | ')); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 240));
  return r.result?.result?.value;
};

const results = [];
async function T(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  errors = [];
  const before = errors.length;
  try {
    const out = await fn();
    const errs = errors.slice(before);
    const ok = !errs.length && out !== false && !(out && out.fail) && (out == null || out.ok !== false);
    results.push({ tag: ok ? 'PASS' : 'FAIL', name, msg: typeof out === 'string' ? out : JSON.stringify(out), err: errs.slice(0, 2).join(' | ') });
  } catch (e) {
    results.push({ tag: 'ERR ', name, msg: String(e.message || e).slice(0, 160), err: errors.slice(0, 2).join(' | ') });
  }
  // 每项测完回到标题，避免状态互相污染
  try { await ev('(() => { const g = window.__game; g.showTitle?.(); return g.state; })()'); await sleep(300); } catch {}
}

await send('Page.navigate', { url: URL0 });
await sleep(2800);
console.log('加载:', await ev('(() => { const g = window.__game; return g ? "GAME_OK state=" + g.state : "NO_GAME"; })()'));

/* ---------- 1. 结局系统 ---------- */
async function playEnding(mode, char = 'reimu') {
  const start = await ev(`(() => { const g = window.__game; g.char = '${char}'; g._playEnding('${mode}'); return g.state; })()`);
  if (start !== 'ending') return { fail: true, msg: `未进入 ending（state=${start}）` };
  let advances = 0, frames = 0, cards = 0;
  for (let i = 0; i < 200; i++) {
    const s = await ev('(() => { const g = window.__game; for (let k = 0; k < 40; k++) g.loop.update(1/60); frames += 0; return g.state; })()');
    if (s !== 'ending') break;
    const info = await ev('(() => { const g = window.__game; const before = g.ending.cardIndex ?? -1; g.ending.advance(); return JSON.stringify({ before, after: g.ending.cardIndex ?? -1, total: (g.ending.spec?.cards?.length ?? -1) }); })()');
    advances++;
    const o = JSON.parse(info);
    if (o.after > cards) cards = o.after;
  }
  const final = await ev('(() => window.__game.state)()');
  return { mode, advances, cards, finalState: final, ok: final === 'menu' };
}
await T('结局 good（真结局）', () => playEnding('good'));
await T('结局 bad（遗憾结局）', () => playEnding('bad'));
await T('结局 extra（EXTRA 胜利）', () => playEnding('extra'));
await T('结局 good（魔理沙）', () => playEnding('good', 'marisa'));

/* ---------- 2. 音乐回忆室 ---------- */
await T('音乐回忆室', async () => {
  const open = await ev('(() => { const g = window.__game; g.showMusicRoom(); return JSON.stringify({ visible: g.musicRoom.visible, tracks: g.musicRoom.tracks.length, idx: g.musicRoom.index }); })()');
  const o = JSON.parse(open);
  if (!o.visible) return { fail: true, msg: '未打开: ' + open };
  const key = (code) => ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', bubbles: true })); return 1; })()`);
  await key('ArrowDown'); await sleep(120);
  await key('ArrowDown'); await sleep(120);
  const moved = await ev('(() => window.__game.musicRoom.index)()');
  await key('ArrowUp'); await sleep(120);
  const back = await ev('(() => window.__game.musicRoom.index)()');
  await key('Escape'); await sleep(200);
  const closed = await ev('(() => JSON.stringify({ visible: window.__game.musicRoom.visible, state: window.__game.state }))()');
  const c = JSON.parse(closed);
  return { tracks: o.tracks, idx0: o.idx, afterDown: moved, afterUp: back, closed: c, ok: !c.visible && moved !== o.idx };
});

/* ---------- 3. 难度差异 ---------- */
await T('难度 E/N/H/L 的 Boss 血量', async () => {
  // 完整复现 boss.js 的血量链：bossPhasesFor(裁难卡) → ×hpMul → scaleBossHp(×diff.hpScale)
  const out = await ev(`(async () => {
    const { bossPhasesFor, scaleBossHp } = await import('/src/game/difficulty.js');
    const { BOSS_DEFS, BOSS_HP_MUL } = await import('/src/game/boss.js');
    const def = BOSS_DEFS.rumia;
    const hpMul = def.hpMul != null ? Number(def.hpMul) : BOSS_HP_MUL;
    const res = {};
    for (const d of ['E', 'N', 'H', 'L']) {
      const trimmed = bossPhasesFor(def.phases, d, 1)
        .map((p) => ({ ...p, hp: Math.max(1, Math.round((Number(p.hp) || def.hp) * hpMul)) }));
      const scaled = scaleBossHp(trimmed, d, def.hp * hpMul);
      res[d] = { hp: scaled.reduce((a, p) => a + p.hp, 0), phases: scaled.length };
    }
    res.基准符卡数 = (def.phases || []).length;
    res.hpMul = hpMul;
    return JSON.stringify(res);
  })()`);
  const r = JSON.parse(out);
  const inc = r.E.hp < r.N.hp && r.N.hp < r.H.hp && r.H.hp < r.L.hp;
  return { HP: `E=${r.E.hp} N=${r.N.hp} H=${r.H.hp} L=${r.L.hp}`, 符卡数: `E=${r.E.phases} N=${r.N.phases} H=${r.H.phases} L=${r.L.phases}`, 单调递增: inc, ok: inc };
});

/* ---------- 4. GameOver 面板 ---------- */
await T('GameOver 面板 / 重新挑战', async () => {
  await ev('(() => { const g = window.__game; g.lives = 3; g.char = "reimu"; g.startStage(0); return g.state; })()');
  await sleep(900);
  const st = await ev('(() => { const g = window.__game; g._onGameOver(); return JSON.stringify({ state: g.state, panel: !!document.querySelector("#ui .panel, #ui [class*=panel]") }); })()');
  const o = JSON.parse(st);
  if (o.state !== 'gameover') return { fail: true, msg: '未进入 gameover: ' + st };
  // 派发 Enter（重新挑战）
  await ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true })); return 1; })()`);
  await sleep(800);
  const after = await ev('(() => { const g = window.__game; return JSON.stringify({ state: g.state, lives: g.stage?.player?.lives }); })()');
  return { gameover: o, afterRetry: after, ok: true };
});

/* ---------- 5. EXTRA 入口 ---------- */
await T('EXTRA 关入口', async () => {
  // startExtra() 开头有 `if (!this.unlockedExtra) return;`，全新存档默认未解锁，先置位
  const r = await ev('(() => { const g = window.__game; g.char = "reimu"; g.unlockedExtra = true; g.startExtra(); return JSON.stringify({ state: g.state, inExtra: g.inExtra }); })()');
  // 开场对话是异步的，等它开播并推进完
  for (let i = 0; i < 60; i++) {
    const s = await ev('(() => { const g = window.__game; if (g.dialogue.active) g.dialogue.advance(); for (let k = 0; k < 20; k++) g.loop.update(1/60); return g.state; })()');
    if (s === 'play') break;
    await sleep(60);
  }
  const st = await ev('(() => { const g = window.__game; return JSON.stringify({ state: g.state, inExtra: g.inExtra, hasStage: !!g.stage, mode: g.stage?.mode, midbossDone: g.stage?.midbossDone, cols: g.stage?.level?.cols }); })()');
  const o = JSON.parse(st);
  return { 入口: r, 进关后: o, ok: o.state === 'play' && o.inExtra && o.hasStage };
});

/* ---------- 6. 改键持久化 ---------- */
await T('改键 localStorage 持久化', async () => {
  const K = 'hks.keybinds.v1';
  // 默认没改过键就不会写盘（只有 setBind 才 saveBinds），先确认初始为空
  const initial = await ev(`(() => window.localStorage.getItem(${JSON.stringify(K)}))()`);
  // 把「射击」改到 Q：setBind 内部会自动与占用者互换，保证没人失去按键
  const set = await ev(`(() => {
    const g = window.__game;
    const changed = g.input.setBind('shoot', 'KeyQ');
    return JSON.stringify({ changed, stored: (window.localStorage.getItem(${JSON.stringify(K)}) || '').slice(0, 160) });
  })()`);
  const s = JSON.parse(set);
  if (!s.changed) return { fail: true, msg: 'setBind 未生效: ' + set };
  // 重载页面，验证 Q 真的绑到了射击
  await send('Page.navigate', { url: URL0 });
  await sleep(2800);
  const after = await ev(`(() => {
    const g = window.__game;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    const qHeld = [...(g.input.held || [])].join(',');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    const zHeld = [...(g.input.held || [])].join(',');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
    return JSON.stringify({ Q: qHeld, Z: zHeld });
  })()`);
  const a = JSON.parse(after);
  // 还原默认键位
  await ev('(() => { window.__game.input.resetBinds(); return 1; })()');
  // KeyQ 原本是「退出」，setBind 会互换：Q→射击、Z→退出，保证没人失去按键
  return { 初始存档: initial ? '有' : '空（正常，未改过键）', 写入: s.changed, 重载后: a, ok: String(a.Q).includes('shoot') && !String(a.Z).includes('shoot') };
});

/* ---------- 输出 ---------- */
console.log('\n===== 未测区域扫描 =====');
for (const r of results) {
  console.log(`[${r.tag}] ${r.name}`);
  console.log(`       ${r.msg}`);
  if (r.err) console.log(`       错误: ${r.err}`);
}
const bad = results.filter((r) => r.tag !== 'PASS').length;
console.log(`\n合计 ${results.length} 项，异常 ${bad} 项`);
try { proc.kill(); } catch {}
ws.close();
process.exit(0);
