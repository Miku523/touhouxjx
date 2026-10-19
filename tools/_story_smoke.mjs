// 临时：验证双线剧情 / 续命 / 结局分流 / 道中对话
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const profile = mkdtempSync(join(tmpdir(), 'edge-story-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
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
    logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push('ERR ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('ENTRY ' + msg.params.entry.text + ' @' + (msg.params.entry.url || ''));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?storysmoke=${Date.now()}` });
await sleep(3500);

const pageFn = async function () {
  const out = { steps: {} };
  const g = window.__game;
  if (!g) return { error: 'window.__game missing' };
  const step = (name, fn) => {
    try { out.steps[name] = { ok: true, value: fn() }; }
    catch (e) { out.steps[name] = { ok: false, error: String(e && e.stack || e) }; }
  };
  const stopEd = () => { try { g.ending?.stop?.(); } catch (e) {} };
  const route = (char, diff, inExtra, cont) => {
    stopEd();
    g.inExtra = inExtra; g.char = char; g.difficulty = diff; g.continues = cont;
    g.state = 'play';
    g._onAllCleared();
    return `${g.ending?.spec?.key || '?'}:${g.ending?.spec?.noLabel || '?'}`;
  };

  const resetUnlock = () => { g.unlockedExtra = false; g.extraChar = null; };

  resetUnlock();
  step('routes', () => ({
    reimuE: `${route('reimu', 'E', false, 0)} unlock=${g.unlockedExtra}`,
    reimuN_cont: `${route('reimu', 'N', false, 1)} unlock=${g.unlockedExtra}`,
    marisaH_cont: `${route('marisa', 'H', false, 2)} unlock=${g.unlockedExtra}`,
    reimuN_clean: `${route('reimu', 'N', false, 0)} unlock=${g.unlockedExtra}:${g.extraChar}`,
    marisaL_clean: `${route('marisa', 'L', false, 0)} unlock=${g.unlockedExtra}:${g.extraChar}`,
    reimuN_cont_after: `${route('reimu', 'N', false, 1)} unlock=${g.unlockedExtra}:${g.extraChar}`,
    reimuEX: route('reimu', 'EX', true, 0),
    marisaEX: route('marisa', 'EX', true, 0),
  }));
  stopEd();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const drain = () => {
    for (let i = 0; i < 1200 && g.dialogue.active; i++) g.dialogue.advance();
    return { active: g.dialogue.active, state: g.state };
  };

  // 真实流程：不跳过开场，等开场对白加载并播完后，再把玩家推到 27% / 56%
  g.inExtra = false; g.char = 'reimu'; g.difficulty = 'N'; g.levelIndex = 0;
  g.startStage(0);
  await sleep(1800);
  step('introPlatform', () => ({ state: g.state, active: g.dialogue.active, lines: g.dialogue.script.length, skip: g._skipBeats }));
  step('introPlatformDrain', () => drain());

  step('midPlatformFirst', () => {
    const st = g.stage;
    st.player.x = st.level.w * 0.27;
    g.state = 'play';
    g._maybeMidDialogue();
    return { state: g.state, shown: g._midShown.slice() };
  });
  await sleep(1600);
  step('midPlatformFirstActive', () => ({ state: g.state, active: g.dialogue.active, lines: g.dialogue.script.length }));
  step('midPlatformFirstDrain', () => drain());
  step('midPlatformSecond', () => {
    const st = g.stage;
    st.player.x = st.level.w * 0.56;
    g.state = 'play';
    g._maybeMidDialogue();
    return { state: g.state, shown: g._midShown.slice() };
  });
  await sleep(1600);
  step('midPlatformSecondActive', () => ({ state: g.state, active: g.dialogue.active, lines: g.dialogue.script.length }));
  step('midPlatformSecondDrain', () => drain());

  // STG 关：4 面
  g.inExtra = false; g.char = 'marisa'; g.difficulty = 'N'; g.levelIndex = 3;
  g.startStage(3);
  await sleep(1800);
  step('midStg', () => {
    const st = g.stage;
    st.stg.scroll = st.stg.bossTriggerScroll * 0.3;
    g.state = 'play';
    g._maybeMidDialogue();
    return { state: g.state };
  });
  await sleep(1600);
  step('midStgActive', () => ({ state: g.state, active: g.dialogue.active, lines: g.dialogue.script.length, progress: g._storyProgress() }));
  step('midStgDrain', () => drain());

  step('continueCount', () => {
    g.inExtra = false; g.char = 'reimu'; g.difficulty = 'N'; g.levelIndex = 0;
    g.startStage(0, { skipIntro: true });
    const before = g.continues;
    g.state = 'gameover';
    g._retryStage();
    return { before, after: g.continues, state: g.state };
  });

  return out;
};

const expr = `(${pageFn.toString()})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result.value, null, 2));
console.log('LOGS:\n' + logs.join('\n'));
ws.close();
proc.kill();
