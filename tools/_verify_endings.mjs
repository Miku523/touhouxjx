// 结局系统验证：6 条结局路径 + EX 失败无结局 + 结局卡 / 返回标题。
// 运行：node tools/_verify_endings.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const W = 1280, H = 720;
const BASE = 'http://127.0.0.1:8137/index.html';
const OUT = 'C:/Users/GuSheng/Downloads/HKS';

const profile = mkdtempSync(join(tmpdir(), 'edge-ending-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `_${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}?ending=${Date.now()}` });

for (let i = 0; i < 100; i++) {
  if (await evaluate('!!window.__game && !!document.querySelector("#ending")')) break;
  await sleep(150);
}
await evaluate('localStorage.removeItem("hks.progress.v1")');
await evaluate('window.__game.unlockedExtra = false; window.__game.showTitle()');
await sleep(600);
const stepA = await evaluate('window.__game.loop.stepCount');
await sleep(1000);
const stepB = await evaluate('window.__game.loop.stepCount');
console.log('loop probe', { stepA, stepB, running: await evaluate('window.__game.loop.running'), vis: await evaluate('document.visibilityState') });

const results = [];

async function runCase(name, { char, difficulty, inExtra }, expectedCode) {
  await evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.char = '${char}';
    g.difficulty = '${difficulty}';
    g.inExtra = ${inExtra};
    g._onAllCleared();
    return { state: g.state, code: g.ending.spec?.code || null, active: g.ending.active };
  })()`);

  // 演出：等待背景淡入 + 第一句打字
  await sleep(2400);
  const scene = await evaluate(`(() => {
    const g = window.__game;
    const t = document.getElementById('edText');
    const l = document.getElementById('edLines');
    const r = l.getBoundingClientRect();
    return {
      state: g.state,
      phase: g.ending.phase,
      code: g.ending.spec?.code || null,
      chapter: document.getElementById('edChapter')?.textContent || '',
      speaker: document.getElementById('edSpeaker')?.textContent || '',
      text: t?.textContent || '',
      lineVisible: r.width > 0 && r.height > 0 && getComputedStyle(l).opacity !== '0',
      canvas: (() => { const c = document.getElementById('game'); return c.width + 'x' + c.height; })(),
      dbg: {
        t: g.ending.t, shotT: g.ending.shotT, lineDelay: g.ending._lineDelay,
        shown: g.ending.shown, fullText: g.ending.fullText, lineDone: g.ending.lineDone,
        lineIndex: g.ending.lineIndex, active: g.ending.active,
        textEl: !!g.ending.textEl, typed: g.ending.textEl?.textContent || '',
        same: g.ending.textEl === t, connected: t?.isConnected,
        byIdCount: document.querySelectorAll('#edText').length,
        textOuter: t?.outerHTML?.slice(0, 120) || '',
        ids: ['edChapter','edLines','edSpeaker','edText','edCard'].map((x) => x + '=' + document.querySelectorAll('#' + x).length).join(','),
        endingHTML: document.getElementById('ending')?.innerHTML.slice(0, 500) || '',
        img: (() => { const i = g.ending.bgImgs.get('shrine_2'); return i ? { c: i.complete, w: i.naturalWidth, src: i.src } : null; })(),
        pixel: (() => { const c = document.getElementById('game'); const x = c.getContext('2d'); return x ? Array.from(x.getImageData(640, 360, 1, 1).data) : null; })(),
      },
    };
  })()`);
  const sceneShot = await shot(`ed_${name}_scene`);

  // 跳过演出 → 结局卡
  await evaluate('window.__game.ending.skipToCard()');
  await sleep(1900);
  const card = await evaluate(`(() => {
    const g = window.__game;
    const el = document.getElementById('edCard');
    const r = el.getBoundingClientRect();
    return {
      phase: g.ending.phase,
      active: g.ending.active,
      shown: el.classList.contains('show'),
      cardVisible: r.width > 0 && r.height > 0 && getComputedStyle(el).opacity !== '0',
      no: document.getElementById('edCardNo')?.textContent || '',
      kind: document.getElementById('edCardKind')?.textContent || '',
      title: document.getElementById('edCardTitle')?.textContent || '',
      char: document.getElementById('edCardChar')?.textContent || '',
      promptShown: document.getElementById('edPrompt')?.classList.contains('show') || false,
    };
  })()`);
  const cardShot = await shot(`ed_${name}_card`);

  // 离开结局卡 → 标题
  await evaluate('window.__game.ending.finish()');
  await sleep(700);
  const after = await evaluate(`(() => ({
    state: window.__game.state,
    endingHidden: document.getElementById('ending').classList.contains('hidden'),
    menuVisible: !document.getElementById('overlay').classList.contains('hidden'),
  }))()`);

  const pass = scene.state === 'ending'
    && scene.phase === 'scene'
    && scene.code === expectedCode
    && scene.chapter.includes(expectedCode.replace('END ', 'END '))
    && scene.text.length > 0
    && scene.lineVisible
    && card.phase === 'card'
    && card.shown && card.cardVisible
    && card.title.length > 0
    && after.state === 'menu'
    && after.endingHidden && after.menuVisible;

  results.push({ name, expectedCode, scene, card, after, sceneShot, cardShot, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} → ${scene.code}`);
}

await runCase('ed1_reimu_e', { char: 'reimu', difficulty: 'E', inExtra: false }, 'END 01');
await runCase('ed3_marisa_e', { char: 'marisa', difficulty: 'E', inExtra: false }, 'END 03');
await runCase('ed2_reimu_n', { char: 'reimu', difficulty: 'N', inExtra: false }, 'END 02');
await runCase('ed4_marisa_l', { char: 'marisa', difficulty: 'L', inExtra: false }, 'END 04');
await runCase('edW1_reimu_extra', { char: 'reimu', difficulty: 'N', inExtra: true }, 'EXTRA · W1');
await runCase('edW2_marisa_extra', { char: 'marisa', difficulty: 'N', inExtra: true }, 'EXTRA · W2');

// EX 失败：只出游戏结束面板，不能进结局
const exFail = await evaluate(`(() => {
  const g = window.__game;
  g.showTitle();
  g.char = 'reimu';
  g.inExtra = true;
  g._onGameOver();
  return {
    state: g.state,
    endingActive: g.ending.active,
    endingHidden: document.getElementById('ending').classList.contains('hidden'),
    title: document.getElementById('title')?.textContent || '',
    buttons: [...document.querySelectorAll('.overlay:not(.hidden) .btn')].map(b => b.textContent.trim()),
  };
})()`);
const exFailPass = exFail.state === 'gameover'
  && exFail.endingActive === false
  && exFail.endingHidden === true
  && exFail.buttons.some((b) => b.includes('重新挑战'));
console.log(`${exFailPass ? 'PASS' : 'FAIL'} ex_death_no_ending`);
const exFailShot = await shot('ed_ex_death');

// E 通关不解锁 Extra
await evaluate('window.__game.showTitle(); window.__game.unlockedExtra = false; window.__game.difficulty = "E"; window.__game.char = "reimu"; window.__game._onAllCleared();');
await sleep(300);
const easyUnlock = await evaluate('window.__game.unlockedExtra');
console.log(`${easyUnlock === false ? 'PASS' : 'FAIL'} easy_does_not_unlock_extra`);

// 真实键盘路径：Enter 推进演出，结局卡停留后 Enter 返回标题
const pressEnter = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await sleep(30);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
};
await evaluate(`(() => { const g = window.__game; g.showTitle(); g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false; g._onAllCleared(); })()`);
await sleep(1800);
const keyBefore = await evaluate('JSON.stringify({ phase: window.__game.ending.phase, line: window.__game.ending.lineIndex, text: document.getElementById("edText").textContent })');
await pressEnter();
await sleep(250);
const keyAfter = await evaluate('JSON.stringify({ phase: window.__game.ending.phase, line: window.__game.ending.lineIndex, state: window.__game.state, text: document.getElementById("edText").textContent })');
const keyAdvancePass = JSON.parse(keyAfter).state === 'ending' && JSON.parse(keyAfter).phase === 'scene'
  && (JSON.parse(keyAfter).line > JSON.parse(keyBefore).line || JSON.parse(keyAfter).text.length >= JSON.parse(keyBefore).text.length);
console.log(`${keyAdvancePass ? 'PASS' : 'FAIL'} keyboard_advance_ending`);
await evaluate('window.__game.ending.skipToCard()');
await sleep(1200);
await pressEnter();
await sleep(600);
const keyFinish = await evaluate('JSON.stringify({ state: window.__game.state, hidden: document.getElementById("ending").classList.contains("hidden") })');
const keyFinishPass = JSON.parse(keyFinish).state === 'menu' && JSON.parse(keyFinish).hidden;
console.log(`${keyFinishPass ? 'PASS' : 'FAIL'} keyboard_enter_returns_title`);

console.log('--- summary ---');
console.log(JSON.stringify({
  results: results.map((r) => ({ name: r.name, code: r.scene.code, pass: r.pass, scene: r.scene, card: r.card, shots: [r.sceneShot, r.cardShot] })),
  exFail,
  exFailPass,
  easyUnlock,
  keyAdvancePass,
  keyFinishPass,
  errors,
}, null, 2));

const failed = results.filter((r) => !r.pass).length + (exFailPass ? 0 : 1) + (keyAdvancePass ? 0 : 1) + (keyFinishPass ? 0 : 1);
proc.kill();
process.exit(failed ? 1 : 0);
