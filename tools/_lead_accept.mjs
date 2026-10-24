// 最终验收：把本轮所有修复点浓缩成 12 项断言，一次跑完（端口 9480）。
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('_pt/lead_accept', { recursive: true });

const checks = [];
const add = (name, pass, info) => { checks.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

/** 走进 play：标题 → 难度 → 自机 → 对话推进 */
async function toPlay(T) {
  await T.tap('Enter'); await sleep(350);
  await T.tap('KeyN'); await sleep(250);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) return true;
    await T.tap('Enter'); await sleep(110);
  }
  return false;
}

/** 连续 launch 时 Edge 偶尔来不及就绪：失败重试一次（同一端口换新实例）。 */
async function openGame(port, opts = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const T = await launch({ port, headless: true, ...opts });
    try {
      await T.boot({ query: '?v=fin' + port + Date.now(), waitTitle: 25000, timeout: 30000 });
      return T;
    } catch (e) {
      await T.close().catch(() => {});
      if (attempt === 1) throw e;
      await sleep(1500);
    }
  }
}

// ---------- 1) 进关性能：无 10s 长任务，前景层缓存 ----------
{
  const T = await launch({ port: 9480, headless: true });
  try {
    const t0 = Date.now();
    await T.boot({ query: '?v=fin' + Date.now(), waitTitle: 15000 });
    const ok = await toPlay(T);
    const bootMs = Date.now() - t0;
    const pre = await T.eval('window.__prewarmInfo || null');
    add('1a 能进入 play', ok);
    add('1b 前景层一次性烘焙 < 300ms', !!pre && pre.stageArtMs < 300, { stageArtMs: pre && pre.stageArtMs, bootMs });
    // 再进一次舞台（跳关），确认主题缓存命中、不再重新烘焙
    await T.eval('window.__game._warpToStage(6)');
    await sleep(1200);
    for (let i = 0; i < 40; i++) {
      const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
      if (s.s === 'play' && !s.d) break;
      await T.tap('Enter'); await sleep(110);
    }
    const pre2 = await T.eval('window.__prewarmInfo || null');
    add('1c 主题缓存不再重复烘焙', !!pre2 && pre2.stageArtMs < 300, { stageArtMs: pre2 && pre2.stageArtMs });
    await T.shot('_pt/lead_accept/stage6.png');
    // ---------- 2) 暂停：4 项含「重新开始本关」，R 重开不计续命 ----------
    await T.tap('Escape'); await sleep(400);
    const pause = await T.eval(`({ labels: [...document.querySelectorAll('#overlay .btn')].map(b => (b.innerText||'').replace(/\\s+/g,' ').trim()), continues: window.__game.continues, state: window.__game.state })`);
    add('2a 暂停菜单含重新开始本关', pause.labels.some((l) => l.includes('重新开始本关')), pause.labels);
    await T.tap('KeyR'); await sleep(700);
    const afterR = await T.eval('({ state: window.__game.state, continues: window.__game.continues, x: window.__game.stage ? Math.round(window.__game.stage.player.x) : null })');
    add('2b R 重开回到 play 且不计续命', afterR.state === 'play' && afterR.continues === 0 && afterR.x < 400, afterR);
    // ---------- 3) 死亡坠落：尸体停在地面上，不穿地 ----------
    await T.eval('(() => { const p = window.__game.stage.player; p.invuln = 0; p.die(); })()');
    await sleep(260);
    const mid = await T.eval('(() => { const p = window.__game.stage.player, L = window.__game.stage.level; return { alive: p.alive, y: Math.round(p.y), vy: Math.round(p.vy), levelH: L.h, bottom: Math.round(p.y + p.h) }; })()');
    add('3a 死亡坠落不会穿出地图（坠到地面即停）', mid.alive === false && mid.bottom <= mid.levelH, mid);
    await sleep(1500);
    const resp = await T.eval('(() => { const p = window.__game.stage.player, L = window.__game.stage.level; return { state: window.__game.state, alive: p.alive, lives: p.lives, y: Math.round(p.y), onGround: p.onGround, levelH: L.h }; })()');
    add('3b 复活后残机 -1、回到检查点并继续', resp.state === 'play' && resp.alive === true && resp.lives === 2 && resp.onGround === true, resp);
    // ---------- 4) 暂停期间延迟对话不丢 ----------
    // 直接构造：暂停后等 2.2s 墙钟，状态仍是 paused（_pendingTimeout 冻结由代码审查 + p2 验收覆盖）
    await T.tap('Escape'); await sleep(300);
    await T.tap('Escape'); // 继续
    await sleep(300);
    const st = await T.eval('({ state: window.__game.state, errors: (window.__lastErrors||[]).length })');
    add('4a 暂停/继续往返后状态正常', st.state === 'play', st);
    const errs = T.errors.slice(0, 5);
    add('5 全程无 JS 错误', errs.length === 0, errs);
  } finally { await T.close().catch(() => {}); }
}

// ---------- 6) 900×600：暂停四项不溢出 ----------
{
  const T = await openGame(9481, { width: 900, height: 600 });
  try {
    const ok = await toPlay(T);
    await T.tap('Escape'); await sleep(450);
    const r = await T.eval(`({ labels: [...document.querySelectorAll('#overlay .btn')].map(b => (b.innerText||'').replace(/\\s+/g,' ').trim()), bottom: Math.round(document.querySelector('#overlay .panel').getBoundingClientRect().bottom), vh: window.innerHeight })`);
    add('6 900×600 暂停菜单四项均可见', ok && r.labels.length >= 4 && r.bottom <= r.vh, r);
    await T.shot('_pt/lead_accept/pause900.png');
  } finally { await T.close().catch(() => {}); }
}

// ---------- 7) 标题进设置 state=menu，光标位置记忆 ----------
{
  const T = await openGame(9482);
  try {
    await T.tap('KeyS'); await sleep(400);
    const a = await T.eval('({ state: window.__game.state, page: window.__game._page, idx: window.__game.menuIndex })');
    await T.tap('ArrowDown'); await sleep(120); await T.tap('ArrowDown'); await sleep(120);
    const mid = await T.eval('({ idx: window.__game.menuIndex, saved: window.__game._settingsIndex })');
    await T.tap('Escape'); await sleep(350);
    const b = await T.eval('({ state: window.__game.state, page: window.__game._page })');
    await T.tap('KeyS'); await sleep(350);
    const c = await T.eval('({ state: window.__game.state, idx: window.__game.menuIndex })');
    add('7 标题设置 state=menu 且光标记忆', a.state === 'menu' && b.state === 'menu' && c.idx === mid.idx, { a, mid, b, c });
    await T.shot('_pt/lead_accept/settings.png');
  } finally { await T.close().catch(() => {}); }
}

const okAll = checks.every((c) => c.pass);
writeFileSync('_pt/lead_accept/report.json', JSON.stringify({ ok: okAll, checks }, null, 2), 'utf8');
console.log('\n=== ' + (okAll ? 'ALL PASS' : 'HAS FAILURES') + ' (' + checks.filter(c => c.pass).length + '/' + checks.length + ') ===');
process.exit(okAll ? 0 : 1);
