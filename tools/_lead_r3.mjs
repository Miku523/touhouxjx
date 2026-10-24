// 第三轮补测：rAF 帧探针（三种窗口）、结算 banner 期间 Esc、音乐室鼠标全流程、改键页鼠标。
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const URL = 'http://127.0.0.1:8138/index.html?v=r3_' + Date.now();
const R = { frames: {}, banner: {}, music: {}, keybinds: {}, errors: [] };

async function boot(port, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const T = await launch({ port, headless: true, ...opts });
      await T.boot({ query: '?v=r3_' + Date.now() + '&p=' + port, waitTitle: 20000 });
      return T;
    } catch (e) { await sleep(1200); }
  }
  throw new Error('boot failed on ' + port);
}

async function intoPlay(T, diffCode = 'KeyE', charCode = 'Digit1') {
  await T.tap('Enter'); await sleep(300);
  await T.tap(diffCode); await sleep(250);
  await T.tap(charCode); await sleep(300);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({s:window.__game.state,p:window.__game._page,d:window.__game.dialogue.active})');
    if (s.s === 'play' && !s.d) return s;
    if (s.s === 'menu' && s.p === 'charselect') await T.tap(charCode);
    else await T.tap('Enter');
    await sleep(140);
  }
  return T.eval('({s:window.__game.state,p:window.__game._page})');
}

async function frameRun(port, width, height) {
  const T = await boot(port, { width, height });
  try {
    await intoPlay(T);
    await installFrameProbe(T);
    await sleep(6000);
    const fp = await readFrameProbe(T);
    const cvs = await T.eval('({cw:document.querySelector("canvas").width,ch:document.querySelector("canvas").height,cssW:document.querySelector("canvas").clientWidth})');
    await T.shot(`_pt/lead_r3/fp_${width}x${height}.png`);
    return { ...fp, canvas: cvs };
  } finally { await T.close().catch(() => {}); }
}

async function bannerRun(port) {
  const T = await boot(port);
  try {
    await intoPlay(T);
    await T.eval('window.__game._onStageClear()');
    await sleep(120);
    const a = await T.eval('({s:window.__game.state})');
    await T.tap('Escape'); await sleep(150);
    const b = await T.eval('({s:window.__game.state, paused:window.__game.state==="paused"})');
    await sleep(2200);
    const c = await T.eval('({s:window.__game.state,d:window.__game.dialogue.active})');
    for (let i = 0; i < 40; i++) {
      const s = await T.eval('({s:window.__game.state,d:window.__game.dialogue.active,lv:window.__game.levelIndex})');
      if (s.s === 'play' && !s.d) break;
      await T.tap('Enter'); await sleep(160);
    }
    const d = await T.eval('({s:window.__game.state,d:window.__game.dialogue.active,lv:window.__game.levelIndex,hp:window.__game.hud?.banner?.visible})');
    R.banner = { beforeEsc: a, afterEsc: b, afterDelay: c, afterDialogue: d };
  } finally { await T.close().catch(() => {}); }
}

async function clickEl(T, sel) {
  const r = await T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height}; })()`);
  if (!r) return null;
  await T.mouse(r.x, r.y);
  await sleep(220);
  return r;
}

async function musicRun(port) {
  const T = await boot(port);
  try {
    // 标题：用真实鼠标点「音乐回忆室」
    const btn = await T.eval(`(() => { const b = [...document.querySelectorAll('.btn')].find(e => /音乐回忆室/.test(e.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
    if (btn) await T.mouse(btn.x, btn.y);
    await sleep(900);
    const opened = await T.eval('({vis:!document.querySelector(".mr").classList.contains("hidden"), rowCount:document.querySelectorAll(".mr-row").length, state:window.__game.state})');
    const row0 = await clickEl(T, '.mr-row');
    const afterRow = await T.eval('({idx:window.__game.musicRoom.index, playing:window.__game.musicRoom.isPlaying, state:document.querySelector(".mr-state").textContent, title:document.querySelector(".mr-title").textContent})');
    await T.mouse(row0.x, row0.y); // 再点一次 = 停止
    await sleep(500);
    const afterRow2 = await T.eval('({state:document.querySelector(".mr-state").textContent, playing:window.__game.musicRoom.isPlaying})');
    // 点一个未遇曲行（第 18 行）→ 确认弹窗
    const rows = await T.eval('(() => [...document.querySelectorAll(".mr-row")].map((r,i)=>!r.classList.contains("is-locked")?"k":"L").join(""))');
    const lockedIdx = rows.indexOf('L');
    let warn = null, warnCancel = null, warnPlay = null;
    if (lockedIdx >= 0) {
      const rr = await T.eval(`(() => { const r = document.querySelectorAll('.mr-row')[${lockedIdx}]; const b = r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,idx:${lockedIdx}}; })()`);
      await T.mouse(rr.x, rr.y); await sleep(420);
      warn = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), text:document.querySelector(".mr-warn-text").textContent})');
      const c = await T.eval('(() => { const b = document.querySelector(\'[data-act="cancel"]\'); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      await T.mouse(c.x, c.y); await sleep(300);
      warnCancel = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), idx:window.__game.musicRoom.index})');
      // 再点锁定行，这次点「播放」
      await T.mouse(rr.x, rr.y); await sleep(360);
      const p = await T.eval('(() => { const b = document.querySelector(\'[data-act="play"]\'); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      await T.mouse(p.x, p.y); await sleep(700);
      warnPlay = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), playing:window.__game.musicRoom.isPlaying, state:document.querySelector(".mr-state").textContent})');
    }
    // 鼠标点「返回标题」
    const back = await clickEl(T, '.mr-back');
    await sleep(700);
    const afterBack = await T.eval('({mrHidden:document.querySelector(".mr").classList.contains("hidden"), overlayVisible:!document.querySelector("#overlay").classList.contains("hidden"), state:window.__game.state, page:window.__game._page})');
    R.music = { opened, afterRow, afterRow2, lockedIdx, warn, warnCancel, warnPlay, afterBack, clickedBack: !!back };
  } finally { await T.close().catch(() => {}); }
}

async function keybindRun(port) {
  const T = await boot(port);
  try {
    await T.tap('KeyS'); await sleep(500);
    const setState = await T.eval('({page:window.__game._page, rows:[...document.querySelectorAll(".set-row")].map(r=>r.textContent.replace(/\\s+/g," ").trim())})');
    // 找「按键设置」行，点进去
    const row = await T.eval(`(() => { const rs = [...document.querySelectorAll('.set-row')]; const i = rs.findIndex(r => /按键设置/.test(r.textContent)); if (i < 0) return null; const b = rs[i].getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,i}; })()`);
    if (row) await T.mouse(row.x, row.y);
    await sleep(700);
    const kb = await T.eval('({page:window.__game._page, rows:document.querySelectorAll(".kb-row,.key-row,.kb-list .set-row").length, labels:[...document.querySelectorAll(".set-row")].slice(0,3).map(r=>r.textContent.replace(/\\s+/g," ").trim())})');
    // 点第一行（动作行）→ 是否进入捕获
    const kbrow = await T.eval(`(() => { const rs = [...document.querySelectorAll('.set-row')]; const i = rs.findIndex(r => /移动|跳跃|射击/.test(r.textContent)); if (i < 0) return null; const b = rs[i].getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,i,text:rs[i].textContent.replace(/\\s+/g," ").trim()}; })()`);
    if (kbrow) { await T.mouse(kbrow.x, kbrow.y); await sleep(400); }
    const cap = await T.eval('({capture: window.__game._captureAction, hint: (document.querySelector(".panel-hint")||document.querySelector(".hint")||{}).textContent})');
    await T.tap('Escape'); await sleep(400);
    const afterEsc = await T.eval('({capture: window.__game._captureAction, page: window.__game._page, state: window.__game.state})');
    const rep = await T.report({});
    R.keybinds = { setState: { page: setState.page, rows: setState.rows.slice(0, 8) }, kb, kbrow, cap, afterEsc, errors: rep.errors };
  } finally { await T.close().catch(() => {}); }
}

const out = {};
try {
  out.f1280 = await frameRun(9510, 1280, 720);
  out.f900 = await frameRun(9511, 900, 600);
  out.f1600 = await frameRun(9512, 1600, 900);
} catch (e) { out.frameError = String(e && e.stack || e); }
try { await bannerRun(9513); } catch (e) { out.bannerError = String(e && e.stack || e); }
try { await musicRun(9514); } catch (e) { out.musicError = String(e && e.stack || e); }
try { await keybindRun(9515); } catch (e) { out.keybindError = String(e && e.stack || e); }

console.log(JSON.stringify({ ...R, ...out }, null, 2));
