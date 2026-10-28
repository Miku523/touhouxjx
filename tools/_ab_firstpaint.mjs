// 首绘 A/B：index_old.html（改动前：样式表渲染阻塞） vs index.html（改动后：media=print 非阻塞 + 内联启动幕兜底）
// 用法（先起本地服务器）：
//   python tools/serve_nocache.py 8138
//   node tools/_ab_firstpaint.mjs
// 断言/输出：FP / FCP / css-ready 到达时刻（相对导航起点），以及 900ms 时刻的截图。
import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/ab';
mkdirSync(OUT, { recursive: true });
const WARM = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
// 国内弱网粗模：220ms RTT + 150 KB/s（约 1.2 Mbps），style.css 42 KiB gzip 需要 ~0.3s 传输 + 1 RTT
const TH = { offline: false, latency: 220, downloadThroughput: 150 * 1024, uploadThroughput: 60 * 1024 };

const T = await launch({ port: 9433, width: 1280, height: 720 });

// 在新文档最早时机装探针：paint 时刻与 html.css-ready 时刻，全部用 performance.now() 记
await T.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const ap = (window.__ap = { fp: null, fcp: null, cssReadyAt: null, t0: performance.now() });
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.name === 'first-paint' && ap.fp === null) ap.fp = e.startTime;
          if (e.name === 'first-contentful-paint' && ap.fcp === null) ap.fcp = e.startTime;
        }
      }).observe({ type: 'paint', buffered: true });
      new MutationObserver(() => {
        if (ap.cssReadyAt === null && document.documentElement.classList.contains('css-ready')) ap.cssReadyAt = performance.now();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  })();`,
});

async function measure(tag, path) {
  await T.send('Page.navigate', { url: 'about:blank' });
  await T.send('Network.emulateNetworkConditions', WARM);
  await T.send('Network.clearBrowserCache');
  await sleep(250);
  await T.send('Network.emulateNetworkConditions', TH);
  const t0 = Date.now();
  await T.send('Page.navigate', { url: BASE + path });
  let shot = false;
  let ap = { fp: null, fcp: null, cssReadyAt: null };
  for (let i = 0; i < 240; i++) {
    const t = Date.now() - t0;
    if (!shot && t >= 900) { shot = true; try { await T.shot(`${OUT}/${tag}_900ms.png`); } catch {} }
    try {
      const r = await T.eval('window.__ap ? JSON.stringify(window.__ap) : null', { awaitPromise: false });
      if (r) {
        ap = JSON.parse(r);
        if (ap.fcp !== null) break;
      }
    } catch {}
    await sleep(70);
  }
  // 再等 css-ready（老页面没有这个标记，超时算 null）
  for (let i = 0; i < 80; i++) {
    try {
      const r = await T.eval('window.__ap && window.__ap.cssReadyAt', { awaitPromise: false });
      if (r) { ap.cssReadyAt = r; break; }
    } catch {}
    await sleep(80);
  }
  const row = {
    tag,
    path,
    fp_ms: ap.fp === null ? null : Math.round(ap.fp),
    fcp_ms: ap.fcp === null ? null : Math.round(ap.fcp),
    css_ready_ms: ap.cssReadyAt === null ? null : Math.round(ap.cssReadyAt),
  };
  console.log(JSON.stringify(row));
  return row;
}

const rows = [];
rows.push(await measure('old', '/index_old.html?nosw=1'));
rows.push(await measure('new', '/index.html?nosw=1'));

// 正常网速下过一遍启动流程：确认兜底撤掉后标题页正常、无 console error
await T.send('Network.emulateNetworkConditions', WARM);
const bootOk = await T.boot({ query: '?nosw=1', timeout: 30000 }).then(() => true).catch((e) => String(e));
let stateInfo = null;
try {
  stateInfo = JSON.parse(await T.eval(`JSON.stringify({
    state: window.__game && window.__game.state,
    cssReady: document.documentElement.classList.contains('css-ready'),
    bootDisplay: getComputedStyle(document.getElementById('boot')).display,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    panelFont: getComputedStyle(document.getElementById('title')).fontFamily,
  })`));
} catch (e) { stateInfo = String(e); }
await T.shot(`${OUT}/new_title.png`);
const rep = await T.report();
writeFileSync(`${OUT}/result.json`, JSON.stringify({ rows, bootOk, stateInfo, errors: rep.errors, netFails: rep.netFails, httpBad: rep.httpBad }, null, 1));
console.log('--- normal boot ---');
console.log(JSON.stringify({ bootOk, stateInfo, errors: rep.errors.slice(0, 8), netFails: rep.netFails.slice(0, 5), httpBad: rep.httpBad.slice(0, 5) }, null, 1));
await T.close();
