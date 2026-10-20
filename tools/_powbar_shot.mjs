// POWER 条量尺+截图：node tools/_powbar_shot.mjs <outPrefix> [powerMode=full|lv2]
// 固定 1280x720，起一面道中，把 POWER 设成指定值，量 .hud-mid / .pbar 尺寸并截 HUD 区域。
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const prefix = process.argv[2] ?? '_powbar';
const mode = process.argv[3] ?? 'full';
const W = Number(process.env.SHOT_W ?? 1280), H = Number(process.env.SHOT_H ?? 720);
const URL0 = 'http://127.0.0.1:8137';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-pow-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async (f, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot', f); };

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}/index.html?pow=${Date.now()}` });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game')) break; await sleep(120); }
  await sleep(900);

  const midW = process.argv[4] ? Number(process.argv[4]) : 0;
  if (midW) {
    const w = await ev(`(() => { const e = document.querySelector('.hud-mid'); e.style.width = '${midW}px'; return getComputedStyle(e).width; })()`);
    console.log('OVERRIDE mid width ->', w);
  }

  const set = await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play'; g.stage.state = 'play';
    const s = g.stage, p = s.player;
    p.lives = 2; p.maxLives = 2;
    // POWER_MAX=16 可复现「旧上限」，用来做前后对比
    ${process.env.POWER_MAX ? `p.maxPower = ${Number(process.env.POWER_MAX)};` : ''}
    p.power = ${JSON.stringify(mode)} === 'full' ? p.maxPower : Math.round(p.maxPower / 2);
    window.__g = { s, p };
    return { power: p.power, maxPower: p.maxPower };
  })()`);
  console.log('SET', JSON.stringify(set));
  await sleep(700);
  const extraCss = process.env.EXTRA_CSS_FILE ? readFileSync(process.env.EXTRA_CSS_FILE, 'utf8') : process.env.EXTRA_CSS;
  if (extraCss) {
    await ev(`(() => { let s = document.getElementById('__probe'); if (!s) { s = document.createElement('style'); s.id = '__probe'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(extraCss)}; return 'ok'; })()`);
    console.log('EXTRA_CSS injected', extraCss.length, 'chars');
    await sleep(300);
  }

  const m = await ev(`(() => {
    const q = (sel) => document.querySelector(sel);
    const r = (sel) => { const e = q(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1), x: +b.left.toFixed(1), y: +b.top.toFixed(1) }; };
    const hud = q('#hud');
    return JSON.stringify({
      s: getComputedStyle(document.documentElement).getPropertyValue('--s').trim(),
      hud: r('#hud'), mid: r('.hud-mid'), body: r('.power-body'), bar: r('.pbar'),
      fillW: q('#powerFill')?.style.width, num: q('#powerNum')?.textContent,
      pips: q('#powerPips')?.children.length,
      pipsBox: r('#powerPips'),
      pn: r('.pn'), pdim: r('.pdim'),
      cast: r('.pcast'), castLeft: q('.pcast')?.style.left,
      full: q('.pbar')?.classList.contains('full'),
      ext: r('#extendBox'),
      hudStyleW: hud ? getComputedStyle(hud).width : null,
      lowW: r('.hud-left'), rightW: r('.hud-right'), stageInfo: r('.stage-info'),
      settings: r('#settingsBtn'), rowW: r('.hud-row'),
      docW: document.documentElement.scrollWidth,
      overflow: (() => { const row = q('.hud-row'); const hud = q('#hud'); return row && hud ? { row: row.getBoundingClientRect().width, hudPad: getComputedStyle(hud).paddingLeft } : null; })(),
    });
  })()`);
  console.log('MEASURE', m);

  await shot(`${prefix}_hud.png`, { x: 0, y: 0, width: W, height: 120 });
  await shot(`${prefix}_full.png`);
  console.log('ERRORS', JSON.stringify(errors));
} finally { try { ws.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
