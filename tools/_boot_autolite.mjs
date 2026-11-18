// 门禁自动降级验证：限速 220ms RTT + 150KB/s 下比较口径；每轮先清缓存/SW，避免假快。
import { launch, sleep, BASE } from './_pt_core.mjs';

const TH = { offline: false, latency: 220, downloadThroughput: 150 * 1024, uploadThroughput: 60 * 1024 };
const FAST = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

const T = await launch({ port: 9493, width: 1280, height: 720 });
const rows = [];

async function run(tag, query, net) {
  await T.send('Network.enable', {});
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await T.send('Storage.clearDataForOrigin', { origin: BASE.replace(/\/$/, ''), storageTypes: 'all' }); } catch {}
  await T.send('Network.emulateNetworkConditions', net);
  const t0 = Date.now();
  await T.send('Page.navigate', { url: BASE + query });
  let snap = null;
  for (let i = 0; i < 1800; i++) {
    try {
      const r = await T.eval("(window.__game && window.__game._bootGate) ? JSON.stringify({done:window.__game._bootGate.done,lite:window.__game._bootGateLite,failed:window.__game._bootGate.failed,stageArt:!!window.__game._bootGate.stageArt,music:!!window.__game._bootGate.music}) : null", { awaitPromise: false });
      if (r) { snap = JSON.parse(r); if (snap.done) break; }
    } catch {}
    await sleep(100);
  }
  rows.push({ tag, ms: Date.now() - t0, ...(snap || { done: false }) });
}

await run('fast-default', '/index.html', FAST);
await run('slow-forced-full', '/index.html?bootgate=full', TH);
await run('slow-default', '/index.html', TH);
await T.send('Network.emulateNetworkConditions', FAST);

for (const r of rows) console.log(JSON.stringify(r));
await T.close();
