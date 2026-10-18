// BGM 状态切换实测：标题 → 关卡 → 失败 → 结局 → 标题 → 关/开音乐
// 用法: node tools/_qa_bgm.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9371);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-bgm-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}

let ws, id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

const probe = () => ev(`(() => {
  const g = window.__game, a = g && g.audio;
  if (!a) return null;
  return {
    state: g.state, song: a.currentSong, musicOn: a._musicOn,
    ctx: a.ctx && a.ctx.state, events: a._events ? a._events.length : 0,
    duration: a._song && a._song.duration, voices: a._musicVoices.size,
    cnt: window.__cnt ? { ...window.__cnt } : null,
  };
})()`);

const problems = [];
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) problems.push(label);
};

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qabgm=${Date.now()}` });
  for (let i = 0; i < 60 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(600);

  // 解锁音频 + 计数钩子
  await ev(`(() => {
    const a = window.__game.audio;
    a.unlock();
    window.__cnt = { note: 0, drum: 0 };
    const o1 = a._musicNote.bind(a), o2 = a._scheduleDrum.bind(a);
    a._musicNote = (...x) => { window.__cnt.note++; return o1(...x); };
    a._scheduleDrum = (...x) => { window.__cnt.drum++; return o2(...x); };
    return a.ctx && a.ctx.state;
  })()`);
  await sleep(700);

  console.log('[1] 标题画面');
  let s = await probe();
  console.log('   ', JSON.stringify(s));
  check('标题曲已加载', s.song === 'title' && s.events > 0, `song=${s.song} ev=${s.events}`);
  check('音频上下文运行', s.ctx === 'running', `ctx=${s.ctx}`);
  check('标题曲正在排期发声', s.musicOn && s.cnt.note + s.cnt.drum > 0, `note+drum=${s.cnt.note + s.cnt.drum}`);

  console.log('[2] 进入第 1 关');
  await ev('__game.startStage(0)');
  await sleep(900);
  s = await probe();
  console.log('   ', JSON.stringify(s));
  check('切到 stage1 曲', s.song === 'stage1', `song=${s.song}`);
  check('stage1 有曲目数据', s.events > 0, `ev=${s.events}`);
  check('关卡内仍在发声', s.musicOn && s.cnt.note > 0, `note=${s.cnt.note}`);

  console.log('[3] Game Over');
  await ev('__game._onGameOver()');
  await sleep(700);
  s = await probe();
  console.log('   ', JSON.stringify(s));
  check('切到 gameover 曲', s.song === 'gameover', `song=${s.song}`);
  check('gameover 曲正在发声', s.events > 0, `ev=${s.events}`);

  console.log('[4] 结局');
  await ev("__game._playEnding('main')");
  await sleep(900);
  s = await probe();
  console.log('   ', JSON.stringify(s));
  check('切到 ending 曲', s.song === 'ending', `song=${s.song}`);
  check('ending 曲正在发声', s.events > 0, `ev=${s.events}`);

  console.log('[5] 回标题 + 音乐开关');
  await ev('__game.showTitle()');
  await sleep(500);
  s = await probe();
  check('回到 title 曲', s.song === 'title', `song=${s.song}`);
  await ev('__game.musicOn = false; __game.audio.setMusic(false); "ok"');
  await sleep(300);
  s = await probe();
  check('关闭音乐后停声', s.musicOn === false && s.voices === 0, `on=${s.musicOn} voices=${s.voices}`);
  await ev('__game.musicOn = true; __game.audio.setMusic(true); "ok"');
  await sleep(600);
  s = await probe();
  check('重新开启后恢复标题曲', s.musicOn === true && s.voices > 0, `on=${s.musicOn} voices=${s.voices}`);

  console.log('[6] JS 异常');
  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(problems.length ? `\n${problems.length} 项失败: ${problems.join('; ')}` : '\nBGM 全流程通过 ✓');
  process.exitCode = problems.length ? 1 : 0;
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
