/**
 * flow-menu 分区 · 按键设置页（b 项）
 * 覆盖：页面结构、改键捕获、捕获态 Esc 取消（不绑 Esc）、占用主键互换、
 *       占用副键时副键清除、Del 恢复默认（页面按键 + 捕获态）、写盘 hks.keybinds.v1、
 *       reload 保留、改键后在 play 中真实生效、行标签/键帽刷新（旧键不残留）、布局。
 * 端口 9411（专属）。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import {
  DIR, pageInfo, gameSnap, settingsSnap, shot, waitMenu, bootFresh,
  layoutCheck, setViewport, advanceToPlay, mkPart,
} from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const checks = makeChecks();
const logs = [];
const evidence = [];
const candidates = [];
let fatal = null;

function log(...a) { const s = a.map(String).join(' '); logs.push(s); console.log('[binds]', s); }
async function snapShot(name) { await shot(T, name); evidence.push(`${DIR}/${name}`); }
function chk(ok, name, detail) {
  checks.chk(ok, name, detail);
  if (!ok) log('FAIL', name, detail ? JSON.stringify(detail).slice(0, 400) : '');
  return ok;
}

const ACTS = ['left', 'right', 'up', 'down', 'fast', 'jump', 'shoot', 'dash', 'cast', 'confirm', 'pause', 'restart', 'mute', 'quit'];
const DEFAULT_BINDS = {
  left: { primary: 'ArrowLeft', alt: 'KeyA' }, right: { primary: 'ArrowRight', alt: 'KeyD' },
  up: { primary: 'ArrowUp', alt: 'KeyW' }, down: { primary: 'ArrowDown', alt: 'KeyS' },
  jump: { primary: 'Space', alt: null }, shoot: { primary: 'KeyZ', alt: 'KeyJ' },
  fast: { primary: 'ShiftLeft', alt: 'ShiftRight' }, dash: { primary: 'KeyK', alt: 'KeyC' },
  cast: { primary: 'KeyX', alt: 'KeyL' }, confirm: { primary: 'Enter', alt: 'NumpadEnter' },
  pause: { primary: 'Escape', alt: 'KeyP' }, restart: { primary: 'KeyR', alt: null },
  mute: { primary: 'KeyM', alt: null }, quit: { primary: 'KeyQ', alt: null },
};

async function kbSnap() {
  return T.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const g = window.__game;
    const rows = [...document.querySelectorAll('#buttons .btn')].map((b, i) => ({
      i, cls: b.className, sel: b.classList.contains('sel'), disabled: !!b.disabled,
      label: (b.querySelector('.set-label') || {}).textContent || '',
      keycap: (b.querySelector('.keycap') || {}).textContent || '',
      wait: (b.querySelector('.kb-wait') || {}).textContent || '',
      key: (b.querySelector('.k') || {}).textContent || '',
    }));
    const binds = {};
    for (const a of ${JSON.stringify(ACTS)}) { const b = g.input.binds.get(a); binds[a] = { primary: b.primary, alt: b.alt }; }
    let store = null;
    try { store = JSON.parse(localStorage.getItem('hks.keybinds.v1') || 'null'); } catch (e) { store = 'BAD'; }
    return {
      title: q('#title') ? q('#title').textContent : '',
      subtitle: q('#subtitle') ? q('#subtitle').textContent : '',
      hint: q('#hint') ? q('#hint').textContent : '',
      page: g._page, state: g.state, capture: g._captureAction || null, menuIndex: g.menuIndex,
      overlayHidden: q('#overlay') ? q('#overlay').classList.contains('hidden') : null,
      rows, binds, store,
      labelFor: Object.fromEntries(${JSON.stringify(ACTS)}.map((a) => [a, g.input.labelFor(a)])),
    };
  })()`);
}

async function enterKeybinds() {
  // 标题 → S 设置 → 点「按键设置」行
  await T.key('KeyS'); await sleep(420);
  let p = await pageInfo(T);
  if (p.page !== 'settings') throw new Error('未进入设置页: ' + p.title);
  const hit = await T.eval(`(() => {
    const els = [...document.querySelectorAll('#buttons .btn')];
    const idx = els.findIndex((e) => ((e.querySelector('.set-label') || {}).textContent || '').includes('按键设置'));
    if (idx < 0) return { found: false };
    const r = els[idx].getBoundingClientRect();
    return { found: true, index: idx, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!hit.found) throw new Error('设置页找不到按键设置行');
  await T.mouse(hit.x, hit.y);
  await sleep(420);
  const kb = await kbSnap();
  if (kb.page !== 'keybinds') throw new Error('未进入按键设置页: ' + kb.title);
  return kb;
}

async function clickRow(index) {
  const info = await T.eval(`(() => {
    const el = document.querySelectorAll('#buttons .btn')[${index}];
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent || '').replace(/\\s+/g, ' ').trim() };
  })()`);
  if (info.found) await T.mouse(info.x, info.y);
  await sleep(300);
  return info;
}

/** 固定步长驱动游戏逻辑（绕过 headless rAF 节流） */
async function ff(n) {
  await T.eval(`(() => { const g = window.__game; for (let i = 0; i < ${n}; i++) g.update(1 / 60); return null; })()`);
  await sleep(120);
}
async function playerSnap() {
  return T.eval(`(() => {
    const g = window.__game; const p = g.stage && g.stage.player;
    return p ? { state: g.state, onGround: p.onGround, vy: p.vy != null ? +p.vy.toFixed(2) : null,
      jumpsLeft: p.jumpsLeft, py: Math.round(p.y), lives: p.lives, invuln: p.invuln || 0,
      bullets: (g.stage.bullets || []).length, playerBullets: (g.stage.playerBullets || []).length } : { state: g.state };
  })()`);
}

try {
  await bootFresh(T);
  log('booted');

  // ---------- A. 按键设置页结构 ----------
  let kb = await enterKeybinds();
  await snapShot('40-binds-page.png');
  log('A title=' + kb.title + ' page=' + kb.page + ' capture=' + kb.capture + ' rows=' + kb.rows.length);
  chk(kb.title === '按键设置' && kb.page === 'keybinds', 'A1 S→设置→按键设置 页面进入正确', { title: kb.title, page: kb.page });
  chk(kb.rows.length === 16, 'A2 14 个动作行 + 恢复默认 + 返回 = 16 行', kb.rows.length);
  const labels = kb.rows.slice(0, 14).map((r) => r.label);
  const wantLabels = ['左移', '右移', '上移 / 上选', '下移 / 下选', '低速移动', '跳跃', '射击', '冲刺', '符卡', '确认', '暂停 / 菜单', '重开本关', '静音', '退出'];
  chk(wantLabels.every((w, i) => labels[i] === w), 'A3 14 行动作名称与顺序正确', { labels, wantLabels });
  chk(kb.rows[14].label.includes('恢复默认') && kb.rows[15].label.includes('返回'), 'A4 底部两行为恢复默认/返回', kb.rows.slice(14).map((r) => r.label));
  chk(kb.rows[15].key === 'ESC', 'A5 返回行键帽为 ESC', kb.rows[15].key);
  chk(kb.hint.includes('Del 恢复默认') && kb.hint.includes('ESC 返回'), 'A6 提示栏含 Del 恢复默认 / ESC 返回', kb.hint);

  const keycaps = kb.rows.slice(0, 14).map((r) => r.keycap);
  const wantCaps = ['← / A', '→ / D', '↑ / W', '↓ / S', '左Shift / 右Shift', '空格', 'Z / J', 'K / C', 'X / L', '回车 / 小键盘回车', 'Esc / P', 'R', 'M', 'Q'];
  chk(wantCaps.every((w, i) => keycaps[i] === w), 'A7 默认键帽显示正确', { keycaps, wantCaps });
  chk(ACTS.every((a) => kb.binds[a].primary === DEFAULT_BINDS[a].primary && kb.binds[a].alt === DEFAULT_BINDS[a].alt),
    'A8 内存键位为默认值', kb.binds);

  const layKb = await layoutCheck(T);
  chk(layKb.badCount === 0, 'A9 按键设置页 1280x720 无出视口/被裁按钮', layKb.bad.slice(0, 5));

  // ---------- B. 捕获态：Esc 取消，不绑 Esc ----------
  const clickDown = await clickRow(3);
  log('capture row down:', JSON.stringify(clickDown));
  await snapShot('41-binds-capture.png');
  const cap = await kbSnap();
  chk(cap.capture === 'down', 'B1 点击「下移 / 下选」行进入捕获态', cap.capture);
  chk(cap.rows[3].cls.includes('capturing') && cap.rows[3].wait === '按下新键…', 'B2 捕获行显示 capturing/按下新键…', {
    cls: cap.rows[3].cls, wait: cap.rows[3].wait,
  });
  chk(cap.hint.includes('按任意键绑定') && cap.hint.includes('ESC 取消'), 'B3 捕获态提示栏切换为「任意键绑定 / ESC 取消」', cap.hint);
  chk(cap.subtitle.includes('按下要绑定的新键'), 'B4 捕获态副标题提示按新键', cap.subtitle);
  await T.key('Escape'); await sleep(380);
  const cancelled = await kbSnap();
  await snapShot('42-binds-cancel.png');
  chk(cancelled.capture === null && cancelled.page === 'keybinds', 'B5 捕获态 Esc 取消且留在按键设置页（不返回）', {
    capture: cancelled.capture, page: cancelled.page, title: cancelled.title,
  });
  chk(cancelled.subtitle.includes('已取消改键'), 'B6 取消后副标题提示「已取消改键」', cancelled.subtitle);
  chk(cancelled.binds.down.primary === 'ArrowDown' && cancelled.binds.down.alt === 'KeyS', 'B7 取消后 down 键位未改变', cancelled.binds.down);
  chk(cancelled.binds.pause.primary === 'Escape', 'B8 Esc 未被绑到 down（pause 主键仍 Escape）', cancelled.binds.pause);
  chk(cancelled.rows[3].keycap === '↓ / S' && !cancelled.rows[3].cls.includes('capturing'), 'B9 行键帽恢复 ↓ / S 且退出捕获样式', {
    cap: cancelled.rows[3].keycap, cls: cancelled.rows[3].cls,
  });

  // 第二次复现（同一路径重复一次，确认稳定）
  await clickRow(3); await sleep(200);
  await T.key('Escape'); await sleep(320);
  const cancelled2 = await kbSnap();
  chk(cancelled2.capture === null && cancelled2.binds.down.primary === 'ArrowDown' && cancelled2.binds.pause.primary === 'Escape',
    'B10 Esc 取消可重复（第二次仍不绑 Esc）', { capture: cancelled2.capture, down: cancelled2.binds.down });

  // ---------- C. 绑到已占用主键：应互换 ----------
  await clickRow(5); // 跳跃（行序：0←1→2↑3↓4低速5跳6射…）
  await T.key('KeyZ'); // 原射击主键
  await sleep(420);
  const swapped = await kbSnap();
  await snapShot('43-binds-swap.png');
  log('swap jump<->shoot:', JSON.stringify({ jump: swapped.binds.jump, shoot: swapped.binds.shoot }));
  chk(swapped.binds.jump.primary === 'KeyZ' && swapped.binds.shoot.primary === 'Space',
    'C1 跳跃改绑 Z：与射击主键互换（shoot=Space）', { jump: swapped.binds.jump, shoot: swapped.binds.shoot });
  chk(swapped.rows[5].keycap === 'Z' && swapped.rows[6].keycap === '空格 / J', 'C2 行键帽同步刷新（跳跃 Z / 射击 空格 / J）', {
    jumpCap: swapped.rows[5].keycap, shootCap: swapped.rows[6].keycap,
  });
  chk(swapped.labelFor.jump === 'Z' && swapped.labelFor.shoot === '空格 / J', 'C3 快捷键标签同步刷新（旧键不残留）', {
    jump: swapped.labelFor.jump, shoot: swapped.labelFor.shoot,
  });
  chk(swapped.store && swapped.store.jump === 'KeyZ' && swapped.store.shoot === 'Space', 'C4 hks.keybinds.v1 写盘为互换后的值', swapped.store);
  const primaries = ACTS.map((a) => swapped.binds[a].primary);
  chk(new Set(primaries).size === ACTS.length, 'C5 所有动作主键仍互不重复', primaries);

  // ---------- D. 绑到别人的副键：副键应被清除 ----------
  await clickRow(8); // 符卡
  await T.key('ShiftRight'); // 低速移动的副键
  await sleep(420);
  const altCleared = await kbSnap();
  await snapShot('44-binds-altclear.png');
  chk(altCleared.binds.cast.primary === 'ShiftRight' && altCleared.binds.fast.alt === null,
    'D1 符卡绑到低速移动副键 ShiftRight：副键被清除', { cast: altCleared.binds.cast, fast: altCleared.binds.fast });
  chk(altCleared.rows[8].keycap === '右Shift / L', 'D2 符卡行键帽显示右Shift / L', altCleared.rows[8].keycap);
  chk(altCleared.rows[4].keycap === '左Shift', 'D3 低速移动行不再显示右Shift 副键', altCleared.rows[4].keycap);
  chk(altCleared.binds.fast.primary === 'ShiftLeft', 'D4 低速移动主键保持左Shift', altCleared.binds.fast.primary);

  // ---------- E. 捕获态 Del 恢复默认 ----------
  await clickRow(6); // 射击（此时 Space）
  await sleep(200);
  const capDel = await kbSnap();
  chk(capDel.capture === 'shoot', 'E1 点击射击行进入捕获态', capDel.capture);
  await T.key('Delete'); await sleep(420);
  const afterDelCapture = await kbSnap();
  chk(afterDelCapture.capture === null && afterDelCapture.subtitle.includes('已恢复默认键位'),
    'E2 捕获态 Del 恢复默认并退出捕获', { capture: afterDelCapture.capture, subtitle: afterDelCapture.subtitle });
  chk(ACTS.every((a) => afterDelCapture.binds[a].primary === DEFAULT_BINDS[a].primary && afterDelCapture.binds[a].alt === DEFAULT_BINDS[a].alt),
    'E3 恢复默认后内存键位全为默认值', afterDelCapture.binds);
  chk(afterDelCapture.store === null, 'E4 恢复默认后删除 hks.keybinds.v1', afterDelCapture.store);

  // ---------- F. reload 后保留自定义键位 ----------
  await clickRow(5); await T.key('KeyZ'); await sleep(380); // 跳跃→Z（互换）
  const beforeReload = await kbSnap();
  chk(beforeReload.binds.jump.primary === 'KeyZ', 'F1 重载前跳跃已改为 Z', beforeReload.binds.jump);
  await T.reload();
  await waitMenu(T, 25000);
  const afterReloadStore = await settingsSnap(T);
  chk(afterReloadStore.keybinds && afterReloadStore.keybinds.jump === 'KeyZ' && afterReloadStore.keybinds.shoot === 'Space',
    'F2 reload 后 hks.keybinds.v1 保留互换结果', afterReloadStore.keybinds);
  kb = await enterKeybinds();
  chk(kb.binds.jump.primary === 'KeyZ' && kb.binds.shoot.primary === 'Space',
    'F3 reload 后内存键位保留自定义值', { jump: kb.binds.jump, shoot: kb.binds.shoot });
  chk(kb.rows[5].keycap === 'Z' && kb.rows[6].keycap === '空格 / J', 'F4 reload 后行键帽显示自定义键位', {
    jump: kb.rows[5].keycap, shoot: kb.rows[6].keycap,
  });
  await snapShot('45-binds-reloaded.png');

  // ---------- G. 改键后在 play 中真实生效 ----------
  await T.key('Escape'); await sleep(350); // 回设置
  const backSettings = await pageInfo(T);
  chk(backSettings.page === 'settings', 'G1 按键设置页 Esc 返回设置页', { page: backSettings.page, title: backSettings.title });
  await T.key('Escape'); await sleep(380); // 回标题
  const backTitle = await pageInfo(T);
  chk(backTitle.title === '東方新紀行', 'G2 设置页 Esc 返回标题', backTitle.title);

  // 标题 → 难度 H → 魔理沙 → 对话 → play
  await T.key('Enter'); await sleep(500);
  await T.key('KeyH'); await sleep(500);
  const charPage = await pageInfo(T);
  chk(charPage.title === '选择主角', 'G3 H 进入选择主角', charPage.title);
  await T.key('Digit2'); await sleep(500);
  await advanceToPlay(T, 90);
  const inPlay = await gameSnap(T);
  chk(inPlay.state === 'play', 'G4 进入 play', inPlay.state);
  await ff(40); // 落地
  let ps = await playerSnap();
  log('player@play:', JSON.stringify(ps));
  chk(ps.onGround === true, 'G5 开场地面上（onGround=true）', ps);

  // 按新跳跃键 Z
  await T.key('KeyZ');
  await ff(8);
  ps = await playerSnap();
  await snapShot('46-binds-play-jump.png');
  chk(ps.onGround === false || ps.vy < -1, 'G6 改键后按 Z 真实触发跳跃（离地/向上速度）', ps);
  // 落地后按旧跳跃键 Space：此时应为射击，不应起跳
  for (let i = 0; i < 30 && (await playerSnap()).onGround !== true; i++) await ff(10);
  ps = await playerSnap();
  log('player landed:', JSON.stringify(ps));
  chk(ps.onGround === true, 'G7 跳跃后回到地面', ps);
  await T.key('Space');
  await ff(10);
  const psSpace = await playerSnap();
  chk(psSpace.onGround === true && !(psSpace.vy < -1), 'G8 旧跳跃键 Space 不再触发跳跃（已互换为射击）', psSpace);

  // Esc → 暂停 → Q 回标题
  await T.key('Escape'); await sleep(420);
  const pausePage = await pageInfo(T);
  chk(pausePage.title === '暂停', 'G9 play 中 Esc 进入暂停', pausePage.title);
  await T.key('KeyQ'); await sleep(450);
  const titleAgain = await pageInfo(T);
  chk(titleAgain.title === '東方新紀行', 'G10 暂停菜单 Q 回标题', titleAgain.title);

  // ---------- H. 页面 Del 键恢复默认 + 返回链 ----------
  kb = await enterKeybinds();
  await T.key('Delete'); await sleep(420);
  const pageDel = await kbSnap();
  chk(pageDel.subtitle.includes('已恢复默认键位') && ACTS.every((a) => pageDel.binds[a].primary === DEFAULT_BINDS[a].primary),
    'H1 非捕获态按 Del 恢复默认键位', { subtitle: pageDel.subtitle, jump: pageDel.binds.jump });
  chk(pageDel.store === null, 'H2 页面 Del 恢复默认后删除存档', pageDel.store);
  await T.key('Escape'); await sleep(350);
  const s2 = await pageInfo(T);
  chk(s2.page === 'settings', 'H3 返回键 Esc 回到设置页', { page: s2.page, title: s2.title });
  await T.key('Escape'); await sleep(400);
  const t2 = await pageInfo(T);
  chk(t2.title === '東方新紀行' && t2.overlayHidden === false, 'H4 再 Esc 回到标题（overlay 可见）', {
    title: t2.title, hidden: t2.overlayHidden,
  });

  await T.reload(); await waitMenu(T, 25000);
  const finalStore = await settingsSnap(T);
  chk(finalStore.keybinds === null, 'H5 reload 后恢复默认、无残留自定义键位存档', finalStore.keybinds);
  kb = await enterKeybinds();
  chk(ACTS.every((a) => kb.binds[a].primary === DEFAULT_BINDS[a].primary && kb.binds[a].alt === DEFAULT_BINDS[a].alt),
    'H6 reload 后内存键位为默认值', kb.binds);

  // ---------- I. 960x540 布局 ----------
  await setViewport(T, 960, 540);
  await sleep(450);
  const lay960 = await layoutCheck(T);
  await snapShot('47-binds-960.png');
  chk(lay960.badCount === 0, 'I1 按键设置页 960x540 无出视口/被裁按钮', lay960.bad.slice(0, 5));
  await setViewport(T, 1280, 720);
  await sleep(300);

  const report = await T.report();
  chk(report.errors.length === 0, 'J1 全程无 JS 异常', report.errors.slice(0, 3));
  chk(report.httpBad.length === 0, 'J2 全程无 404/5xx', report.httpBad.slice(0, 3));
  chk(report.netFails.length === 0, 'J3 全程无网络失败', report.netFails.slice(0, 3));

  log('RESULT', checks.sum().pass, 'pass /', checks.sum().fail, 'fail');
  log('CONSOLE', JSON.stringify({ errors: report.errors, warns: report.warns, httpBad: report.httpBad, netFails: report.netFails }));
} catch (e) {
  fatal = String((e && e.stack) || e);
  log('FATAL', fatal);
} finally {
  const part = {
    part: 'binds', ...mkPart(checks), checks: checks.rows, candidates, logs, evidence, fatal,
  };
  try { saveJson(`${DIR}/part_binds.json`, part); } catch (e) { console.log('save failed', e); }
  await T.close().catch(() => {});
  if (fatal) process.exitCode = 1;
}
