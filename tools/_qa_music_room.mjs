// 音乐回忆室 QA：打开标题 → 进入房间 → 未遭遇曲目警告 → 确认播放 → 取消 → 返回标题
// 用法: node tools/_qa_music_room.mjs [--url http://127.0.0.1:8140/index.html]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const URL = argOf('--url', 'http://127.0.0.1:8140/index.html');
const W = 1280;
const H = 720;
const PORT = 9471;
const OUT = argOf('--out', 'tools/_tmp_music_room');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'edge-music-'));

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const errors = [];
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    logs.push(`[${msg.params.type}] ${text}`);
    if (msg.params.type === 'error') errors.push(text);
  }
};

const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT}_${name}.png`;
  writeFileSync(path, Buffer.from(r.data, 'base64'));
  return path;
};

const KEYS = {
  Enter: { code: 'Enter', key: 'Enter', vk: 13 },
  Escape: { code: 'Escape', key: 'Escape', vk: 27 },
  ArrowDown: { code: 'ArrowDown', key: 'ArrowDown', vk: 40 },
  ArrowUp: { code: 'ArrowUp', key: 'ArrowUp', vk: 38 },
  ArrowLeft: { code: 'ArrowLeft', key: 'ArrowLeft', vk: 37 },
  ArrowRight: { code: 'ArrowRight', key: 'ArrowRight', vk: 39 },
  KeyM: { code: 'KeyM', key: 'm', vk: 77 },
  KeyT: { code: 'KeyT', key: 't', vk: 84 },
};

async function click(x, y, wait = 260) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(wait);
}

async function press(name, wait = 220) {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', code: k.code, key: k.key, windowsVirtualKeyCode: k.vk,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', code: k.code, key: k.key, windowsVirtualKeyCode: k.vk,
  });
  await sleep(wait);
}

const result = {};
const step = async (name, fn) => {
  try {
    result[name] = await fn();
    console.log(`OK   ${name}`, result[name] === undefined ? '' : JSON.stringify(result[name]));
  } catch (e) {
    result[name] = { error: String(e?.message || e) };
    console.log(`FAIL ${name}:`, e?.message || e);
  }
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const waitGame = async (tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try {
      if (await evaluate("!!window.__game")) return true;
    } catch {}
    await sleep(200);
  }
  return false;
};

await step('load', async () => {
  await send('Page.navigate', { url: URL });
  if (!await waitGame()) throw new Error('game did not boot');
  // 清掉旧档，确保「未遭遇」状态干净（标题曲会在标题页自动记为已听）
  await evaluate("localStorage.removeItem('hks.music.v1'); localStorage.removeItem('hks.progress.v1');");
  await send('Page.reload');
  if (!await waitGame()) throw new Error('game did not boot after reload');
  // 真实玩家的第一次点击（受信任事件）→ 解锁 AudioContext → 标题曲真正开播
  await click(640, 420, 700);
  await sleep(1200);
  return evaluate("({ black: !!document.querySelector('#boot.done'), room: !!document.querySelector('#musicRoom'), hasGame: !!window.__game, heard: [...window.__game._heardSongs], ctx: !!window.__game.audio.ctx, musicOn: !!window.__game.audio.musicOn, song: window.__game.audio.currentSong })");
});

await step('title_menu', async () => {
  await shot('00_title');
  return evaluate(`[...document.querySelectorAll('#buttons .btn')].map((b) => b.textContent.trim())`);
});

await step('open_room', async () => {
  const ok = await evaluate(`(() => {
    const b = [...document.querySelectorAll('#buttons .btn')]
      .find((el) => el.textContent.includes('音乐回忆室'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(750);
  const state = await evaluate(`(() => {
    const g = window.__game;
    const room = g && g.musicRoom;
    return {
      visible: !!room?.visible,
      index: room?.index,
      count: document.querySelector('.mr-count-num')?.textContent,
      all: document.querySelector('.mr-count-all')?.textContent,
      rows: [...document.querySelectorAll('.mr-row')].map((r) => ({
        title: r.querySelector('.mr-row-title')?.textContent,
        locked: r.classList.contains('is-locked'),
      })),
      heard: [...(g?._heardSongs || [])],
      song: g?.audio?.currentSong,
      musicOn: g?.audio?.musicOn,
      titleHidden: document.querySelector('#overlay')?.classList.contains('hidden'),
    };
  })()`);
  return { clicked: ok, ...state };
});

await step('locked_screen', async () => {
  await press('ArrowDown');
  await sleep(400);
  await shot('01_locked');
  return evaluate(`(() => {
    const room = window.__game.musicRoom;
    return {
      index: room.index,
      title: document.querySelector('.mr-title')?.textContent,
      locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
      dur: document.querySelector('.mr-dur')?.textContent,
      warnOpen: !document.querySelector('.mr-warn')?.classList.contains('hidden'),
      playingRows: [...document.querySelectorAll('.mr-row.is-playing .mr-row-title')].map((e) => e.textContent),
    };
  })()`);
});

await step('warn_dialog', async () => {
  await press('Enter');
  await sleep(350);
  await shot('02_warn');
  return evaluate(`(() => {
    const w = document.querySelector('.mr-warn');
    return {
      open: !w?.classList.contains('hidden'),
      title: w?.querySelector('.mr-warn-title')?.textContent,
      text: w?.querySelector('.mr-warn-text')?.textContent,
      selPlay: w?.querySelector('[data-act="play"]')?.classList.contains('sel'),
    };
  })()`);
});

await step('warn_cancel', async () => {
  await press('ArrowRight');
  await press('Enter');
  await sleep(350);
  await shot('03_cancel');
  return evaluate(`(() => {
    const room = window.__game.musicRoom;
    return {
      warnOpen: !document.querySelector('.mr-warn')?.classList.contains('hidden'),
      index: room.index,
      locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
      song: window.__game.audio.currentSong,
      heard: [...window.__game._heardSongs],
    };
  })()`);
});

await step('play_unknown', async () => {
  await press('Enter');
  await sleep(250);
  await press('Enter');
  await sleep(1400);
  await shot('04_playing_unknown');
  return evaluate(`(() => {
    const g = window.__game;
    const room = g.musicRoom;
    const p = g.audio.musicProgress;
    return {
      index: room.index,
      title: document.querySelector('.mr-title')?.textContent,
      locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
      song: g.audio.currentSong,
      musicOn: g.audio.musicOn,
      progress: p && { elapsed: Math.round(p.elapsed), duration: Math.round(p.duration) },
      barWidth: document.querySelector('.mr-bar-fill')?.style.width,
      elapsedLabel: document.querySelector('.mr-elapsed')?.textContent,
      playingCount: document.querySelectorAll('.mr-row.is-playing').length,
      heardNow: [...g._heardSongs],
      heardCount: document.querySelector('.mr-count-num')?.textContent,
    };
  })()`);
});

await step('toggle_stop', async () => {
  await press('Enter');
  await sleep(400);
  await shot('05_stopped');
  const st = await evaluate(`(() => ({
    musicOn: window.__game.audio.musicOn,
    state: document.querySelector('.mr-state')?.textContent,
    hasPlayingClass: document.querySelector('#musicRoom')?.classList.contains('is-playing'),
  }))()`);
  // 恢复播放，方便后面检查切曲
  await press('Enter');
  await sleep(600);
  return st;
});

await step('next_track', async () => {
  await press('ArrowRight');
  await sleep(300);
  await press('Enter');
  await sleep(300);
  await press('Enter');
  await sleep(900);
  await shot('06_next_track');
  return evaluate(`(() => ({
    index: window.__game.musicRoom.index,
    title: document.querySelector('.mr-title')?.textContent,
    song: window.__game.audio.currentSong,
    locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
  }))()`);
});

await step('preview_30s', async () => {
  // T = 30 秒试听：倒计时要走、进度条要标出收针点、到点自动停
  await press('KeyT');
  await sleep(900);
  const start = await evaluate(`(() => {
    const r = window.__game.musicRoom;
    const tag = document.querySelector('.mr-preview-tag');
    return {
      preview: r._preview && { left: Math.round(r._preview.left * 10) / 10, key: r._preview.key },
      state: document.querySelector('.mr-state')?.textContent,
      tag: tag?.textContent,
      tagHidden: tag?.classList.contains('hidden'),
      cutHidden: document.querySelector('.mr-cut')?.classList.contains('hidden'),
      cutLeft: document.querySelector('.mr-cut')?.style.left,
      song: window.__game.audio.currentSong,
      musicOn: window.__game.audio.musicOn,
    };
  })()`);
  await shot('06a_preview');
  // 把倒计时拨到末尾，验证「到点自动抬针」而不用真等 30 秒
  await evaluate(`(() => { window.__game.musicRoom._preview.left = 0.05; return null; })()`);
  await sleep(600);
  const end = await evaluate(`(() => ({
    musicOn: window.__game.audio.musicOn,
    state: document.querySelector('.mr-state')?.textContent,
    cutHidden: document.querySelector('.mr-cut')?.classList.contains('hidden'),
    preview: window.__game.musicRoom._preview,
  }))()`);
  await shot('06b_preview_end');
  return { start, end };
});

await step('preview_locked_warn', async () => {
  // 未遭遇的曲目按 T：确认框按钮应写「试听 30 秒」，取消后不该开播
  await press('ArrowRight');
  await sleep(250);
  const picked = await evaluate(`(() => ({
    i: window.__game.musicRoom.index,
    locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
  }))()`);
  await press('KeyT');
  await sleep(320);
  const warn = await evaluate(`(() => ({
    open: !document.querySelector('.mr-warn')?.classList.contains('hidden'),
    label: document.querySelector('.mr-warn-btn[data-act="play"]')?.textContent,
    song: window.__game.audio.currentSong,
  }))()`);
  await shot('06c_preview_warn');
  await press('Escape');
  await sleep(250);
  return { picked, warn };
});

await step('key_leak', async () => {
  // 房间打开时按标题快捷键（S 设置 / Q 退出）不应该漏到后面的标题菜单
  await press('KeyM');
  await press('KeyM');
  const keys = await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', key: 's' }));
    return null;
  })()`);
  await sleep(250);
  return evaluate(`({
    roomVisible: !!window.__game.musicRoom.visible,
    overlayHidden: document.querySelector('#overlay')?.classList.contains('hidden'),
    page: window.__game._page,
    state: window.__game.state,
  })`);
});

await step('back_to_title', async () => {
  await press('Escape');
  await sleep(700);
  await shot('07_back_title');
  return evaluate(`(() => ({
    visible: !!window.__game.musicRoom.visible,
    overlayHidden: document.querySelector('#overlay')?.classList.contains('hidden'),
    song: window.__game.audio.currentSong,
    musicOn: window.__game.audio.musicOn,
    title: document.querySelector('#title')?.textContent,
  }))()`);
});

/* ---------------- 持久化：刷新后「听过」仍在 ---------------- */
await step('reload_persist', async () => {
  await send('Page.reload');
  if (!await waitGame()) throw new Error('game did not boot');
  await sleep(2600);
  await evaluate(`[...document.querySelectorAll('#buttons .btn')]
    .find((el) => el.textContent.includes('音乐回忆室')).click()`);
  await sleep(700);
  await shot('08_reload');
  return evaluate(`(() => {
    const g = window.__game;
    return {
      heard: [...g._heardSongs].sort(),
      count: document.querySelector('.mr-count-num')?.textContent,
      unlocked: [...document.querySelectorAll('.mr-row')].map((r) => !r.classList.contains('is-locked')),
      firstTitles: [...document.querySelectorAll('.mr-row-title')].slice(0, 3).map((e) => e.textContent),
    };
  })()`);
});

/* ---------------- 鼠标：点一下选中，再点一次（未遭遇）弹确认 ---------------- */
await step('mouse_click', async () => {
  await evaluate("document.querySelectorAll('.mr-row')[5].click()");
  await sleep(200);
  const first = await evaluate(`(() => {
    const r = window.__game.musicRoom;
    return { index: r.index, title: r.d.title.textContent,
      domTitle: document.querySelector('.mr-title')?.textContent,
      key: r.tracks[r.index]?.key, heardTarget: r.isHeard(r.tracks[r.index]?.key),
      warn: r._warn, cls: document.querySelector('.mr-title')?.className };
  })()`);
  await evaluate("document.querySelectorAll('.mr-row')[5].click()");
  await sleep(250);
  const warn = await evaluate(`({ open: !document.querySelector('.mr-warn')?.classList.contains('hidden') })`);
  await shot('09_mouse_warn');
  await evaluate("document.querySelector('.mr-warn [data-act=\"cancel\"]').click()");
  await sleep(250);
  const after = await evaluate(`({
    warnOpen: !document.querySelector('.mr-warn')?.classList.contains('hidden'),
    song: window.__game.audio.currentSong,
    locked: document.querySelector('.mr-title')?.classList.contains('is-locked'),
  })`);
  return { first, ...warn, after };
});

/* ---------------- 老存档迁移：EXTRA 已解锁 → 补记 1~6 面 ---------------- */
await step('old_save_migration', async () => {
  await press('Escape');
  await sleep(400);
  await evaluate(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' }));
    localStorage.removeItem('hks.music.v1');`);
  await send('Page.reload');
  if (!await waitGame()) throw new Error('game did not boot');
  await sleep(2600);
  await evaluate(`[...document.querySelectorAll('#buttons .btn')]
    .find((el) => el.textContent.includes('音乐回忆室')).click()`);
  await sleep(700);
  await shot('10_migration');
  return evaluate(`(() => {
    const g = window.__game;
    return {
      heard: [...g._heardSongs].sort(),
      count: document.querySelector('.mr-count-num')?.textContent,
      unlocked: [...document.querySelectorAll('.mr-row')].map((r) => !r.classList.contains('is-locked')),
    };
  })()`);
});

result.__errors = errors;
result.__logs = logs.slice(-30);

console.log('\n==== RESULT ====');
console.log(JSON.stringify(result, null, 2));

ws.close();
proc.kill();
await sleep(300);
process.exit(0);
