/**
 * 修复后回归（Lead 终验）：验证 5 条修复 + 软光栅性能优化 + 基本无回归。
 *   R1 音乐室「未遇曲目」鼠标点播放能播（原先死循环）+ 持久化
 *   R2 帮助页 hint 与真实键位一致
 *   R3 设置页「重置进度」有 KeyX 热键
 *   R4 未解锁 EXTRA 有反馈
 *   R5 GameOver 面板键盘 Enter/Esc 可用
 *   R6 主流程 smoke（开火/暂停/恢复）
 *   R7 软光栅渲染降级后 6s 平均帧间隔（优化前基线 144ms）
 *   R8 设置持久化 reload
 * 运行：node tools/_pt_lead_regression.mjs   （需 8138 服务器）
 */
import { launch, snapshot, makeChecks, saveJson, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/lead_regression';
mkdirSync(OUT, { recursive: true });
const C = makeChecks();
const notes = [];
const T = await launch({ port: 9448, width: 1280, height: 720 });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

const click = async (sel) => {
  const pt = await T.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)});
    if (!b) return null; const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (!pt) return false;
  await T.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await sleep(40);
  await T.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await T.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(120);
  return true;
};
const vis = (sel) => T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false;
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return !!(r.width && r.height) && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.classList.contains('hidden'); })()`);
const text = (sel) => T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
const panelTitle = () => text('#overlay .panel-title') || text('#overlay h2') || '';
const menuState = () => G(`(() => ({ state: g.state, page: g._page || '', idx: g.menuIndex,
  hint: document.querySelector('#overlay .panel-hint')?.textContent.trim() || '',
  title: document.querySelector('#overlay .panel-title')?.textContent.trim() || '' }))()`);

async function startRun(diffKey = 'KeyE', charKey = 'Digit1') {
  await T.tap('Enter'); await sleep(300);
  await T.tap(diffKey); await sleep(200);
  await T.tap(charKey); await sleep(300);
  for (let i = 0; i < 80; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) return s;
    await T.tap('Enter');
    await sleep(70);
  }
  return snapshot(T);
}

try {
  /* ================= R1 音乐室鼠标修复 ================= */
  await T.boot();
  await sleep(600);
  await T.tap('KeyM');
  await sleep(500);
  C.chk(await vis('#musicRoom'), 'R1 标题 KeyM 打开音乐回忆室');
  const locked = await T.eval(`(() => { const rows = [...document.querySelectorAll('#musicRoom .mr-row.is-locked')];
    if (!rows.length) return null; const i = [...document.querySelectorAll('#musicRoom .mr-row')].indexOf(rows[0]);
    const r = rows[0].getBoundingClientRect(); return { i, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
  C.chk(!!locked, 'R1 存在未遇曲目行（锁定）', JSON.stringify(locked));
  if (locked) {
    await T.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: locked.x, y: locked.y });
    await sleep(60);
    await T.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: locked.x, y: locked.y, button: 'left', clickCount: 1 });
    await T.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: locked.x, y: locked.y, button: 'left', clickCount: 1 });
    await sleep(400);
    const warnOpen = await vis('#musicRoom .mr-warn');
    C.chk(warnOpen, 'R1 点未遇曲目弹出确认框', String(warnOpen));
    await T.shot(`${OUT}/r1-warn-open.png`);
    const before = await G(`(() => ({ song: g.audio.currentSong || null, musicOn: !!g.audio.musicOn }))()`);
    if (warnOpen) {
      await click('#musicRoom .mr-warn-btn[data-act="play"]');
      await sleep(700);
      const warnAfter = await vis('#musicRoom .mr-warn');
      const after = await G(`(() => { const key = g.musicRoom?.tracks?.[${locked.i}]?.key;
        return { key, song: g.audio.currentSong || null, musicOn: !!g.audio.musicOn, heard: g.musicRoom?.isHeard ? g.musicRoom.isHeard(key) : null }; })()`);
      C.chk(!warnAfter, 'R1 点「播放」后确认框关闭且不再重开（修复目标）', `warnStillOpen=${warnAfter}`);
      C.chk(after.song === after.key && after.musicOn, 'R1 点「播放」真的开始播放该曲', JSON.stringify({ before, after }));
      C.chk(after.heard === true, 'R1 播放后写入已听记录', String(after.heard));
      await T.shot(`${OUT}/r2-warn-played.png`);
    }
  }
  // 键盘路径未回归：再挑一个锁定行用 Enter 播放
  const locked2 = await T.eval(`(() => { const rows = [...document.querySelectorAll('#musicRoom .mr-row.is-locked')];
    if (!rows.length) return null; return [...document.querySelectorAll('#musicRoom .mr-row')].indexOf(rows[0]); })()`);
  if (locked2 != null) {
    await G(`g.musicRoom.index = ${locked2}; g.musicRoom._paint(); g.musicRoom._paintList(); g.musicRoom._reveal?.(); true`);
    await sleep(150);
    await T.tap('Enter');            // _requestPlay → warn
    await sleep(300);
    C.chk(await vis('#musicRoom .mr-warn'), 'R1b 键盘 Enter 打开确认框');
    await T.tap('Enter');            // 确认播放
    await sleep(600);
    const kb = await G(`(() => { const key = g.musicRoom?.tracks?.[${locked2}]?.key;
      return { key, song: g.audio.currentSong || null, warn: !!g.musicRoom?._warn, heard: g.musicRoom.isHeard(key) }; })()`);
    C.chk(!kb.warn && kb.song === kb.key && kb.heard, 'R1b 键盘确认后正常播放（未回归）', JSON.stringify(kb));
  }
  await T.tap('Escape'); await sleep(400);
  C.chk(await G(`g.state`) === 'menu', 'R1 音乐室 Esc 返回标题');
  // reload 持久化
  await T.reload();
  await sleep(800);
  const persist = await G(`(() => { const tr = g.musicRoom?.tracks?.[${locked ? locked.i : 0}];
    return { heard: tr ? g.musicRoom.isHeard(tr.key) : null, songs: (g._heardSongs || []).length }; })()`);
  C.eq(persist.heard, true, 'R1 刷新后已听记录保留', JSON.stringify(persist));

  /* ================= R2 帮助页 hint ================= */
  await T.tap('Slash'); await sleep(400);
  const help = await menuState();
  notes.push('帮助页: ' + JSON.stringify(help));
  C.chk(/操作说明/.test(help.title), 'R2 Slash 打开操作说明', help.title);
  C.chk(!/S\s*返回/.test(help.hint), 'R2 hint 不再写错误的「S 返回」', help.hint);
  await T.shot(`${OUT}/r3-help-hint.png`);
  await T.tap('Escape'); await sleep(300);

  /* ================= R3 设置页 X 热键 ================= */
  await T.tap('KeyS'); await sleep(400);
  const xRow = await G(`(() => { const b = [...document.querySelectorAll('#overlay .btn')].find(b => b._spec?.key === 'X');
    return b ? { hotkey: b._spec.hotkey || null, text: b.textContent.trim().replace(/\\s+/g,' ').slice(0,20) } : null; })()`);
  C.chk(!!xRow, 'R3 设置页存在「重置进度」行', JSON.stringify(xRow));
  C.eq(xRow && xRow.hotkey, 'KeyX', 'R3 重置进度行有 KeyX 热键（修复目标）', JSON.stringify(xRow));
  await T.shot(`${OUT}/r4-settings-x.png`);
  await T.tap('KeyX'); await sleep(400);
  const reset = await menuState();
  C.chk(/重置进度/.test(reset.title), 'R3 按 X 进入重置进度页', JSON.stringify(reset));
  const selCancel = await G(`(() => { const b = window.__game.menuButtons[window.__game.menuIndex];
    return { text: b ? b.textContent.trim().replace(/\\s+/g,' ').slice(0,12) : null }; })()`);
  C.chk(/取消/.test(selCancel.text || ''), 'R3 重置页默认高亮「取消」', JSON.stringify(selCancel));
  await T.tap('Enter'); await sleep(400);       // 取消 → 回设置
  C.chk(/设置/.test(await panelTitle()), 'R3 取消后返回设置页', await panelTitle());
  await T.tap('Escape'); await sleep(300);
  C.chk(await G(`g.state`) === 'menu', 'R3 Esc 回到标题');

  /* ================= R4 未解锁 EXTRA 反馈 ================= */
  const unlocked = await G(`g.unlockedExtra`);
  C.eq(unlocked, false, 'R4 当前未解锁 EXTRA（前置）');
  await T.tap('KeyE'); await sleep(500);
  const extra = await menuState();
  notes.push('未解锁 EXTRA 按键后: ' + JSON.stringify(extra));
  C.eq(extra.state, 'menu', 'R4 未解锁时按 E 不进入（不导航）');
  const notice = (msg) => (/EXTRA|解锁|禁忌/.test(msg));
  C.chk(notice(extra.hint), 'R4 未解锁按 E 有可见提示（修复目标）', `hint=${extra.hint}`);
  await T.shot(`${OUT}/r5-extra-notice.png`);

  /* ================= R5 GameOver 键盘 ================= */
  await T.tap('Enter'); await sleep(300);
  await startRun();
  C.chk((await snapshot(T)).state === 'play', 'R5 进入 play');
  await G(`(() => { g.lives = 0; g.runLives = 0; g._onGameOver(); return true; })()`);
  await sleep(400);
  C.eq(await G(`g.state`), 'gameover', 'R5 进入 gameover 面板');
  await T.shot(`${OUT}/r6-gameover.png`);
  const c0 = await G(`g.continues`);
  await T.tap('Enter'); await sleep(700);
  const afterEnter = await G(`(() => ({ state: g.state, continues: g.continues }))()`);
  C.chk(afterEnter.state !== 'gameover', 'R5 Enter 能离开 gameover（修复目标）', JSON.stringify(afterEnter));
  C.eq(afterEnter.continues, c0 + 1, 'R5 Enter 续命计数 +1', JSON.stringify({ c0, afterEnter }));
  await T.shot(`${OUT}/r7-after-enter.png`);
  await G(`(() => { g._onGameOver(); return true; })()`);
  await sleep(400);
  await T.tap('Escape'); await sleep(600);
  const afterEsc = await G(`g.state`);
  C.eq(afterEsc, 'menu', 'R5 Esc 能从 gameover 返回标题（修复目标）');
  await T.shot(`${OUT}/r8-after-esc.png`);

  /* ================= R6/R7 主流程 + 软光栅性能 ================= */
  const s = await startRun();
  C.eq(s.state, 'play', 'R6 再次进入 play');
  // 真开火 + 右移 1.2s
  await T.keyDown('ArrowRight');
  await T.keyDown('KeyZ');
  await sleep(1200);
  const shots = await G(`(() => { const s = g.stage?.shots; if (!s) return -1; let n = 0; for (const b of s.pool) if (b.active) n++; return n; })()`);
  C.chk(shots > 0, 'R6 开火产生玩家弹', String(shots));
  // 暂停/恢复
  await T.tap('Escape'); await sleep(300);
  C.eq(await G(`g.state`), 'paused', 'R6 Esc 暂停');
  await T.tap('Escape'); await sleep(300);
  C.eq(await G(`g.state`), 'play', 'R6 Esc 恢复');
  // 帧探针 6s（保持开火，软光栅降级后应显著好于 144ms 基线）
  await T.eval(`(() => { const loop = window.__game.loop; const T = { t: [], last: performance.now(), long: [], obs: new PerformanceObserver((l) => { for (const e of l.getEntries()) T.long.push(Math.round(e.duration)); }) };
    try { T.obs.observe({ entryTypes: ['longtask'] }); } catch {}
    window.__probe = { frames: 0, last: performance.now(), gaps: [], longs: [], t0: performance.now() };
    const step = (ts) => { const p = window.__probe; if (!p) return; p.gaps.push(ts - p.last); p.last = ts;
      if (p.gaps.length >= 90) { p.done = true; return; } requestAnimationFrame(step); };
    requestAnimationFrame(step); return true; })()`);
  await sleep(6500);
  const probe = await T.eval(`(() => { const p = window.__probe || {}; const g = (p.gaps || []).slice(1);
    const sorted = [...g].sort((a,b)=>a-b);
    const q = (x) => sorted.length ? +sorted[Math.min(sorted.length-1, Math.floor(sorted.length*x))].toFixed(1) : null;
    return { frames: g.length, avg: g.length ? +(g.reduce((a,b)=>a+b,0)/g.length).toFixed(1) : null,
      p50: q(0.5), p95: q(0.95), worst: g.length ? +Math.max(...g).toFixed(1) : null,
      renderer: window.__rendererInfo || null,
      canvas: [document.querySelector('#game canvas')?.width, document.querySelector('#game canvas')?.height] }; })()`);
  notes.push('软光栅帧探针(修复后): ' + JSON.stringify(probe));
  C.chk(probe.frames >= 30, 'R7 帧探针有数据', JSON.stringify(probe));
  C.chk(probe.avg != null && probe.avg < 100, 'R7 软光栅平均帧间隔 < 100ms（优化前 144ms）', `avg=${probe.avg}ms p95=${probe.p95} worst=${probe.worst} renderer=${JSON.stringify(probe.renderer)}`);
  await T.keyUp('KeyZ'); await T.keyUp('ArrowRight');
  await T.shot(`${OUT}/r10-play.png`);

  /* ================= R8 设置持久化 ================= */
  await T.tap('Escape'); await sleep(300);
  await T.tap('KeyS'); await sleep(400);        // 暂停→设置
  for (let i = 0; i < 12; i++) {                 // 找到帧率行并切到 120
    const cur = await menuState();
    const key = await G(`(() => { const b = window.__game.menuButtons[window.__game.menuIndex]; return b?._spec?.key || null; })()`);
    if (!key) break;
    if (/设置/.test(cur.title) && cur.idx != null && key === 'F') { await T.tap('Enter'); break; }
    await T.tap('ArrowDown'); await sleep(90);
  }
  const fc = await G(`g.frameCap`);
  notes.push('切换后 frameCap=' + fc);
  await T.tap('Escape'); await sleep(250);
  await T.tap('Escape'); await sleep(300);
  await T.reload(); await sleep(900);
  const fc2 = await G(`g.frameCap`);
  C.eq(fc2, fc, 'R8 frameCap 刷新后保持', JSON.stringify({ fc, fc2 }));
  await T.tap('Escape');
} catch (e) {
  C.chk(false, '回归运行异常', String(e && e.message ? e.message : e));
  notes.push('异常: ' + String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e));
} finally {
  const rep = await T.report().catch(() => null);
  if (rep) {
    C.chk(rep.errors.length === 0, '全流程无 JS 异常', rep.errors.slice(0, 3).join(' | '));
    C.chk(rep.httpBad.length === 0, '全流程无 HTTP 4xx/5xx', JSON.stringify(rep.httpBad.slice(0, 5)));
    C.chk(rep.netFails.length === 0, '全流程无网络失败', JSON.stringify(rep.netFails.slice(0, 5)));
    notes.push(`资源 ${rep.resources?.length ?? '?'} 个；errors=${rep.errors.length} httpBad=${rep.httpBad.length} netFails=${rep.netFails.length}`);
  }
  try { await T.close(); } catch {}
}

const sum = C.sum();
saveJson(`${OUT}/report.json`, { ...sum, notes, generatedAt: new Date().toISOString() });
console.log(JSON.stringify({ pass: sum.pass, fail: sum.fail, notes }, null, 2));
process.exit(0);
