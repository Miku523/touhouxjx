/**
 * Lead 输入 / 菜单边界反向试玩（每个场景独立浏览器，崩了不连坐）
 *
 * 目标：
 *  A. 音乐回忆室「未知曲目确认框」——鼠标点播放会不会死循环（源码疑点）
 *  B. 设置页「重置进度」标签写 X，但 spec 没有 hotkey（源码疑点）
 *  C. 暂停菜单层级 / 设置页 / 按键设置页的 Esc 层级 + Q 直接回标题（误触成本）
 *  E. 改键端到端：绑定 → 立即生效 → 刷新后持久化 → 旧键失效
 *  F. 失焦卡键：按住方向键时 blur，held 是否清空、角色是否停住
 *  G. 连打 / 长按 / 边沿：标题连按 Enter、暂停连按 Esc、长按右移松手
 *
 * 运行：node tools/_pt_lead_input.mjs   （需要 8138 静态服务器）
 */
import { launch, snapshot, makeChecks, saveJson, sleep } from './_pt_core.mjs';

const OUT = '_pt/lead_input';
const C = makeChecks();
const notes = [];
const step = (m) => console.log(`[step ${new Date().toISOString().slice(11, 19)}] ${m}`);

let T = null;
let browserSeq = 0;

const watchdog = setTimeout(() => {
  console.log('[WATCHDOG] 总超时，强制收尾');
  saveJson(`${OUT}/report-partial.json`, { ...C.sum(), notes, watchdog: true });
  process.exit(2);
}, 420000);

/* ---------------- 通用小工具（都指向当前场景的 T） ---------------- */
const vis = (sel) =>
  T.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return !e.classList.contains('hidden') && r.width > 1 && r.height > 1;
  })()`);

const rectOf = (sel) =>
  T.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);

async function click(sel, label = sel) {
  const r = await rectOf(sel);
  if (!r) {
    notes.push(`click 缺失: ${label} (${sel})`);
    return false;
  }
  await T.mouse(r.x, r.y);
  await sleep(90);
  return true;
}

const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

/** 从标题一路开一局 E · 灵梦，并跳过开场对话 */
async function startRun({ char = 'Digit1', diff = 'KeyE' } = {}) {
  const t0 = Date.now();
  const mark = (m) => console.log(`    [startRun ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  await T.boot();
  mark(`boot state=${await G('g.state')}`);
  await T.tap('Enter');
  mark('tap Enter');
  await T.waitFor('window.__game.state === "menu" && window.__game._page === "diff"', 4000);
  mark(`diff page=${await G('g._page')}`);
  await T.tap(diff);
  await sleep(120);
  await T.tap(char);
  mark(`char state=${await G('g.state')} page=${await G('g._page')}`);
  await sleep(200);
  for (let i = 0; i < 50; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) { mark(`play at iter ${i}`); return true; }
    if (s.state === 'gameover' || s.state === 'ending') { mark('early end ' + s.state); return false; }
    if (i % 10 === 0) mark(`iter ${i} state=${s.state} dialogue=${s.dialogue}`);
    await T.tap('Enter');
    await sleep(60);
  }
  mark('give up');
  return false;
}

/** 每个场景单独开浏览器：崩溃只会打断一个场景 */
async function withBrowser(name, fn, limitMs = 150000) {
  step(`${name} 启动浏览器`);
  T = await launch({ port: 9420 + (++browserSeq), width: 1280, height: 720 });
  const t0 = Date.now();
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`场景执行超时 ${limitMs}ms`)), limitMs); }),
    ]);
  } catch (e) {
    C.chk(false, `${name} 场景异常中断`, String(e && e.message ? e.message : e));
    notes.push(`${name} 异常：` + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    console.log(`[error ${name}]`, e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : String(e));
  } finally {
    clearTimeout(timer);
    const tail = T.logTail ? T.logTail(24) : '';
    if (tail) notes.push(`${name} browser.log 尾部：\n` + tail.slice(-800));
    try { await T.close(); } catch {}
    T = null;
    step(`${name} 结束 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

/* ================================================================
   A. 音乐回忆室：未知曲目确认框的鼠标 / 键盘两条路径
   ================================================================ */
async function scenarioMusicRoom() {
  await T.boot();
  await T.tap('KeyM');
  await T.waitFor('window.__game.musicRoom && window.__game.musicRoom.visible', 4000);
  await sleep(400);
  C.chk(await vis('#musicRoom'), 'A1 KeyM 打开音乐回忆室');

  const unk = await G(`(() => {
    const mr = g.musicRoom;
    const i = mr.tracks.findIndex((t) => !g._heardSongs.has(t.key));
    return { i, key: i >= 0 ? mr.tracks[i].key : null, heard: [...g._heardSongs] };
  })()`);
  C.chk(unk && unk.i >= 0, 'A2 存在「未遭遇」曲目可测', JSON.stringify(unk));
  if (!unk || unk.i < 0) return;

  const rowSel = `#musicRoom .mr-list .mr-row:nth-child(${unk.i + 1})`;
  await click(rowSel, '未知曲目行');
  await sleep(250);
  C.chk(await vis('#musicRoom .mr-warn'), 'A3 点未遭遇曲目 → 弹出确认框');
  const warnIdx = await G('g.musicRoom._warn ? g.musicRoom._warn.index : -1');
  const rowIdx = await G('g.musicRoom.index');
  C.eq(warnIdx, unk.i, 'A4 确认框指向被点击的曲目（不是旧光标）', `warn=${warnIdx} 行=${unk.i}`);
  C.eq(rowIdx, unk.i, 'A5 鼠标点击也会移动光标', `index=${rowIdx}`);

  const songBefore = await G('g.audio.currentSong || null');

  // —— 鼠标点「播放」——
  await click('#musicRoom .mr-warn-btn[data-act="play"]', '确认框-播放');
  await sleep(350);
  const warnAfterMouse = await vis('#musicRoom .mr-warn');
  const songAfterMouse = await G('g.audio.currentSong || null');
  const heardAfterMouse = await G(`g._heardSongs.has(${JSON.stringify(unk.key)})`);

  C.chk(!warnAfterMouse, 'A6 鼠标点「播放」后确认框应关闭', `仍在显示=${warnAfterMouse}`);
  C.chk(songAfterMouse === unk.key, 'A7 鼠标点「播放」应真正开始播放', `song=${songAfterMouse} 目标=${unk.key} 之前=${songBefore} heard=${heardAfterMouse}`);

  // —— 键盘路径（对照）：确认框还开着的话直接 Enter，应该能播 ——
  if (warnAfterMouse) {
    await T.tap('Enter');
    await sleep(400);
    const warnAfterKb = await vis('#musicRoom .mr-warn');
    const songAfterKb = await G('g.audio.currentSong || null');
    C.chk(!warnAfterKb && songAfterKb === unk.key, 'A8 键盘 Enter 确认可以正常播放（证明只有鼠标路径坏）', `warn=${warnAfterKb} song=${songAfterKb}`);
  } else {
    notes.push('A8 跳过：鼠标路径已经把确认框关掉了');
  }

  // —— 鼠标点「取消」必须能关掉 ——
  const unk2 = await G(`(() => {
    const mr = g.musicRoom;
    const i = mr.tracks.findIndex((t) => !g._heardSongs.has(t.key));
    return i;
  })()`);
  const cancelRow = unk2 >= 0 ? unk2 : unk.i;
  await click(`#musicRoom .mr-list .mr-row:nth-child(${cancelRow + 1})`, '未知曲目行(取消测试)');
  await sleep(250);
  if (await vis('#musicRoom .mr-warn')) {
    await click('#musicRoom .mr-warn-btn[data-act="cancel"]', '确认框-取消');
    await sleep(250);
    C.chk(!(await vis('#musicRoom .mr-warn')), 'A9 鼠标点「取消」能关闭确认框');
  } else {
    notes.push('A9 跳过：没有可用的未遭遇曲目再弹框');
  }

  // —— 已听过的曲目：鼠标点击应该直接播放，不弹框 ——
  const known = await G(`(() => {
    const mr = g.musicRoom;
    const i = mr.tracks.findIndex((t) => g._heardSongs.has(t.key));
    return i;
  })()`);
  if (known >= 0) {
    await click(`#musicRoom .mr-list .mr-row:nth-child(${known + 1})`, '已听过曲目行');
    await sleep(300);
    C.chk(!(await vis('#musicRoom .mr-warn')), 'A10 已听过曲目鼠标点击不弹确认框');
  }

  await T.tap('Escape'); // 返回标题
  await sleep(500);
  C.eq(await G('g.state'), 'menu', 'A11 音乐室 Esc 返回标题');
  C.chk(!(await vis('#musicRoom')), 'A12 音乐室已隐藏');
  await T.shot(`${OUT}/a-music-room.png`);
}

/* ================================================================
   B. 设置页：重置进度的 X 标签 vs 真实 hotkey
   ================================================================ */
async function scenarioSettingsHotkeys() {
  await T.boot();
  await T.tap('KeyS');
  await sleep(300);
  C.eq(await G('g._page'), 'settings', 'B1 KeyS 打开设置页');

  const specs = await G(`g.menuButtons.map(b => ({
    label: ((b.querySelector('.set-label') || b).textContent || '').trim().slice(0, 14),
    key: b._spec?.key || null, hotkey: b._spec?.hotkey || null,
    back: !!b._spec?.back, adjust: !!b._spec?.adjust,
  }))`);
  const reset = specs.find((s) => s.label.includes('重置进度'));
  C.chk(!!reset, 'B2 设置页存在「重置进度」行', JSON.stringify(reset));
  if (reset) {
    C.eq(reset.key, 'X', 'B3 标签显示 X', reset.key);
    C.chk(!!reset.hotkey, 'B4 标签写着 X，就应真的绑定 KeyX（不是装饰）', JSON.stringify(reset));
  }

  const titleBefore = await G(`document.getElementById('title').textContent`);
  await T.tap('KeyX');
  await sleep(300);
  const titleAfter = await G(`document.getElementById('title').textContent`);
  C.chk(titleAfter.includes('重置进度'), 'B5 按 X 应进入重置进度页', `前=${titleBefore} 后=${titleAfter} page=${await G('g._page')}`);

  // 用键盘真正走到重置页：↑ 到该行再 Enter（验证入口本身没有坏）
  if (!titleAfter.includes('重置进度')) {
    const idx = specs.findIndex((s) => s.label.includes('重置进度'));
    for (let i = 0; i < 24; i++) {
      if ((await G('g.menuIndex')) === idx) break;
      await T.tap('ArrowDown');
      await sleep(70);
    }
    C.eq(await G('g.menuIndex'), idx, 'B6 键盘可以选中「重置进度」行');
    await T.tap('Enter');
    await sleep(350);
    C.chk((await G(`document.getElementById('title').textContent`)).includes('重置进度'), 'B7 Enter 可以进入重置进度页');
    // 初始高亮在「取消」，再 Enter 应回设置
    await T.tap('Enter');
    await sleep(350);
    C.eq(await G('g._page'), 'settings', 'B8 重置页初始高亮是「取消」→ Enter 返回设置（不误删）');
  }

  await T.tap('Escape');
  await sleep(400);
  C.eq(await G('g.state'), 'menu', 'B9 设置页 Esc 返回标题');
  await T.shot(`${OUT}/b-settings.png`);
}

/* ================================================================
   C. 暂停菜单层级 + Q 直接回标题（有没有二次确认）
   ================================================================ */
async function scenarioPauseMenu() {
  const mk = (m) => console.log(`    [C] ${m}`);
  const started = await startRun();
  mk('startRun=' + started);
  C.chk(started, 'C1 E/灵梦 开局并跳过对话');
  if (!started) return;
  const s0 = await snapshot(T);
  C.eq(s0.state, 'play', 'C2 进入 play');
  C.chk(Number.isFinite(s0.px), 'C3 玩家坐标正常', `x=${s0.px} y=${s0.py}`);

  await T.tap('Escape');
  await sleep(300);
  mk('esc1 state=' + (await G('g.state')));
  C.eq(await G('g.state'), 'paused', 'C4 Esc 暂停');
  C.chk((await G(`document.getElementById('title').textContent`)).includes('暂停'), 'C5 暂停面板标题');

  await T.tap('Escape');
  await sleep(300);
  mk('esc2 state=' + (await G('g.state')));
  C.eq(await G('g.state'), 'play', 'C6 Esc 从暂停恢复');

  await T.tap('Escape');
  await sleep(250);
  await T.tap('KeyS');
  await sleep(350);
  mk('page=' + (await G('g._page')));
  C.eq(await G('g._page'), 'settings', 'C7 暂停菜单 S 进设置');
  C.eq(await G('g._settingsOrigin'), 'pause', 'C8 设置来源标记为 pause');
  await T.tap('Escape');
  await sleep(350);
  mk('back title=' + (await G(`document.getElementById('title').textContent`)));
  C.chk((await G(`document.getElementById('title').textContent`)).includes('暂停'), 'C9 设置页 Esc 回暂停菜单（不是标题）');

  // R：暂停来源的设置页里的「重新开始本关」（不走续命计数）
  const continuesBefore = await G('g.continues');
  await T.tap('KeyS');
  await sleep(350);
  mk('page2=' + (await G('g._page')));
  C.eq(await G('g._page'), 'settings', 'C10 从暂停菜单再次进入设置页');
  mk('tap R...');
  await T.tap('KeyR');
  mk('R sent');
  await sleep(700);
  mk('after R state=' + (await G('g.state')));
  C.eq(await G('g.state'), 'play', 'C11 设置页 R 重新开始后回到 play');
  C.eq(await G('g.continues'), continuesBefore, 'C12 暂停重开不算续命');

  // Q：暂停菜单「退出到标题」是否直接生效（无二次确认）
  await T.tap('Escape');
  await sleep(300);
  const levelBefore = await G('g.levelIndex');
  mk('before Q state=' + (await G('g.state')));
  await T.tap('KeyQ');
  await sleep(600);
  const afterQ = await G(`({ state: g.state, stage: !!g.stage, title: document.getElementById('title').textContent })`);
  C.chk(
    afterQ.state === 'menu' && !afterQ.stage,
    'C13 [误触风险] 暂停菜单按 Q 立刻丢局回标题，没有任何二次确认',
    `level=${levelBefore} → state=${afterQ.state} stage=${afterQ.stage} title=${afterQ.title}`
  );
  await T.shot(`${OUT}/c-after-q.png`);
  mk('done');
}

/* ================================================================
   E. 改键端到端：绑定 → 生效 → 刷新持久化 → 旧键失效
   ================================================================ */
async function scenarioRebind() {
  await T.boot();
  await T.tap('KeyS');
  await sleep(250);
  await T.tap('KeyK');
  await sleep(300);
  C.eq(await G('g._page'), 'keybinds', 'E1 KeyK 进入按键设置页');

  // 左移是 menuButtons 的第 0 项
  await G(`(g.menuButtons[0].click(), 0)`);
  await sleep(300);
  C.eq(await G('g._captureAction'), 'left', 'E2 选中左移进入改键捕获态');

  await T.tap('KeyU');
  await sleep(300);
  C.eq(await G(`g.input.keyOf('left')`), 'KeyU', 'E3 按 U 把左移改绑为 KeyU');
  C.eq(await G(`g.input.actionOf('ArrowLeft')`), null, 'E4 旧键 ArrowLeft 已解绑');
  C.eq(await G('g._captureAction'), null, 'E5 捕获态已退出');

  // 刷新后键位仍在（存 hks.keybinds.v1）
  const raw = await G(`localStorage.getItem('hks.keybinds.v1')`);
  C.chk(!!raw && raw.includes('KeyU'), 'E6 键位已写入 localStorage', String(raw).slice(0, 120));
  await T.reload();
  await T.waitFor('!!window.__game', 20000);
  await T.waitFor('window.__game.state === "menu"', 12000);
  await sleep(300);
  C.eq(await G(`g.input.keyOf('left')`), 'KeyU', 'E7 刷新后键位保持');

  // 开一局，验证新键真的能让角色左移（先右移离开墙边再测）
  await T.tap('Enter');
  await sleep(150);
  await T.tap('KeyE');
  await sleep(120);
  await T.tap('Digit1');
  await sleep(150);
  for (let i = 0; i < 50; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) break;
    await T.tap('Enter');
    await sleep(60);
  }
  C.eq((await snapshot(T)).state, 'play', 'E8 改键后仍能正常开局');
  await T.holdKeys(['ArrowRight'], 700);
  await sleep(150);
  const xMid = (await snapshot(T)).px;
  await T.holdKeys(['KeyU'], 500);
  await sleep(150);
  const xAfterU = (await snapshot(T)).px;
  C.chk(xAfterU < xMid, 'E9 新键 KeyU 能左移', `右移后 x=${xMid} → 按 U 后 x=${xAfterU}`);
  await T.holdKeys(['ArrowLeft'], 400);
  await sleep(150);
  const xAfterOld = (await snapshot(T)).px;
  C.chk(xAfterOld >= xAfterU, 'E10 旧键 ArrowLeft 不再生效', `x=${xAfterU} → ${xAfterOld}`);
  await T.shot(`${OUT}/e-rebind.png`);
}

/* ================================================================
   F. 失焦卡键
   ================================================================ */
async function scenarioBlur() {
  const started = await startRun();
  C.chk(started, 'F1 开局');
  if (!started) return;

  await T.keyDown('ArrowRight');
  await sleep(600);
  const moving = await snapshot(T);
  C.chk(moving.px > 64, 'F2 按住右键角色在移动', `x=${moving.px}`);

  await T.eval(`window.dispatchEvent(new Event('blur')); 1`);
  await sleep(150);
  const held = await G('g.input.held.size');
  const xBlur = (await snapshot(T)).px;
  await sleep(500);
  const xLater = (await snapshot(T)).px;
  C.eq(held, 0, 'F3 blur 后 held 已清空（防卡键）');
  C.chk(xLater === xBlur, 'F4 blur 后角色停住不再漂移', `x=${xBlur} → ${xLater}`);
  await T.keyUp('ArrowRight');
  await T.shot(`${OUT}/f-blur.png`);
}

/* ================================================================
   G. 连打 / 长按 / 边沿
   ================================================================ */
async function scenarioMash() {
  await T.boot();
  step('G.2 标题连按 Enter 12 次');
  for (let i = 0; i < 12; i++) {
    await T.tap('Enter');
    await sleep(45);
  }
  await sleep(400);
  const afterMash = await G(`({ state: g.state, page: g._page, level: g.levelIndex, diff: g.difficulty })`);
  C.chk(['menu', 'play', 'dialogue', 'paused'].includes(afterMash.state), 'G1 标题连按 Enter 12 次不抛错、状态合法', JSON.stringify(afterMash));

  step('G.3 强制回标题并重新开局');
  await G(`(g.showTitle(), 1)`);
  await sleep(500);
  const started = await startRun();
  C.chk(started, 'G2 重新开局');
  if (!started) return;

  step('G.5 连按 Esc 8 次');
  for (let i = 0; i < 8; i++) {
    await T.tap('Escape');
    await sleep(80);
  }
  const afterEscMash = await G(`({ state: g.state })`);
  C.chk(['play', 'paused'].includes(afterEscMash.state), 'G3 连按 Esc 8 次状态合法（暂停/恢复交替不出错）', JSON.stringify(afterEscMash));

  if (afterEscMash.state === 'paused') {
    await T.tap('Escape');
    await sleep(250);
  }
  step('G.6 长按右移后松手');
  await T.holdKeys(['ArrowRight'], 900);
  await sleep(250);
  const x1 = (await snapshot(T)).px;
  await sleep(450);
  const x2 = (await snapshot(T)).px;
  C.chk(x1 === x2, 'G4 松手后不再移动（边沿/按住态正确）', `x=${x1} → ${x2}`);
  await T.shot(`${OUT}/g-mash.png`);
  step('G.7 done');
}

/* ================================================================ */
const only = (process.argv[2] || '').toUpperCase();
const want = (tag) => !only || only.includes(tag);
try {
  if (want('A')) await withBrowser('A 音乐室', scenarioMusicRoom);
  if (want('B')) await withBrowser('B 设置热键', scenarioSettingsHotkeys);
  if (want('C')) await withBrowser('C 暂停菜单', scenarioPauseMenu);
  if (want('E')) await withBrowser('E 改键', scenarioRebind);
  if (want('F')) await withBrowser('F 失焦', scenarioBlur);
  if (want('G')) await withBrowser('G 连打', scenarioMash);
  step('全部场景完成');
} catch (e) {
  C.chk(false, '外层异常中断', String(e && e.message ? e.message : e));
  notes.push('外层异常：' + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
}
clearTimeout(watchdog);

const sum = C.sum();
saveJson(`${OUT}/report.json`, { ...sum, notes });
console.log(JSON.stringify({ ...sum, notes: notes.slice(0, 12) }, null, 2));
process.exit(0);
