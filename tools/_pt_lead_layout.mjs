/**
 * Lead 布局/DPR/触摸 稳健性反向试玩
 *
 *  L. 实时 resize：1280x720 → 960x540 → 1920x1080 → 800x600，
 *     检查 canvas backing 尺寸规则（renderer.backing = clamp(scale*dpr,1.5,2.5)）、
 *     letterbox、HUD DOM 元素互相重叠、JS 错误。
 *  M. DPR=2（高分屏）：同一套尺寸规则 + 3 秒帧探针。
 *  N. 触摸模式：mobile + touch 模拟，检查 #touch 是否出现、点跳跃/射击是否真的生效。
 *
 * 运行：node tools/_pt_lead_layout.mjs
 */
import { launch, snapshot, makeChecks, saveJson, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const OUT = '_pt/lead_layout';
const C = makeChecks();
const notes = [];
const step = (m) => console.log(`[step] ${m}`);
let seq = 0;

const HUD_IDS = ['hud', 'lives', 'powerBar', 'stageName', 'timer', 'settingsBtn', 'bossBar', 'extendFill', 'powerNum'];

function mk(sel) {
  return sel;
}

async function run(name, opts, fn) {
  step(`${name} 启动`);
  const T = await launch({ port: 9440 + (++seq), width: opts.width, height: opts.height, mobile: !!opts.mobile });
  const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);
  const geo = () =>
    T.eval(`(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return null;
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      const out = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
      const cv = document.getElementById('game');
      out.canvasCss = r(cv); out.canvasPx = cv ? { w: cv.width, h: cv.height } : null;
      out.renderer = window.__game?.renderer ? { scale: +window.__game.renderer.scale.toFixed(3), backing: +window.__game.renderer.backing.toFixed(3), post: window.__game.renderer.postLevel } : null;
      out.cssVarS = getComputedStyle(document.documentElement).getPropertyValue('--s').trim();
      out.hud = {};
      for (const id of ${JSON.stringify(HUD_IDS)}) out.hud[id] = r(document.getElementById(id));
      const touch = document.getElementById('touch');
      out.touchVisible = !!touch && !touch.classList.contains('hidden') && touch.getBoundingClientRect().width > 1;
      return out;
    })()`);

  const overlaps = (hud) => {
    const pairs = [];
    const names = Object.keys(hud).filter((k) => hud[k]);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = hud[names[i]], b = hud[names[j]];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const area = ix * iy;
        if (area <= 0) continue;
        const minArea = Math.min(a.w * a.h, b.w * b.h);
        if (area / minArea > 0.18) pairs.push(`${names[i]}×${names[j]} ${Math.round((area / minArea) * 100)}%`);
      }
    }
    return pairs;
  };

  try {
    await fn({ T, G, geo, overlaps });
  } catch (e) {
    C.chk(false, `${name} 异常`, String(e && e.message ? e.message : e));
    notes.push(`${name} 异常: ` + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  } finally {
    const rep = await T.report().catch(() => null);
    if (rep) {
      C.chk(rep.errors.length === 0, `${name} 无 JS 异常`, rep.errors.slice(0, 3).join(' | '));
      C.chk(rep.httpBad.length === 0 && rep.netFails.length === 0, `${name} 无 404/网络失败`,
        JSON.stringify({ bad: rep.httpBad.slice(0, 3), fail: rep.netFails.slice(0, 3) }));
    }
    try { await T.close(); } catch {}
    step(`${name} 结束`);
  }
}

async function bootToTitle(T, G) {
  await T.boot();
  await sleep(300);
}

/* ---------------- L. 实时 resize ---------------- */
await run('L resize', { width: 1280, height: 720 }, async ({ T, G, geo, overlaps }) => {
  await bootToTitle(T, G);
  const sizes = [[1280, 720], [960, 540], [1920, 1080], [800, 600], [2560, 1440]];
  for (const [w, h] of sizes) {
    await T.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(450);
    const g = await geo();
    const ov = overlaps(g.hud);
    const expectBacking = Math.min(Math.max(Math.min(w / 1280, h / 720) * 1, 1.5), 2.5);
    C.chk(Math.abs(g.renderer.backing - expectBacking) < 0.01, `L ${w}x${h} backing 符合规则 ${expectBacking}`, `实际=${g.renderer.backing} scale=${g.renderer.scale}`);
    C.chk(g.canvasPx.w === Math.round(1280 * g.renderer.backing) && g.canvasPx.h === Math.round(720 * g.renderer.backing), `L ${w}x${h} canvas 像素尺寸自洽`, JSON.stringify(g.canvasPx));
    C.chk(Math.abs(parseFloat(g.cssVarS) - g.renderer.scale) < 0.02, `L ${w}x${h} --s 与 scale 一致`, `--s=${g.cssVarS} scale=${g.renderer.scale}`);
    C.chk(ov.length === 0, `L ${w}x${h} HUD 元素无重叠`, ov.join(', '));
    C.chk(g.vw === w && g.vh === h, `L ${w}x${h} 视口已生效`, `vw=${g.vw} vh=${g.vh}`);
    await T.shot(`${OUT}/L-${w}x${h}.png`);
  }
  // resize 后再回 1280x720，进游戏确认可玩
  await T.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await T.tap('Enter'); await sleep(200); await T.tap('KeyE'); await sleep(150); await T.tap('Digit1'); await sleep(200);
  for (let i = 0; i < 50; i++) { const s = await snapshot(T); if (s.state === 'play' && !s.dialogue) break; await T.tap('Enter'); await sleep(60); }
  const s = await snapshot(T);
  C.eq(s.state, 'play', 'L resize 后仍可正常开局');
  C.chk(Number.isFinite(s.px), 'L 玩家坐标正常');
  // 游戏内 resize 到 1920x1080
  await T.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const g2 = await geo();
  C.chk(!!g2.renderer && Math.abs(g2.renderer.scale - 1.5) < 0.01, 'L 游戏内 resize 后 scale=1.5', JSON.stringify(g2.renderer));
  await sleep(300);
  const s2 = await snapshot(T);
  C.chk(s2.state === 'play' && !s2.nan, 'L 游戏内 resize 不崩、坐标无 NaN', JSON.stringify({ state: s2.state, nan: s2.nan, px: s2.px }));
  await T.shot(`${OUT}/L-ingame-1920.png`);
});

/* ---------------- M. DPR=2 高分屏 ---------------- */
await run('M dpr2', { width: 1280, height: 720 }, async ({ T, G, geo, overlaps }) => {
  await T.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
  await T.boot();
  await sleep(400);
  const g = await geo();
  C.eq(g.dpr, 2, 'M devicePixelRatio=2 生效', `dpr=${g.dpr}`);
  C.chk(Math.abs(g.renderer.backing - 2) < 0.01, 'M DPR2 时 backing 被 clamp 到 2（不是 2.5）', `backing=${g.renderer.backing}`);
  C.chk(g.canvasPx.w === 2560 && g.canvasPx.h === 1440, 'M canvas 2560x1440', JSON.stringify(g.canvasPx));
  const ov = overlaps(g.hud);
  C.chk(ov.length === 0, 'M DPR2 标题页 HUD 无重叠', ov.join(', '));
  await T.shot(`${OUT}/M-dpr2-title.png`);

  await T.tap('Enter'); await sleep(200); await T.tap('KeyE'); await sleep(150); await T.tap('Digit1'); await sleep(200);
  for (let i = 0; i < 50; i++) { const s = await snapshot(T); if (s.state === 'play' && !s.dialogue) break; await T.tap('Enter'); await sleep(60); }
  const s = await snapshot(T);
  C.eq(s.state, 'play', 'M DPR2 可开局');
  await installFrameProbe(T);
  await sleep(3000);
  const fp = await readFrameProbe(T);
  C.chk(!!fp && fp.frames > 0, 'M DPR2 帧探针有数据', JSON.stringify(fp && { frames: fp.frames, avg: fp.avg, p95: fp.p95, worst: fp.worst }));
  notes.push('M DPR2 帧探针: ' + JSON.stringify(fp && { frames: fp.frames, avg: fp.avg, p50: fp.p50, p95: fp.p95, p99: fp.p99, worst: fp.worst, longTotal: fp.longTotal }));
  await T.shot(`${OUT}/M-dpr2-play.png`);
});

/* ---------------- N. 触摸模式 ---------------- */
await run('N touch', { width: 390, height: 844, mobile: true }, async ({ T, G, geo }) => {
  await T.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await T.boot();
  await sleep(500);
  const g0 = await geo();
  notes.push('N 触摸环境: ' + JSON.stringify({ vw: g0.vw, vh: g0.vh, touch: g0.touchVisible, coarse: await T.eval(`matchMedia('(pointer: coarse)').matches`) }));
  C.chk(g0.touchVisible, 'N mobile+coarse 时 #touch 触摸板出现', JSON.stringify({ touch: g0.touchVisible }));

  if (g0.touchVisible) {
    // 标题页触摸板也会挡住？先确认标题可用：点触摸板的确认按钮或按 Enter 进游戏
    await T.tap('Enter'); await sleep(250); await T.tap('KeyE'); await sleep(150); await T.tap('Digit1'); await sleep(200);
    for (let i = 0; i < 60; i++) { const s = await snapshot(T); if (s.state === 'play' && !s.dialogue) break; await T.tap('Enter'); await sleep(60); }
    const s = await snapshot(T);
    C.eq(s.state, 'play', 'N 触摸设备可开局');
    const btns = await T.eval(`(() => {
      const pad = document.getElementById('touch');
      return [...pad.querySelectorAll('button[data-k]')].map(b => {
        const r = b.getBoundingClientRect();
        return { k: b.dataset.k, x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) };
      });
    })()`);
    notes.push('N 触摸按钮: ' + JSON.stringify(btns));
    C.chk(btns.length > 0, 'N 触摸板有动作按钮', String(btns.length));
    // 用真实 touch 事件按住 right 再松手，看角色是否移动
    const right = btns.find((b) => b.k === 'right');
    const shoot = btns.find((b) => b.k === 'shoot');
    if (right) {
      const x0 = (await snapshot(T)).px;
      await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x, y: right.y, id: 1 }] });
      await sleep(500);
      const x1 = (await snapshot(T)).px;
      await T.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
      const x2 = (await snapshot(T)).px;
      C.chk(x1 > x0, 'N 触摸「右」按钮让角色右移', `x ${x0} → ${x1}`);
      C.chk(x2 >= x1 - 2, 'N 松手后角色不再被拖动', `x ${x1} → ${x2}`);
    } else {
      notes.push('N 没有 right 按钮（检查 data-k 命名）');
    }
    if (shoot) {
      const b0 = (await snapshot(T)).bullets;
      await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: shoot.x, y: shoot.y, id: 2 }] });
      await sleep(400);
      const b1 = (await snapshot(T)).bullets;
      await T.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      C.chk(b1 >= b0, 'N 触摸「射击」不抛错、弹数不异常', `bullets ${b0} → ${b1}`);
    }
    await T.shot(`${OUT}/N-touch-play.png`);
  }
});

const sum = C.sum();
saveJson(`${OUT}/report.json`, { ...sum, notes });
console.log(JSON.stringify({ ...sum, notes }, null, 2));
process.exit(0);
