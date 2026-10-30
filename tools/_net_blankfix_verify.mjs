// 弱网紫屏修复验证（1.6.42 首绘门控契约）
// 用法：node tools/_net_blankfix_verify.mjs [scene...]
// 场景：fast ab_old ab_new ss s15 jsfail recover noscript offline
// 输出：tools/reports/net_verify.json + PASS/FAIL 表 + tools/shots/net_gate/*.png
import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, block, unblock, throttle, cold, sample, gate, bootState } from './_x_gate.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const SHOTS = 'tools/shots/net_gate';
const REPORT = 'tools/reports/net_verify.json';
mkdirSync(SHOTS, { recursive: true });
mkdirSync('tools/reports', { recursive: true });

const results = [];
const add = (scene, id, ok, detail) => { results.push({ scene, id, ok: !!ok, status: ok ? 'PASS' : 'FAIL', detail: detail == null ? '' : String(detail) }); };
const info = (scene, id, detail) => { results.push({ scene, id, ok: true, status: 'INFO', detail: String(detail) }); };
const pick = (rows, at) => rows.find((r) => r.at === at) || null;
const g = (row) => (row ? gate(row.dom, row.img) : null);
const fmt = (x) => x ? ('t=' + (x.t != null ? x.t : '?') + 'ms hks=' + x.hksReady + ' css=' + x.cssReady + ' boot=' + x.bootVis + ' panel=' + x.panelVis + ' hint=' + x.hintVis + ' exposed=' + x.exposed + ' light=' + x.lightPct + ' top=' + x.top) : 'null';

async function scene(name, opts) {
  const o = Object.assign({ port: 9471, url: '/index.html?nosw=1', width: 1280, height: 720, times: [3], pre: null, blockUrls: null, throttle: null, post: null }, opts);
  let T = null;
  const out = { name, url: o.url, times: o.times, rows: [], checks: [] };
  try {
    T = await launch({ port: o.port, width: o.width, height: o.height });
    await cold(T);
    if (o.throttle) await throttle(T, o.throttle);
    else await throttle(T, { latency: 0, down: -1, up: -1, type: 'wifi' });
    if (o.blockUrls) await block(T, o.blockUrls);
    if (o.pre) await o.pre(T);
    const navAt = Date.now();
    await T.nav(LOCAL + o.url);
    const rows = await sample(T, o.times, { dir: SHOTS, tag: name, navAt });
    out.rows = rows.map((r) => ({ at: r.at, shot: r.shot, g: g(r) }));
    if (process.env.GATE_DEBUG) console.log('   DBG rows=' + rows.map((r) => r.at + ':' + (r.dom && r.dom.t) + ':shot' + r.shotMs).join(','));
    if (o.post) await o.post(T, out, rows);
    out.state = await bootState(T);
    out.report = (() => { try { return T.report(); } catch (e) { return null; } })();
    console.log('--- scene ' + name + ' ' + JSON.stringify(o.times));
    for (const r of out.rows) console.log('   ' + String(r.at).padStart(3) + 's ' + fmt(r.g));
    console.log('   state ' + JSON.stringify(out.state && { cssReady: out.state.cssReady, uiReady: out.state.uiReady, hksReady: out.state.hksReady, panel: out.state.panel, css: out.state.css }));
  } catch (e) {
    add(name, name + '-crash', false, String((e && e.stack) || e).slice(0, 500));
    console.log('!!! scene ' + name + ' crash ' + String(e).slice(0, 300));
  } finally { if (T) { try { await T.close(); } catch (e) {} } }
  return out;
}

const scenes = {};

/* ---------- A. 快路径不回归：3s 内出标题画 ---------- */
scenes.fast = () => scene('fast', {
  port: 9471, times: [1, 2, 3, 5],
  post: async (T, out, rows) => {
    out.rows.forEach((r) => { if (r.g.exposed) add('fast', 'fast-no-raw@' + r.at + 's', false, fmt(r.g)); });
    const r3 = g(pick(rows, 3)), r5 = g(pick(rows, 5));
    add('fast', 'fast-hks-ready-3s', !!(r3 && r3.hksReady), fmt(r3));
    add('fast', 'fast-title-art-5s', !!(r5 && r5.hksReady && r5.lightPct > 6), fmt(r5));
    add('fast', 'fast-ready-5s', !!(r5 && r5.hksReady && r5.game), fmt(r5) + ' game=' + (r5 && r5.game));
    info('fast', 'fast-art-timing', out.rows.map((r) => r.at + 's light=' + r.g.lightPct + ' boot=' + r.g.bootVis).join(' '));
    add('fast', 'fast-no-raw-all', !out.rows.some((r) => r.g.exposed), out.rows.map((r) => r.at + 's:' + r.g.exposed).join(' '));
  }
});

/* ---------- B. A/B 对照：旧 index.html（8s 超时撤兜底）vs 新 index.html，阻断 style.css，采样 9s ---------- */
scenes.ab_old = () => scene('ab_old', {
  port: 9472, url: '/_hks_old_index.html?nosw=1', times: [9, 13, 15], blockUrls: ['*style.css*'],
  post: async (T, out, rows) => {
    const r9 = g(pick(rows, 9));
    const r13 = g(pick(rows, 13));
    add('ab_old', 'old-exposed-13s', !!(r13 && r13.exposed), fmt(r13) + ' hudRaw=' + (r13 && r13.hudRaw) + ' leak=' + JSON.stringify(r13 && r13.leak));
    info('ab_old', 'old-9s-state', fmt(r9));
    add('ab_old', 'old-cssclass-9s', !!(r9 && r9.hksClass.indexOf('css-ready') >= 0), 'html=' + (r9 && r9.hksClass));
    add('ab_old', 'old-no-panel', !!(r9 && !r9.panelVis), 'panel=' + (r9 && r9.panelVis));
    if (r9) info('ab_old', 'old-raw-signal', 'hudRaw=' + r9.hudRaw + ' chipRaw=' + r9.chipRaw + ' sheets=' + r9.sheets + ' body="' + String(r9.bodyText).slice(0, 90) + '"');
  }
});
scenes.ab_new = () => scene('ab_new', {
  port: 9473, times: [1, 9], blockUrls: ['*style.css*'],
  post: async (T, out, rows) => {
    const r = g(pick(rows, 9));
    add('ab_new', 'new-panel-9s', !!(r && r.panelVis && /样式表|没有加载/.test(r.panelTitle)), fmt(r) + ' title="' + (r && r.panelTitle) + '" btns=' + JSON.stringify(r && r.panelBtns));
    add('ab_new', 'new-no-raw-9s', !!(r && !r.exposed && !r.hudRaw && !r.chipRaw), fmt(r) + ' leak=' + JSON.stringify(r && r.leak));
    add('ab_new', 'new-ui-hidden-9s', !!(r && r.leak.length === 0), 'leak=' + JSON.stringify(r && r.leak));
    add('ab_new', 'new-covered-9s', !!(r && (r.bootVis || r.panelVis)), fmt(r));
  }
});

/* ---------- C. 慢网矩阵：500ms / 45KB/s 与 500ms / 15KB/s ---------- */
function slowChecks(name, rows) {
  rows.forEach((r) => {
    const x = r.g;
    add(name, name + '-no-raw@' + r.at + 's', !x.exposed, fmt(x) + (x.leak.length ? ' leak=' + JSON.stringify(x.leak) : ''));
    // 5s 前 HTML 本身可能还在下载（15KB/s 下 3s 只有深色空屏）：属物理下限，只记录 INFO，不判 FAIL
    if (r.at < 5) { info(name, name + '-early@' + r.at + 's', 'HTML 仍在下载，深色空屏属物理下限 ' + fmt(x)); return; }
    add(name, name + '-feedback@' + r.at + 's', !!(x.hksReady || x.bootVis || x.panelVis || x.hintVis), fmt(x));
    // 慢网提示：5-20s 的阈值提示；25s 后由 css-slow/js-slow 面板接管，不再要求底部 hint
    if (r.at >= 5 && r.at <= 25 && !x.hksReady && !x.panelVis) add(name, name + '-hint@' + r.at + 's', x.hintVis, fmt(x) + ' hint="' + String(x.hintTx || '').slice(0, 60) + '"');
    if (r.at >= 26 && !x.hksReady && !x.cssReady && !x.panelVis) add(name, name + '-panel@' + r.at + 's', false, '25s 后既无样式也无面板 ' + fmt(x));
    if (r.at >= 32 && !x.hksReady && x.cssReady && !x.panelVis && !x.hintVis) add(name, name + '-panel@' + r.at + 's', false, 'css 就绪 30s 后无 js 面板 ' + fmt(x));
  });
}
scenes.ss = () => scene('ss', { port: 9474, times: [3, 8, 16, 25, 40, 60], throttle: { latency: 500, down: 45 * 1024, up: 20 * 1024 }, post: async (T, out) => slowChecks('ss', out.rows) });
scenes.s15 = () => scene('s15', { port: 9475, times: [3, 8, 16, 25, 40, 60], throttle: { latency: 500, down: 15 * 1024, up: 10 * 1024 }, post: async (T, out) => slowChecks('s15', out.rows) });

/* ---------- D. 主脚本失败：屏蔽 main.js ---------- */
scenes.jsfail = () => scene('jsfail', {
  port: 9476, times: [2, 6, 31], blockUrls: ['*src/main.js*'],
  post: async (T, out, rows) => {
    const r2 = g(pick(rows, 2)), r6 = g(pick(rows, 6)), r31 = g(pick(rows, 31));
    add('jsfail', 'js-cssready-2s', !!(r2 && r2.cssReady), fmt(r2));
    add('jsfail', 'js-not-ready', !!(r6 && !r6.hksReady), fmt(r6));
    add('jsfail', 'js-no-raw-6s', !!(r6 && !r6.exposed && !r6.hudRaw), fmt(r6));
    add('jsfail', 'js-feedback-6s', !!(r6 && (r6.hintVis || (r6.panelVis && /脚本|启动|加载|等待/.test(r6.panelTitle || '')))), fmt(r6) + ' panelTitle="' + String(r6 && r6.panelTitle).slice(0, 60) + '" hint="' + String(r6 && r6.hintTx).slice(0, 40) + '"');
    add('jsfail', 'js-panel-31s', !!(r31 && r31.panelVis && /脚本|启动/.test(r31.panelTitle)), fmt(r31) + ' title="' + String(r31 && r31.panelTitle).slice(0, 90) + '"');
    add('jsfail', 'js-no-raw-31s', !!(r31 && !r31.exposed), fmt(r31));
  }
});

/* ---------- E. 面板恢复：阻断 style.css → 面板 → 解除 + __hksRetry() → ~3s 内 hks-ready ---------- */
scenes.recover = () => scene('recover', {
  port: 9477, times: [1], blockUrls: ['*style.css*'],
  post: async (T, out, rows) => {
    await sleep(1800);
    const s1 = await bootState(T);
    add('recover', 'panel-before-retry', !!(s1 && s1.panel === 'css'), JSON.stringify(s1 && { panel: s1.panel, css: s1.css }).slice(0, 300));
    await unblock(T);
    const t0 = Date.now();
    const fired = await T.eval('(function(){try{window.__hksRetry&&window.__hksRetry();return true}catch(e){return String(e)}})()');
    if (fired !== true) info('recover', 'retry-call', String(fired));
    let ok = null, last = null;
    for (let i = 0; i < 16; i++) {
      await sleep(300);
      last = await bootState(T);
      if (last && last.hksReady && !last.errorShown && last.panel === null) { ok = Date.now() - t0; break; }
    }
    add('recover', 'recovers-after-retry-3s', ok != null && ok <= 3000, 'cost=' + ok + 'ms state=' + JSON.stringify(last && { cssReady: last.cssReady, uiReady: last.uiReady, hksReady: last.hksReady, panel: last.panel, err: last.errorShown }));
    const after = await sample(T, [0], { dir: SHOTS, tag: 'recover_after', navAt: Date.now() });
    const gAfter = after.length ? gate(after[0].dom, after[0].img) : null;
    add('recover', 'recovered-ui-visible', !!(gAfter && gAfter.hksReady && !gAfter.exposed), gAfter ? fmt(gAfter) : 'null');
  }
});

/* ---------- F. noscript ---------- */
scenes.noscript = () => scene('noscript', {
  port: 9478, times: [3],
  pre: async (T) => { await T.send('Emulation.setScriptExecutionDisabled', { value: true }); },
  post: async (T, out, rows) => {
    const r = g(rows[0]);
    add('noscript', 'noscript-banner', !!(r && /需要启用 JavaScript/.test(r.bodyText || '')), 'body="' + String(r && r.bodyText).slice(0, 120) + '"');
    add('noscript', 'noscript-no-raw', !!(r && !r.exposed && r.leak.length === 0), fmt(r));
  }
});

/* ---------- G. 离线 SW 重载（best effort） ---------- */
scenes.offline = () => scene('offline', {
  port: 9479, url: '/index.html', times: [2],
  post: async (T, out, rows) => {
    try { await T.send('Network.setCacheDisabled', { cacheDisabled: false }); } catch (e) {}
    await sleep(2500);
    const sw = await T.eval('navigator.serviceWorker?(navigator.serviceWorker.controller?"ctl":"reg"):"none"').catch(() => 'err');
    await T.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    try { await T.reload(); } catch (e) { info('offline', 'offline-reload-crash', String(e).slice(0, 200)); }
    await sleep(2500);
    const dom = await sample(T, [0], { dir: SHOTS, tag: 'offline', navAt: Date.now() });
    const x = dom.length ? gate(dom[0].dom, dom[0].img) : null;
    info('offline', 'offline-sw-state', 'sw=' + sw + ' ' + (x ? fmt(x) : 'null'));
    add('offline', 'offline-shell-usable', !!(x && !x.exposed && (x.hksReady || x.bootVis || x.panelVis)), x ? fmt(x) : 'no dom after offline reload');
  }
});

const order = ['fast', 'ab_old', 'ab_new', 'ss', 's15', 'jsfail', 'recover', 'noscript', 'offline'];
const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = want.length ? want : order;
for (const name of run) {
  if (!scenes[name]) { console.log('unknown scene ' + name); continue; }
  try { await scenes[name](); } catch (e) { add(name, name + '-crash', false, String((e && e.stack) || e).slice(0, 400)); }
}

// 子集运行（只跑部分场景）时，保留既有报告里未运行场景的结果，避免覆盖丢失
const runSet = new Set(run);
let prevResults = [];
if (run.length !== order.length) {
  try { const prev = JSON.parse(readFileSync(REPORT, 'utf8')); if (prev && Array.isArray(prev.results)) prevResults = prev.results.filter((r) => !runSet.has(r.scene)); } catch (e) {}
}
const all = prevResults.concat(results);
const passed = all.filter((r) => r.ok).length;
const failed = all.filter((r) => !r.ok);
const infoN = all.filter((r) => r.status === 'INFO').length;
const payload = { at: new Date().toISOString(), base: LOCAL, page: 'http://127.0.0.1:8138/index.html?nosw=1', results: all, passed, failed: failed.length, info: infoN };

console.log('\n================ PASS/FAIL ================');
writeFileSync(REPORT, JSON.stringify(payload, null, 2));
for (const r of results) console.log(r.status.padEnd(4) + ' ' + (r.scene + '/' + r.id).padEnd(46) + ' ' + r.detail.slice(0, 160));
for (const r of failed) if (results.indexOf(r) < 0) console.log('FAIL ' + (r.scene + '/' + r.id).padEnd(46) + ' ' + r.detail.slice(0, 160));
console.log('------------------------------------------');
console.log(failed.length === 0 ? 'ALL PASS (' + passed + ' checks, ' + infoN + ' info)' : 'FAILED ' + failed.length + ' / ' + results.length);
console.log('wrote ' + REPORT);
process.exitCode = failed.length === 0 ? 0 : 1;
