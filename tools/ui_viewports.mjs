// UI 视口回归：5 个视口各抓标题页 + 设置页，并给出断言数字。
// 用法: node tools/ui_viewports.mjs [url] [outDir]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TARGET = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const OUT = process.argv[3] || '.tmp_shots/ui_v2';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1440x900', w: 1440, h: 900, dpr: 1, mobile: false },
  { name: '1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'ipad-1024x768', w: 1024, h: 768, dpr: 2, mobile: true },
  { name: 'fold-673x997', w: 673, h: 997, dpr: 2, mobile: true },
  { name: '360x640', w: 360, h: 640, dpr: 2, mobile: true },
];

const profile = mkdtempSync(join(tmpdir(), 'edge-ui-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,900', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(200);
}
if (!page) { console.error('no page target'); proc.kill(); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, { res, rej });
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const p = join(OUT, name + '.png');
  writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
};

await send('Page.enable');
await send('Runtime.enable');

const report = [];
for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 1 });
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(2600);
  // 标题揭幕动画（.intro）没结束前按钮 opacity 为 0，等它摘掉再截图
  for (let i = 0; i < 40; i++) {
    const done = await evaluate("!document.querySelector('.overlay.title-mode.intro')");
    if (done) break;
    await sleep(250);
  }
  try { await evaluate("document.querySelector('#overlay')?.click?.()"); } catch {}

  await shot(`${vp.name}-01-title`);

  // 打开设置：优先点「设置」按钮，退而求其次走内部方法
  const opened = await evaluate(`(() => {
    const b = [...document.querySelectorAll('#buttons .btn, #overlay .btn')]
      .find(el => /设置|Options|Settings/i.test(el.textContent || ''));
    if (b) { b.click(); return 'click'; }
    if (window.game?.showSettings) { window.game.showSettings(); return 'api'; }
    return 'none';
  })()`);
  await sleep(1200);
  await shot(`${vp.name}-02-settings`);

  const metrics = await evaluate(`(() => {
    const de = document.documentElement;
    const ov = document.querySelector('#overlay');
    const panel = ov && ov.querySelector('.panel');
    const foot = ov && ov.querySelector('.set-group[data-g$="foot"]');
    const rows = [...document.querySelectorAll('#overlay .set-row')];
    const sizes = rows.map(el => parseFloat(getComputedStyle(el).fontSize)).filter(Boolean);
    const vh = innerHeight;
    const panelBox = panel ? panel.getBoundingClientRect() : null;
    const footBox = foot ? foot.getBoundingClientRect() : null;
    // 遮挡：任意设置行与底栏相交即算被压
    let covered = 0;
    if (footBox) {
      for (const r of rows) {
        const b = r.getBoundingClientRect();
        if (b.bottom > footBox.top + 1 && b.top < footBox.bottom - 1) covered++;
      }
    }
    const btn = document.querySelector('#overlay .btn');
    return {
      opened: ${JSON.stringify(opened)},
      scrollW: de.scrollWidth, innerW: innerWidth,
      overflowX: de.scrollWidth - innerWidth,
      overlayPos: ov ? getComputedStyle(ov).position : null,
      panelTop: panelBox ? Math.round(panelBox.top) : null,
      panelBottom: panelBox ? Math.round(panelBox.bottom) : null,
      panelOutOfView: panelBox ? (panelBox.top < -1 || panelBox.bottom > vh + 1) : null,
      rowCount: rows.length,
      minFont: sizes.length ? Math.min(...sizes) : null,
      rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null,
      coveredRows: covered,
      btnH: btn ? Math.round(btn.getBoundingClientRect().height) : null,
    };
  })()`);
  report.push({ viewport: vp.name, ...metrics });
  console.log(vp.name, JSON.stringify(metrics));
}

// 子页面回归：标题页各功能页在同一个窄屏下是否溢出（共用 .screen-mode 网格）
const SUB_PAGES = ['音乐回忆室', '幻想乡图鉴', '排行榜', '录像回顾', '操作说明'];
// 子页面在两个极端视口各跑一遍
const SUB_VPS = process.env.SUB_VPS
  ? JSON.parse(process.env.SUB_VPS)
  : [{ name: '360x640', w: 360, h: 640, dpr: 2, mobile: true },
     { name: '1440x900', w: 1440, h: 900, dpr: 1, mobile: false }];
for (const vp of SUB_VPS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: true,
  });
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(2600);
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!document.querySelector('.overlay.title-mode.intro')")) break;
    await sleep(250);
  }
  for (const label of SUB_PAGES) {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('#buttons .btn, #overlay .btn')]
        .find((el) => el.textContent.includes(${JSON.stringify(label)}));
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (!ok) { console.log('skip', label); continue; }
    await sleep(1400);
    const tag = `${vp.name}-sub-${SUB_PAGES.indexOf(label) + 1}`;
    await shot(tag);
    const m = await evaluate(`(() => {
      const de = document.documentElement;
      const ov = [...document.querySelectorAll('.overlay')].find((o) => getComputedStyle(o).display !== 'none');
      const panel = ov && ov.querySelector('.panel');
      const pb = panel && panel.getBoundingClientRect();
      return { label: ${JSON.stringify(label)}, scrollW: de.scrollWidth, innerW: innerWidth,
        overflowX: de.scrollWidth - innerWidth, pos: ov ? getComputedStyle(ov).position : null,
        panelW: pb ? Math.round(pb.width) : null, panelH: pb ? Math.round(pb.height) : null,
        panelBottom: pb ? Math.round(pb.bottom) : null, canScroll: panel ? panel.scrollHeight > panel.clientHeight + 2 : null };
    })()`);
    report.push({ viewport: tag, ...m });
    console.log(tag, JSON.stringify(m));
    // 真实交互里退出一页是 Esc；只用 showTitle() 会让上一页留在 is-in 状态，
    // 截图便成了两页相叠的假象
    await evaluate(`(() => {
      for (const t of [document, window]) {
        t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      }
    })()`);
    await sleep(500);
    await evaluate('window.__game?.showTitle?.()');
    await sleep(700);
  }
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nshots ->', OUT);
ws.close();
proc.kill();
process.exit(0);
