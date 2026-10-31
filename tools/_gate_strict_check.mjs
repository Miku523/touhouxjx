// 1.6.65 门禁「真等」验收：三场景
//   C 快网：曲库索引 + 第 1 面两首曲目在揭幕前真的被取下（1.6.54~1.6.64 的空转回归）
//   A 404 youma_stage1.js：music 这一路记失败，但门禁仍放行、不卡死
//   B 400KB/s 节流：揭幕必须晚于 kit/曲目到货，且不再有 2.5s 软上限（reveal - startedAt > 2.6s）
import { spawn } from 'node:child_process';
import { launch, sleep, BASE } from './_pt_core.mjs';

const DEV = BASE || 'http://127.0.0.1:8138';
const PORT = 8143;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

const PROBE = `(() => {
  const g = window.__game, bg = window.__hksBootGate || null;
  const rt = performance.getEntriesByType('resource');
  const pick = (re) => rt.filter((e) => re.test(e.name)).map((e) => ({ n: e.name.split('/').pop(), end: Math.round(e.responseEnd), by: e.transferSize }));
  return JSON.stringify({
    t: Math.round(performance.now()),
    bootDone: !!(g && g._boot && g._boot.done),
    state: g ? g.state : null,
    gate: bg,
    songs: pick(/\\/engine\\/songs\\/(index|honou_pre1|youma_stage1|title_full)\\.js/),
    kit: pick(/\\/src\\/game\\/(stage|bullets|story)\\.js/),
  });
})()`;

async function fresh(T) {
  await T.nav('about:blank');
  await T.send('Network.clearBrowserCache', {}).catch(() => {});
}

async function scenarioFast(T) {
  await fresh(T);
  await T.nav(`${DEV}/index.html`);
  const ok = await T.waitFor('!!(window.__game && window.__game._boot && window.__game._boot.done)', 30000);
  check('C 快网揭幕在 30s 内', ok);
  if (!ok) return;
  await sleep(250);
  const s = JSON.parse(await T.eval(PROBE));
  const gate = s.gate || {};
  check('C 门禁三路全绿', gate.art === true && gate.kit === true && gate.music === true, { art: gate.art, kit: gate.kit, music: gate.music });
  check('C 门禁无失败项', Array.isArray(gate.failed) && gate.failed.length === 0, gate.failed);
  const names = s.songs.map((x) => x.n);
  check('C 曲库索引在首屏被取下', names.includes('index.js'), names);
  check('C 第 1 面两首曲目模块在首屏被取下', names.includes('honou_pre1.js') && names.includes('youma_stage1.js'), names);
  const revealAt = Math.round(gate.finishedAt || 0);
  check('C 曲目模块早于门禁完成', s.songs.every((x) => x.end <= revealAt + 5), s.songs);
  check('C 进关模块早于门禁完成', s.kit.every((x) => x.end <= revealAt + 5), s.kit);
  return { gate, songs: s.songs, kit: s.kit, names };
}

async function scenarioMusic404() {
  const child = spawn('python', ['tools/_gate_failserver.py', `--port=${PORT}`, '--root=.', '--404=youma_stage1.js'], {
    cwd: process.cwd(), stdio: 'ignore',
  });
  await sleep(900);
  const T = await launch({ port: 9433, width: 1280, height: 720 });
  try {
    await fresh(T);
    await T.nav(`http://127.0.0.1:${PORT}/index.html`);
    const ok = await T.waitFor('!!(window.__game && window.__game._boot && window.__game._boot.done)', 40000);
    check('A 曲目 404 时门禁仍放行（不卡死）', ok);
    if (ok) {
      await sleep(200);
      const s = JSON.parse(await T.eval(PROBE));
      const gate = s.gate || {};
      check('A music 这一路记失败', Array.isArray(gate.failed) && gate.failed.includes('music'), gate.failed);
      check('A music 未绿但其余放行', gate.music === false && gate.done === true, { music: gate.music, done: gate.done });
      check('A 标题页仍可交互', s.state === 'menu', s.state);
      const names = s.songs.map((x) => x.n);
      check('A 曲库索引照样被取下', names.includes('index.js'), names);
    }
  } finally {
    await T.close?.();
    child.kill();
  }
}

async function scenarioThrottled() {
  const T = await launch({ port: 9434, width: 1280, height: 720 });
  try {
    await fresh(T);
    await T.send('Network.enable', {});
    await T.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: 400 * 1024, uploadThroughput: 400 * 1024,
    });
    await T.nav(`${DEV}/index.html`);
    const ok = await T.waitFor('!!(window.__game && window.__game._boot && window.__game._boot.done)', 120000);
    check('B 400KB/s 下门禁仍放行', ok);
    if (ok) {
      await sleep(200);
      const s = JSON.parse(await T.eval(PROBE));
      const gate = s.gate || {};
      const span = Math.round((gate.finishedAt || 0) - (gate.startedAt || 0));
      check('B 已无 2.5s 软上限（门禁跨度 > 2.6s）', span > 2600, { span });
      check('B 门禁三路全绿', gate.art && gate.kit && gate.music, { art: gate.art, kit: gate.kit, music: gate.music });
      check('B 无 soft-timeout 记录', !(gate.failed || []).includes('soft-timeout'), gate.failed);
      const lastSong = Math.max(0, ...s.songs.map((x) => x.end));
      const lastKit = Math.max(0, ...s.kit.map((x) => x.end));
      check('B 曲目到货早于门禁完成', lastSong <= (gate.finishedAt || 0) + 5, { lastSong, finishedAt: Math.round(gate.finishedAt || 0) });
      check('B 进关模块到货早于门禁完成', lastKit <= (gate.finishedAt || 0) + 5, { lastKit });
      check('B 揭幕前未出现「未全绿」告警', (gate.failed || []).length === 0, gate.failed);
      return { span, gate };
    }
  } finally {
    await T.close?.();
  }
}

const T = await launch({ port: 9432, width: 1280, height: 720 });
let fast = null;
try {
  fast = await scenarioFast(T);
} finally {
  await T.close?.();
}
await scenarioMusic404();
const slow = await scenarioThrottled();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed`);
if (pass !== results.length) {
  console.log('FAILED:', JSON.stringify(results.filter((r) => !r.ok), null, 0));
  process.exit(1);
}
process.exit(0);
