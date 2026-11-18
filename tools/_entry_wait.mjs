// 慢网进关等待测量：门禁自动降级后，从标题到进关各阶段耗时
import { launch, sleep, BASE } from './_pt_core.mjs';
const TH = { offline: false, latency: 220, downloadThroughput: 150 * 1024, uploadThroughput: 60 * 1024 };
const T = await launch({ port: 9495, width: 1280, height: 720 });
await T.send('Network.enable', {});
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
try { await T.send('Storage.clearDataForOrigin', { origin: BASE.replace(/\/$/, ''), storageTypes: 'all' }); } catch {}
await T.send('Network.emulateNetworkConditions', TH);
const t0 = Date.now();
await T.send('Page.navigate', { url: BASE + '/index.html' });
let gate = null;
for (let i = 0; i < 2000; i++) {
  try {
    const r = await T.eval("(window.__game && window.__game._bootGate) ? JSON.stringify({done:!!window.__game._bootGate.done,lite:window.__game._bootGateLite}) : null", { awaitPromise: false });
    if (r) { gate = JSON.parse(r); if (gate.done) break; }
  } catch {}
  await sleep(100);
}
const tGate = Date.now() - t0;
console.log('gate', JSON.stringify(gate), tGate + 'ms');
// 标记：进入难度页 → 按 Enter → 采样 kitLoading 遮罩与 state
const marks = [];
const mark = async (tag) => { marks.push({ tag, ms: Date.now() - t0, s: await T.eval("JSON.stringify({st:window.__game.state,kit:(document.getElementById('kitLoad')||{}).style?.display||'',sub:(document.querySelector('#kitLoad .kit-sub')||{}).textContent||''})", { awaitPromise: false }) }); };
const keyWait = async () => { await T.key('Enter'); await sleep(500); };
// 标题 → 难度页
await keyWait(); await mark('after-first-enter');
// 难度页 → 开局（这里会 await ensureGameKit）
await keyWait(); await mark('after-second-enter');
for (let i = 0; i < 40; i++) {
  const st = await T.eval("window.__game.state", { awaitPromise: false });
  if (st === 'play') break;
  await T.key('Enter');
  await sleep(400);
  if (i % 5 === 0) await mark('dlg' + i);
}
await mark('play-or-end');
await sleep(1500);
await mark('play+1.5s');
for (const m of marks) console.log(m.tag, m.ms, m.s);
await T.close();