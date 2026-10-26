// 五面音乐流程探针：静音进关 → 妖梦战 pre5 → 击破后放完再用 5 秒渐出收尾 → 呼吸区静音
// → 幽幽子 stage5，同时回归一面 / EXTRA 的原有切曲逻辑。
// 用法：node tools/_stage5_music_probe.mjs（工作目录须为仓库根）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(process.cwd());
const PORT = 8155;
const CDP_PORT = 9456;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = resolve(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  const stream = createReadStream(file);
  stream.on('error', () => res.writeHead(404).end());
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
  stream.pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const profile = mkdtempSync(join(tmpdir(), 'edge-music-probe-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${CDP_PORT}`, 'about:blank'], { stdio: 'ignore' });

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (e) { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error('Edge 没有起来');
}

const page = await findTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p(d); return; }
  if (d.method === 'Runtime.exceptionThrown') {
    const x = d.params.exceptionDetails;
    pageErrors.push((x.exception?.description || x.text || '').split('\n')[0]);
  }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    pageErrors.push((d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const rr = r.result;
  if (rr?.exceptionDetails) {
    throw new Error('页面执行失败: ' + (rr.exceptionDetails.exception?.description || rr.exceptionDetails.text));
  }
  return rr?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
// headless 的 about:blank 标签页常被判为「后台页」，rAF 会被浏览器暂停，
// 游戏主循环整段停摆（音乐断言不受影响，因为都是直接调 API）。
// 先把标签页提到前台，让 rAF 真的跑起来；下面的触发用例还会手动泵帧做兜底。
await send('Page.bringToFront');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

let ready = false;
for (let i = 0; i < 100; i++) {
  if (await evaluate('!!(window.__game && window.__game.audio)')) { ready = true; break; }
  await sleep(200);
}
if (!ready) throw new Error('window.__game 未就绪');

const scenario = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 2500) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (fn()) return true;
      await sleep(50);
    }
    return false;
  };
  const g = window.__game;
  const out = [];
  const snap = (tag) => {
    const a = g.audio;
    out.push({
      tag,
      on: !!a._musicOn,
      req: !!a._musicRequested,
      name: a._songName,
      playOut: a._songPlayOut || 0,
      timer: a._musicTimer !== null,
      fade: a._fadeTimer !== null,
      gain: a._musicGain ? Number(a._musicGain.gain.value.toFixed(4)) : null,
      ctx: a.ctx ? a.ctx.state : null,
      events: a._events ? a._events.length : -1,
      state: g.state,
      gt: Number(g.t.toFixed(2)),
      vis: document.visibilityState,
      stageState: g.stage ? g.stage.state : null,
      stageT: g.stage ? Number(g.stage.t.toFixed(2)) : null,
      dlg: !!(g.dialogue && g.dialogue.active),
      bossKey: g.stage && g.stage.boss ? (g.stage.boss.key || (g.stage.boss.def && g.stage.boss.def.key) || null) : null,
      px: g.stage && g.stage.player ? Math.round(g.stage.player.x) : null,
      w: g.stage && g.stage.level ? g.stage.level.w : null,
      pending: !!g.stage?.bossPending,
      bossStarted: !!g.stage?.bossStarted,
      midDone: !!g.stage?.midbossDone,
    });
  };
  // 模拟真实玩家：标题页点击后音频解锁、音乐开着、标题曲在放
  g.char = 'reimu';
  if (!g.difficulty) g.difficulty = 'normal';
  g.audio.unlock();
  if (g.audio.ctx && g.audio.ctx.state === 'suspended') { try { await g.audio.ctx.resume(); } catch (e) {} }
  g.audio.setMusic(true);
  g.audio.playMusic('title');
  await sleep(150);
  snap('title');

  // —— 五面：静音进关（开场对白正在播，同样不能有音乐）
  g.startStage(4);
  await sleep(1500);
  snap('stage5-intro');
  g.dialogue?.stop?.();
  g.state = 'play';
  snap('stage5-start');

  // 妖梦登场
  g.stage.beginBoss('youmu', { midboss: true });
  await sleep(200);
  snap('youmu-boss');

  // 妖梦击破：道中曲放完 → 5 秒渐出
  // 探针不验战后对白：压掉它，否则 1.8s 后 _playDialogue 会让 dialogue.active=true，
  // 而主循环在对话期间会提前 return，后面所有依赖 rAF 的用例（触发链）都会停摆。
  g.stage.skipBossDialogue = true;
  g.stage._onMidbossDefeated();
  await sleep(120);
  snap('youmu-clear');

  // 把合成曲拨到本轮末尾，让 wrap 马上发生：验证「放完 → 5 秒渐出 → 静音」
  const a = g.audio;
  const evs = a._events || [];
  if (evs.length && a._songStart) {
    a._songIdx = evs.length - 1;
    a._songLoop = 0;
    a._songStart = a.ctx.currentTime - evs[evs.length - 1][0] + 0.02;
  }
  await sleep(200);
  snap('playout-fading');
  await sleep(2000);
  snap('playout-fading-mid');
  await sleep(3300); // 渐出 5 秒 + 收尾，总共约 5.5 秒
  snap('playout-end');
  await sleep(400);
  snap('playout-idle');
  // 放完之后在呼吸区开关 BGM：这一曲算「放完了」，不该从头重播
  g.audio.setMusic(false);
  g.audio.setMusic(true);
  await sleep(200);
  snap('playout-reopen');

  // 幽幽子登场：下一个 Boss 才再起播
  g.stage.beginBoss();
  await sleep(250);
  snap('yuyuko-boss');

  // —— 续命重开的三条路径（_restart 走 _createStage + resumeBoss）
  const def5 = g.stage.def;
  // 打妖梦时续命：直接回到 pre5
  g._createStage(def5, 4, false, { skipIntro: true, resumeBoss: true, bossKey: 'youmu', bossMid: true });
  await sleep(220);
  snap('resume-youmu');
  // 打幽幽子时续命：回到 stage5
  g._createStage(def5, 4, false, { skipIntro: true, resumeBoss: true, bossKey: 'yuyuko', bossMid: false });
  await sleep(220);
  snap('resume-yuyuko');
  // 呼吸区（妖梦已击破）里续命：保持静音，等幽幽子登场才起播
  g._createStage(def5, 4, false, { skipIntro: true, resumeBoss: true, midbossDone: true });
  await sleep(260);
  snap('resume-breath');
  g.stage.beginBoss();
  await sleep(250);
  snap('breath-to-yuyuko');

  // —— 回归：一面正常进关即起播
  g.startStage(0, { skipIntro: true });
  await sleep(200);
  snap('stage1-start');

  // —— 回归：EXTRA 三段式（ex_pre → ex_mid → ex_pre → extra）
  try {
    g.inExtra = true;
    g.char = 'reimu';
    g._startExtraStage({ skipIntro: true });
    await sleep(200);
    snap('extra-start');
    g.stage.beginBoss(null, { midboss: true });
    await sleep(150);
    snap('extra-mid');
    g.stage._onMidbossDefeated();
    await sleep(200);
    snap('extra-mid-clear');
    g.stage.beginBoss();
    // extra 是音频文件曲目，fetch + decode 需要一点时间，等它真正发声再取快照
    await waitFor(() => g.audio._musicOn);
    await sleep(80);
    snap('extra-boss');
  } catch (e) {
    out.push({ tag: 'extra-error', err: String((e && e.message) || e) });
  }
  // —— 真实触发链：走到触发线 → 妖梦战前对话（仍静音）→ 开战才起播
  g.dialogue?.stop?.(); // 防御：任何残留对话都会让主循环提前 return
  g.state = 'play';
  g.startStage(4, { skipIntro: true });
  await sleep(250);
  const st = g.stage;
  st.player.x = st.level.w - 5300;
  st.player.y = (st.level.gen ? st.level.gen.ground * 32 : st.level.h - 96) - 60;
  await sleep(120);
  snap('trigger-teleport');
  // 兜底：若 rAF 仍未恢复（headless 后台页），手动推进逻辑帧，
  // 让 stage.update → _checkPlatformBossTrigger → bossTrigger 这条真实链路跑起来。
  // rAF 正常时这几帧只是多跑 66ms，不影响断言。
  for (let i = 0; i < 4; i++) {
    try { g.update(1 / 60); } catch (e) { out.push({ tag: 'pump-error', err: String((e && e.message) || e) }); break; }
  }
  await sleep(120);
  snap('trigger-pumped');
  await waitFor(() => g.state === 'dialogue', 4000);
  snap('trigger-dialogue');
  let guard = 0;
  while (g.state === 'dialogue' && guard++ < 250) { g.dialogue?.advance?.(); await sleep(40); }
  await waitFor(() => !!g.stage?.boss, 4000);
  await sleep(250);
  snap('trigger-boss');

  return out;
})()`;

let report;
try {
  report = await evaluate(scenario);
} finally {
  try { edge.kill(); } catch (e) { /* 忽略 */ }
  server.close();
}

const byTag = Object.fromEntries((report || []).filter((r) => r.tag && !r.err).map((r) => [r.tag, r]));
const problems = pageErrors.slice();
const check = (tag, cond, detail) => { if (!cond) problems.push(`${tag}: ${detail}`); };
const eq = (tag, field, want) => {
  const got = byTag[tag]?.[field];
  check(tag, got === want, `${field} 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
};

eq('title', 'name', 'title');
check('title', byTag.title?.on === true, '标题曲应在放');

eq('stage5-intro', 'name', null);
eq('stage5-intro', 'on', false);
eq('stage5-intro', 'state', 'dialogue');
eq('stage5-start', 'name', null);
eq('stage5-start', 'on', false);
eq('stage5-start', 'playOut', 0);

eq('youmu-boss', 'name', 'pre5');
eq('youmu-boss', 'on', true);
eq('youmu-boss', 'playOut', 0);

eq('youmu-clear', 'name', 'pre5');
eq('youmu-clear', 'on', true);
eq('youmu-clear', 'playOut', 5); // 放完渐出：5 秒

// 渐出中：还在出声（渐出期间继续排下一轮），渐出定时器在走，音量明显下降
eq('playout-fading', 'on', true);
eq('playout-fading', 'fade', true);
eq('playout-fading', 'timer', true);
eq('playout-fading', 'playOut', 0);
eq('playout-fading-mid', 'on', true);
eq('playout-fading-mid', 'fade', true);
check(
  'fade-gain',
  byTag['playout-fading'].gain > 0.5 && byTag['playout-fading-mid'].gain < byTag['playout-fading'].gain * 0.8,
  `渐出音量应持续下降：start=${byTag['playout-fading']?.gain} mid=${byTag['playout-fading-mid']?.gain}`
);

// 渐出结束：真正停掉、定时器清空、总线增益恢复到 0.9 × 音量(0.8) = 0.72
eq('playout-end', 'on', false);
eq('playout-end', 'fade', false);
eq('playout-end', 'timer', false);
check(
  'fade-gain-restored',
  Math.abs((byTag['playout-end']?.gain ?? 0) - 0.72) < 0.01,
  `渐出结束应恢复总线增益 0.72，实际 ${byTag['playout-end']?.gain}`
);
eq('playout-idle', 'on', false);
eq('playout-idle', 'timer', false);
// 渐出结束后曲目已清空：开关 BGM 不会把这首歌从头重播
eq('playout-end', 'name', null);
eq('playout-reopen', 'on', false);
eq('playout-reopen', 'name', null);

eq('yuyuko-boss', 'name', 'stage5');
eq('yuyuko-boss', 'on', true);

eq('resume-youmu', 'name', 'pre5');
eq('resume-youmu', 'on', true);
eq('resume-yuyuko', 'name', 'stage5');
eq('resume-yuyuko', 'on', true);
eq('resume-breath', 'name', null);
eq('resume-breath', 'on', false);
eq('breath-to-yuyuko', 'name', 'stage5');
eq('breath-to-yuyuko', 'on', true);

eq('stage1-start', 'name', 'pre1');
eq('stage1-start', 'on', true);

eq('extra-start', 'name', 'ex_pre');
eq('extra-start', 'on', true);
eq('extra-mid', 'name', 'ex_mid');
eq('extra-mid', 'on', true);
eq('extra-mid-clear', 'name', 'ex_pre');
eq('extra-mid-clear', 'on', true);
eq('extra-boss', 'name', 'extra');
eq('extra-boss', 'on', true);

eq('trigger-dialogue', 'name', null);
eq('trigger-dialogue', 'on', false);
eq('trigger-dialogue', 'state', 'dialogue');
eq('trigger-dialogue', 'dlg', true);
eq('trigger-boss', 'name', 'pre5');
eq('trigger-boss', 'on', true);
eq('trigger-boss', 'bossKey', 'youmu');

console.log(JSON.stringify(report, null, 1));
if (byTag['extra-error']) console.log('EXTRA 场景异常:', byTag['extra-error'].err);
if (problems.length) {
  console.log('\n❌ 失败 ' + problems.length + ' 项:');
  for (const p of problems) console.log(' - ' + p);
  process.exitCode = 1;
} else {
  console.log('\n✅ 五面音乐流程与回归全部通过');
}
