// CPU profile 定位进关 9s 长任务热点（CDP Profiler）。
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9427;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=profile1', waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);

  await T.send('Profiler.enable');
  await T.send('Profiler.setSamplingInterval', { interval: 200 });
  await T.send('Profiler.start');
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter');
    await sleep(140);
  }
  await sleep(800);
  const { profile } = await T.send('Profiler.stop');

  // 按自耗时聚合
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map();
  const total = profile.samples.length;
  const counts = new Map();
  for (const id of profile.samples) counts.set(id, (counts.get(id) || 0) + 1);
  const interval = 0.2; // ms per sample
  for (const [id, c] of counts) {
    const n = byId.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} @ ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + c * interval);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35)
    .map(([k, ms]) => ({ key: k, ms: Math.round(ms) }));
  out.samples = total;
  out.top = top;
  out.profiledMs = Math.round(total * interval);
  out.prewarmInfo = await T.eval('window.__prewarmInfo || null');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_stage_profile.json', out);
  await T.close().catch(() => {});
}
