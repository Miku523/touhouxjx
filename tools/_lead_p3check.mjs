// 第二轮 P2/P3 修复验收：说明页文案/布局、HUD 字号下限、80% 缩放下 backing、设置提示、退出取消光标、重置文案
import { launch, sleep } from './_pt_core.mjs';

const checks = [];
const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

async function openGame(port, opts, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const T = await launch({ port, headless: true, ...(opts || {}) });
    try {
      await T.boot({ query: '?v=p3s' + Date.now() + i, waitTitle: 15000 });
      return T;
    } catch (e) {
      lastErr = e;
      await T.close().catch(() => {});
      await sleep(1200);
    }
  }
  throw lastErr;
}

// ---------- A. 1280×720：说明页 ----------
const T1 = await openGame(9501);
try {
  await sleep(400);
  await T1.tap('Slash');
  await sleep(500);
  const help = await T1.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const rows = Array.from(document.querySelectorAll('.help-row'));
    const fs = (s) => q(s) ? parseFloat(getComputedStyle(q(s)).fontSize) : null;
    return {
      state: window.__game.state, page: window.__game._page,
      title: q('.title')?.textContent || '',
      labels: rows.map((r) => r.querySelector('.set-label')?.textContent),
      tips: rows.map((r) => r.querySelector('.help-tip')?.textContent || ''),
      heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      overflow: rows.map((r) => r.scrollWidth - r.clientWidth),
      labelWrap: Array.from(document.querySelectorAll('.help-row .set-label')).map((e) => getComputedStyle(e).whiteSpace),
      tipFs: fs('.help-tip'),
      errs: window.__errs ? window.__errs.length : 0,
    };
  })()`);
  ok('A1 说明页打开', help.state === 'menu' && help.page === 'help', help.page);
  ok('A2 冲刺文案不再写「无敌」', !help.tips.some((t) => t.includes('无敌')), help.tips.join('|'));
  ok('A3 符卡消耗文案 24', help.tips.some((t) => t.includes('耗 24')), help.tips.filter((t) => t.includes('耗')).join('|'));
  ok('A4 低速行不再折行', help.labels.includes('低速 / 判定点'), help.labels.join('|'));
  ok('A5 所有说明行单行高度', Math.max(...help.heights) <= 44, JSON.stringify(help.heights));
  ok('A6 说明行无横向溢出', help.overflow.every((v) => v <= 1), JSON.stringify(help.overflow));
  await T1.shot('_pt/lead_p3/manual_1280.png');

  // 设置页提示 + 滑块键帽
  await T1.tap('Escape'); await sleep(300);
  await T1.tap('KeyS'); await sleep(400);
  const st = await T1.eval(`(() => {
    const p = window.__game;
    const rows = Array.from(document.querySelectorAll('.set-row'));
    const vol = rows.find((r) => (r.textContent || '').includes('音乐音量'));
    return {
      page: p._page, hint: document.querySelector('.hint')?.textContent || '',
      volKey: vol?.querySelector('.k')?.textContent || '',
      volText: vol?.textContent || '',
      errs: window.__errs ? window.__errs.length : 0,
    };
  })()`);
  ok('B1 设置页提示含 ← → / ENTER 调整', st.hint.includes('← → / ENTER 调整'), st.hint);
  ok('B2 音量行键帽标注 ENTER', st.volKey.includes('ENTER'), st.volKey);

  // 重置进度文案
  await T1.tap('KeyX'); await sleep(400);
  const reset = await T1.eval(`(() => ({ hint: document.querySelector('.hint')?.textContent || '', sub: document.querySelector('.subtitle')?.textContent || '', page: window.__game._page }))()`);
  ok('B3 重置文案提到音乐回忆保留', (reset.hint + reset.sub).includes('音乐回忆'), reset.hint);
  await T1.tap('Escape'); await sleep(250);
  await T1.tap('Escape'); await sleep(250);
} finally { await T1.close().catch(() => {}); }

// ---------- C. 900×600：HUD 字号下限 + 说明页 ----------
const T2 = await openGame(9502, { width: 900, height: 600 });
try {
  await sleep(300);
  await T2.tap('Slash'); await sleep(450);
  const h900 = await T2.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('.help-row'));
    return { labels: rows.map((r) => r.querySelector('.set-label')?.textContent), heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)), overflow: rows.map((r) => r.scrollWidth - r.clientWidth) };
  })()`);
  ok('C1 900×600 说明页行高单行', Math.max(...h900.heights) <= 40, JSON.stringify(h900.heights));
  ok('C2 900×600 说明页无溢出', h900.overflow.every((v) => v <= 1), JSON.stringify(h900.overflow));
  await T2.shot('_pt/lead_p3/manual_900.png');
  await T2.tap('Escape'); await sleep(250);
  // 进游戏看 HUD
  await T2.tap('Enter'); await sleep(300);
  await T2.tap('KeyE'); await sleep(300);
  await T2.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T2.eval('({ s: window.__game.state, d: window.__game.dialogue.active, p: window.__game._page })');
    if (s.s === 'play' && !s.d) break;
    if (s.s === 'menu' && s.p === 'charselect') await T2.tap('Digit1');
    await T2.tap('Enter'); await sleep(140);
  }
  await sleep(700);
  const hud = await T2.eval(`(() => {
    const fs = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
    return { pl: fs('.pl'), pdim: fs('.pdim'), pn: fs('.pn'), exTag: fs('.ex-tag'), exNum: fs('.extend > b'), sn: fs('.sn'), tm: fs('.tm'), ss: fs('.ss'), state: window.__game.state, errs: window.__errs ? window.__errs.length : 0 };
  })()`);
  ok('C3 900×600 HUD POWER 标签 ≥9px', hud.pl >= 9, String(hud.pl));
  ok('C4 900×600 HUD /64 数字 ≥9px', hud.pdim >= 9, String(hud.pdim));
  ok('C5 900×600 HUD 1UP 数字 ≥9px', hud.exNum >= 9, String(hud.exNum));
  ok('C6 900×600 HUD 关卡文字 ≥9px', hud.sn >= 9, String(hud.sn));
  await T2.shot('_pt/lead_p3/hud_900.png');

  // 暂停 → 退出确认 → 取消：光标应回到「继续」
  await T2.tap('Escape'); await sleep(500);
  const pause0 = await T2.eval('({ state: window.__game.state, page: window.__game._page, idx: window.__game.menuIndex, labels: Array.from(document.querySelectorAll(".btn")).map(b=>b.textContent.trim()) })');
  for (let i = 0; i < 3; i++) { await T2.tap('ArrowDown'); await sleep(90); }
  await T2.tap('Enter'); await sleep(450);
  const quitPage = await T2.eval('({ page: window.__game._page, labels: Array.from(document.querySelectorAll(".btn")).map(b=>b.textContent.trim()) })');
  await T2.tap('Escape'); await sleep(400);
  const back = await T2.eval('({ state: window.__game.state, page: window.__game._page, idx: window.__game.menuIndex, labels: Array.from(document.querySelectorAll(".btn")).map(b=>b.textContent.trim()) })');
  ok('D1 暂停菜单四项', pause0.labels.length === 4, pause0.labels.join('|'));
  ok('D2 退出确认页', quitPage.page === '' && quitPage.labels.some((t) => t.includes('继续游戏')), quitPage.labels.join('|'));
  ok('D3 取消退出后光标回到「继续」', back.page === 'paused' && back.idx === 0, JSON.stringify({ page: back.page, idx: back.idx }));
  await T2.tap('Escape'); await sleep(300);
} finally { await T2.close().catch(() => {}); }

// ---------- E. 1600×900 @ 80% 缩放（dsf 0.8）：backing 应 ≥1.25，画布不被拉伸 ----------
const T3 = await openGame(9503, { width: 1600, height: 900, deviceScaleFactor: 0.8 });
try {
  await sleep(300);
  const r = await T3.eval(`(() => {
    const c = document.querySelector('canvas');
    const cs = getComputedStyle(c);
    return { dpr: window.devicePixelRatio, info: window.__rendererInfo, w: c.width, css: [cs.width, cs.height] };
  })()`);
  const cssW = parseFloat(r.css[0]);
  ok('E1 80% 缩放 backing ≥1.25（画布不被拉伸）', r.info.backing >= 1.24 && Math.abs(r.w - cssW) <= 2, JSON.stringify({ backing: r.info.backing, canvasW: r.w, cssW }));
  await T3.shot('_pt/lead_p3/zoom80.png');
} finally { await T3.close().catch(() => {}); }

const pass = checks.filter((c) => c.pass).length;
console.log(JSON.stringify({ pass, total: checks.length, checks }, null, 2));
