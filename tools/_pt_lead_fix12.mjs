/**
 * Lead 二轮修复验证：① 触摸板尺寸/竖屏提示 ② 暂停→退出到标题二次确认
 *
 * 运行：node tools/_pt_lead_fix12.mjs   （需要 8138 静态服务器）
 * 输出：_pt/lead_fix12/{report.json, mobile-portrait.png, mobile-landscape.png, desktop-confirm.png}
 */
import { launch, snapshot, makeChecks, saveJson, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '_pt/lead_fix12';
mkdirSync(OUT, { recursive: true });
const C = makeChecks();
const notes = [];
const step = (m) => {
  notes.push(m);
  console.log(`[step ${new Date().toISOString().slice(11, 19)}] ${m}`);
};

async function startRun(T) {
  await T.boot();
  await T.tap('Enter');
  await T.waitFor('window.__game.state === "menu" && window.__game._page === "diff"', 5000);
  await T.tap('KeyE');
  await sleep(150);
  await T.tap('Digit1');
  await sleep(200);
  for (let i = 0; i < 60; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) return true;
    if (s.state === 'gameover' || s.state === 'ending') return false;
    await T.tap('Enter');
    await sleep(60);
  }
  return (await T.eval('window.__game.state')) === 'play';
}

const panel = (T) =>
  T.eval(`(() => {
    const g = window.__game;
    return {
      state: g.state,
      stage: !!g.stage,
      title: String(document.getElementById('title').textContent || '').trim(),
      subtitle: String(document.getElementById('subtitle').textContent || '').trim(),
      hint: String(document.getElementById('hint').textContent || '').trim(),
      sel: g.menuIndex,
      buttons: (g.menuButtons || []).map((b) => ({
        label: String(b.textContent || '').replace(/\\s+/g, ' ').trim(),
        key: b._spec?.key || '', hotkey: b._spec?.hotkey || '', back: !!b._spec?.back,
        cls: b.className, sel: b.classList.contains('sel'),
      })),
    };
  })()`);

/* ================= A. 桌面：暂停 → 退出确认 ================= */
async function scenarioPauseQuit() {
  step('A 暂停→退出确认（桌面 1280x720）');
  const T = await launch({ port: 9451, width: 1280, height: 720 });
  try {
    C.chk(await startRun(T), 'A0 开一局 E/灵梦进入 play');
    await T.tap('Escape');
    await sleep(400);
    let p = await panel(T);
    C.eq(p.title, '暂停', 'A1 Esc 打开暂停菜单');
    C.eq(p.buttons.find((b) => /退出到标题/.test(b.label))?.hotkey, 'KeyQ', 'A2 暂停菜单「退出到标题」绑定 KeyQ');

    await T.tap('KeyQ');
    await sleep(450);
    p = await panel(T);
    C.eq(p.title, '退出到标题', 'A3 按 Q 弹出二次确认页（不直接丢局）');
    C.eq(p.state, 'paused', 'A4 确认页仍处于 paused');
    C.chk(p.stage === true, 'A5 确认页本局 stage 还在（未丢局）', `stage=${p.stage}`);
    C.chk(p.buttons.some((b) => /继续游戏/.test(b.label)) && p.buttons.some((b) => /退出到标题/.test(b.label)),
      'A6 确认页按钮=继续游戏/退出到标题', p.buttons.map((b) => b.label));
    C.eq(p.buttons[p.sel]?.label.includes('继续游戏'), true, 'A7 默认高亮「继续游戏」（防误触）');
    C.chk(/不会保存/.test(p.subtitle) && /本局/.test(p.subtitle), 'A8 副标题说明进度不保存', p.subtitle);
    await T.shot(`${OUT}/desktop-confirm.png`);

    await T.tap('Enter');
    await sleep(400);
    p = await panel(T);
    C.eq(p.title, '暂停', 'A9 确认页 Enter 取消 → 回到暂停菜单');
    C.chk(p.stage === true, 'A10 取消后本局仍在（stage 未销毁）');

    await T.tap('KeyQ');
    await sleep(400);
    await T.tap('Escape');
    await sleep(400);
    p = await panel(T);
    C.eq(p.title, '暂停', 'A11 确认页 Esc 也等同取消（back）');

    await T.tap('KeyQ');
    await sleep(400);
    p = await panel(T);
    C.eq(p.title, '退出到标题', 'A12 再次 Q 打开确认页');
    await T.tap('KeyQ');
    await sleep(600);
    p = await panel(T);
    C.eq(p.state, 'menu', 'A13 确认页再按 Q → 回标题');
    C.chk(p.stage === false, 'A14 退出后 stage 已销毁');
    C.chk(/東方新紀行|东方新纪行/.test(p.title) || p.state === 'menu', 'A15 标题画面出现', p.title);

    const r = await T.report();
    C.chk(r.errors.length === 0, 'A16 全程无 JS 异常', r.errors);
  } finally {
    await T.close();
  }
}

/* ================= B. 手机竖屏：触摸板尺寸与竖屏提示 ================= */
async function touchMetrics(T) {
  return T.eval(`(() => {
    const pad = document.getElementById('touch');
    const hint = document.querySelector('.rotate-hint');
    const cs = (e) => (e ? getComputedStyle(e) : null);
    const buttons = [...pad.querySelectorAll('button[data-k]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { k: b.dataset.k, w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), left: Math.round(r.left) };
    });
    const pr = pad.getBoundingClientRect();
    return {
      vw: innerWidth, vh: innerHeight,
      padVisible: !pad.classList.contains('hidden'),
      padPosition: cs(pad)?.position,
      padBottom: Math.round(pr.bottom),
      touchable: matchMedia('(pointer: coarse)').matches,
      hintDisplay: hint ? cs(hint).display : null,
      hintText: hint ? hint.textContent.trim() : null,
      buttons,
      small: buttons.filter((b) => b.w < 42 || b.h < 42).length,
      overflow: buttons.filter((b) => b.left < 0 || b.bottom > innerHeight + 1).length,
    };
  })()`);
}

async function scenarioMobile() {
  step('B 手机竖屏 390x844（触摸板尺寸/固定位置/竖屏提示）');
  const T = await launch({ port: 9452, width: 390, height: 844, mobile: true });
  try {
    await T.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    C.chk(await startRun(T), 'B0 触摸设备可开局');
    const m = await touchMetrics(T);
    C.chk(m.touchable, 'B1 pointer:coarse 为 true');
    C.chk(m.padVisible, 'B2 触摸板可见');
    C.eq(m.padPosition, 'fixed', 'B3 触摸板固定定位（不再跟着 390x219 画布缩）');
    C.chk(Math.abs(m.padBottom - m.vh) <= 24, 'B4 触摸板贴视口底部', `padBottom=${m.padBottom} vh=${m.vh}`);
    C.eq(m.small, 0, 'B5 7 个触摸键均 ≥42px（修复前 16–19px）', m.buttons);
    C.eq(m.overflow, 0, 'B6 触摸键全部在视口内', m.buttons);
    C.eq(m.hintDisplay, 'block', 'B7 竖屏显示「建议横屏」提示');
    await T.shot(`${OUT}/mobile-portrait.png`);

    // 真实触摸：按住右移
    const before = await T.eval('window.__game.stage?.player?.x ?? -1');
    const right = m.buttons.find((b) => b.k === 'right');
    const cx = right.left + right.w / 2, cy = right.bottom - right.h / 2;
    await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await sleep(500);
    const mid = await T.eval('window.__game.stage?.player?.x ?? -1');
    await T.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await sleep(200);
    const held = await T.eval('[...(window.__game.input?.held?.keys?.() || [])]');
    C.chk(mid > before + 8, 'B8 按住右移键角色前进（触摸仍可用）', `x ${before}→${mid}`);
    C.eq(held.length, 0, 'B9 松手后 held 清空（无粘键）');

    // 横屏：提示消失、按钮仍 ≥42
    await T.send('Emulation.setDeviceMetricsOverride', {
      width: 844, height: 390, deviceScaleFactor: 1, mobile: true,
    });
    await sleep(700);
    const l = await touchMetrics(T);
    C.eq(l.hintDisplay, 'none', 'B10 横屏不再显示提示');
    C.eq(l.small, 0, 'B11 横屏触摸键仍 ≥42px', l.buttons);
    C.eq(l.overflow, 0, 'B12 横屏触摸键全在视口内', l.buttons);
    await T.shot(`${OUT}/mobile-landscape.png`);

    const r = await T.report();
    C.chk(r.errors.length === 0, 'B13 触摸场景无 JS 异常', r.errors);
    C.chk(r.httpBad.length === 0, 'B14 无 4xx/5xx 资源', r.httpBad);
  } finally {
    await T.close();
  }
}

/* ================= C. 桌面触摸（触屏笔记本）：不应变小 ================= */
async function scenarioDesktopTouch() {
  step('C 触屏笔记本 1280x720（按钮不应被 min 缩水）');
  const T = await launch({ port: 9453, width: 1280, height: 720 });
  try {
    await T.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await T.boot();
    await sleep(400);
    const m = await touchMetrics(T).catch(() => null);
    if (!m || !m.padVisible) {
      // 桌面鼠标环境触摸板可能仍隐藏：用 coarse 模拟覆盖
      await T.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
      await T.eval('window.dispatchEvent(new Event("resize"))');
      await sleep(300);
    }
    const m2 = await touchMetrics(T).catch(() => null);
    if (m2 && m2.padVisible) {
      C.eq(m2.small, 0, 'C1 1280 宽触摸键 ≥42px', m2.buttons);
      C.chk(m2.buttons.every((b) => b.w <= 70), 'C2 桌面触摸键不超大（≤70px）', m2.buttons);
      C.eq(m2.padPosition, 'fixed', 'C3 触摸层仍为 fixed');
    } else {
      notes.push('桌面无触摸板（coarse 模拟未生效），C 组跳过');
    }
    C.chk((await T.report()).errors.length === 0, 'C4 无 JS 异常');
  } finally {
    await T.close();
  }
}

const watchdog = setTimeout(() => {
  console.log('[WATCHDOG] 超时收尾');
  saveJson(`${OUT}/report-partial.json`, { ...C.sum(), notes, watchdog: true });
  process.exit(2);
}, 420000);

try {
  await scenarioPauseQuit();
  await scenarioMobile();
  await scenarioDesktopTouch();
} catch (e) {
  notes.push('FATAL ' + e.message);
  console.log('FATAL', e.stack || e.message);
} finally {
  clearTimeout(watchdog);
  const sum = C.sum();
  saveJson(`${OUT}/report.json`, { ...sum, notes, generatedAt: new Date().toISOString() });
  console.log(JSON.stringify(sum, null, 1).slice(0, 400));
  console.log(`PASS ${sum.pass} / FAIL ${sum.fail}`);
  process.exit(sum.fail ? 1 : 0);
}
