// 第三轮补测 B：结算 banner Esc、音乐室鼠标、改键页鼠标（结果落盘 JSON）
import { launch, sleep } from './_pt_core.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = { banner: {}, music: {}, keybinds: {} };
mkdirSync('_pt/lead_r3', { recursive: true });

async function boot(port) {
  for (let i = 0; i < 3; i++) {
    try {
      const T = await launch({ port, headless: true });
      await T.boot({ query: '?v=r3b_' + Date.now() + '&p=' + port, waitTitle: 20000 });
      return T;
    } catch { await sleep(1200); }
  }
  throw new Error('boot failed ' + port);
}
async function intoPlay(T) {
  await T.tap('Enter'); await sleep(300);
  await T.tap('KeyE'); await sleep(250);
  await T.tap('Digit1'); await sleep(300);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({s:window.__game.state,p:window.__game._page,d:window.__game.dialogue.active})');
    if (s.s === 'play' && !s.d) return s;
    if (s.s === 'menu' && s.p === 'charselect') await T.tap('Digit1'); else await T.tap('Enter');
    await sleep(140);
  }
  return T.eval('({s:window.__game.state})');
}
async function clickEl(T, sel) {
  const r = await T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; })()`);
  if (!r) return null;
  await T.mouse(r.x, r.y); await sleep(240);
  return r;
}

// A. 结算 banner 期间 Esc
{
  const T = await boot(9521);
  try {
    await intoPlay(T);
    await T.eval('window.__game._onStageClear()');
    await sleep(120);
    const beforeEsc = await T.eval('({state:window.__game.state})');
    await T.tap('Escape'); await sleep(160);
    const afterEsc = await T.eval('({state:window.__game.state, page:window.__game._page})');
    await sleep(2200);
    const afterDelay = await T.eval('({state:window.__game.state, dialogue:window.__game.dialogue.active})');
    // banner 期间再按一次 Esc（对话中）
    await T.tap('Escape'); await sleep(200);
    const dialogueEsc = await T.eval('({state:window.__game.state, page:window.__game._page})');
    for (let i = 0; i < 60; i++) {
      const s = await T.eval('({s:window.__game.state,d:window.__game.dialogue.active,lv:window.__game.levelIndex})');
      if (s.s === 'play' && !s.d) break;
      await T.tap('Enter'); await sleep(150);
    }
    const after = await T.eval('({state:window.__game.state,lv:window.__game.levelIndex,page:window.__game._page})');
    const rep = await T.report({});
    OUT.banner = { beforeEsc, afterEsc, afterDelay, dialogueEsc, after, errors: rep.errors };
  } finally { await T.close().catch(() => {}); }
}

// B. 音乐室鼠标
{
  const T = await boot(9522);
  try {
    const btn = await T.eval(`(() => { const b = [...document.querySelectorAll('.btn')].find(e => /音乐回忆室/.test(e.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
    if (!btn) throw new Error('music room button not found');
    await T.mouse(btn.x, btn.y); await sleep(900);
    const opened = await T.eval('({mr:!!document.querySelector(".mr"), hidden:document.querySelector(".mr")?.classList.contains("hidden"), state:window.__game.state, rows:document.querySelectorAll(".mr-row").length})');
    const row0 = await clickEl(T, '.mr-row');
    const afterRow = await T.eval('({idx:window.__game.musicRoom.index, state:document.querySelector(".mr-state").textContent, title:document.querySelector(".mr-title").textContent})');
    const rowsStr = String(await T.eval('(() => { const a = [...document.querySelectorAll(".mr-row")].map(r => r.classList.contains("is-locked") ? "L" : "k"); return a.join(""); })()'));
    const lockedIdx = rowsStr.indexOf('L');
    let warn = null, cancel = null, play = null;
    if (lockedIdx >= 0) {
      const rr = await T.eval(`(() => { const r = document.querySelectorAll('.mr-row')[${lockedIdx}]; const b = r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
      await T.mouse(rr.x, rr.y); await sleep(450);
      warn = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), text:(document.querySelector(".mr-warn-text").textContent||"").slice(0,40)})');
      const c = await T.eval('(() => { const b = document.querySelector(\'[data-act="cancel"]\'); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      await T.mouse(c.x, c.y); await sleep(320);
      cancel = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), idx:window.__game.musicRoom.index})');
      await T.mouse(rr.x, rr.y); await sleep(380);
      const p = await T.eval('(() => { const b = document.querySelector(\'[data-act="play"]\'); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      await T.mouse(p.x, p.y); await sleep(700);
      play = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), state:document.querySelector(".mr-state").textContent, idx:window.__game.musicRoom.index})');
    }
    const back = await clickEl(T, '.mr-back');
    await sleep(800);
    const afterBack = await T.eval('({mrHidden:document.querySelector(".mr")?.classList.contains("hidden"), overlayVisible:!document.querySelector("#overlay").classList.contains("hidden"), state:window.__game.state, page:window.__game._page})');
    await T.shot('_pt/lead_r3/mr_mouse.png');
    const rep = await T.report({});
    OUT.music = { opened, afterRow, rowsStr, lockedIdx, warn, cancel, play, clickedBack: !!back, afterBack, errors: rep.errors };
  } finally { await T.close().catch(() => {}); }
}

// C. 改键页鼠标
{
  const T = await boot(9523);
  try {
    await T.tap('KeyS'); await sleep(600);
    const settings = await T.eval('({page:window.__game._page, rows:[...document.querySelectorAll(".set-row")].map(r=>r.textContent.replace(/\\s+/g," ").trim())})');
    const kbEntry = await T.eval(`(() => { const rs = [...document.querySelectorAll('.set-row')]; const i = rs.findIndex(r => /按键设置/.test(r.textContent)); const b = rs[i]?.getBoundingClientRect(); return i >= 0 ? {i, x:b.x+b.width/2, y:b.y+b.height/2} : null; })()`);
    if (kbEntry) await T.mouse(kbEntry.x, kbEntry.y);
    await sleep(800);
    const kbPage = await T.eval('({page:window.__game._page, rows:[...document.querySelectorAll(".set-row")].slice(0,6).map(r=>r.textContent.replace(/\\s+/g," ").trim())})');
    const actRow = await T.eval(`(() => { const rs = [...document.querySelectorAll('.set-row')]; const i = rs.findIndex(r => /跳跃|射击|左移/.test(r.textContent)); const b = rs[i]?.getBoundingClientRect(); return i >= 0 ? {i, text: rs[i].textContent.replace(/\\s+/g," ").trim(), x:b.x+b.width/2, y:b.y+b.height/2} : null; })()`);
    if (actRow) await T.mouse(actRow.x, actRow.y);
    await sleep(400);
    const cap = await T.eval('({capture: window.__game._captureAction, page: window.__game._page, hint: document.querySelector(".panel-hint")?.textContent || ""})');
    await T.tap('Escape'); await sleep(400);
    const afterEsc = await T.eval('({capture: window.__game._captureAction, page: window.__game._page, state: window.__game.state})');
    // 再点一次同一行 → 应进入捕获，再点第二下同一行 → 取消捕获
    if (actRow) {
      await T.mouse(actRow.x, actRow.y); await sleep(300);
      const cap2 = await T.eval('({capture: window.__game._captureAction})');
      await T.mouse(actRow.x, actRow.y); await sleep(300);
      const cap3 = await T.eval('({capture: window.__game._captureAction})');
      OUT.keybinds = { settings: settings.rows.slice(0, 8), kbEntry, kbPage, actRow, cap, afterEsc, cap2, cap3 };
    } else {
      OUT.keybinds = { settings: settings.rows.slice(0, 8), kbEntry, kbPage, actRow: null };
    }
    const rep = await T.report({});
    OUT.keybinds.errors = rep.errors;
    await T.shot('_pt/lead_r3/keybinds.png');
  } finally { await T.close().catch(() => {}); }
}

writeFileSync('_pt/lead_r3/r3b.json', JSON.stringify(OUT, null, 2));
console.log(JSON.stringify(OUT, null, 2));
