/**
 * HKS 启动幕门禁性能对比 harness（只读测量，不改游戏代码）
 *
 * 用法：
 *   node tools/_gate_perf.mjs --base http://127.0.0.1:8140 --label base_head --runs 3 --throttle fast --out _gate/report/raw/base_head_fast.json
 *   node tools/_gate_perf.mjs --base http://127.0.0.1:8141 --label after_gate_on --runs 3 --throttle fast --out _gate/report/raw/after_gate_on_fast.json
 *   node tools/_gate_perf.mjs --base http://127.0.0.1:8141 --label after_gate_off --runs 3 --throttle fast --query "?bootgate=off" --out ...
 *
 * 条件：fast（本地无节流）| 700（700KB/s + 220ms RTT）| 150（150KB/s + 220ms RTT）
 * 每次运行都是全新 headless Edge profile（冷启动），并 Network.setCacheDisabled。
 *
 * 页内计时（避免 CDP 往返误差）：
 *   - Page.addScriptToEvaluateOnNewDocument 在 document_start 注入 __gateT：
 *     setTimeout(8) 轮询 __boot.done / __game.state==='menu'，记录 performance.now()
 *   - t_reveal 优先取 window.__boot.timeline 里 'hide' 那一笔（bootScreen.hide() 内的精确时间）
 *   - 传输量采样点（口径固定，前后一致）：
 *       menuPlus2s   = t_menu   + 2000ms   （原任务口径）
 *       revealPlus3s = t_reveal + 3000ms   （主口径：都在揭幕后，跨条件可比）
 *     bytes_by_reveal = responseEnd <= t_reveal 的资源合计（=「揭幕前已经到齐的首屏字节」）
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
};

const BASE = arg('base', 'http://127.0.0.1:8140');
const RUNS = Number(arg('runs', '3'));
const THROTTLE = String(arg('throttle', 'fast'));
const LABEL = arg('label', 'base');
const QUERY = arg('query', '');   // 例如 "?bootgate=off"：同一棵树上做门禁开/关 A/B
const PORT = Number(arg('port', '9425'));
const MENU_PLUS_MS = Number(arg('menuplus', '2000'));
const REVEAL_PLUS_MS = Number(arg('revealplus', '3000'));
const OUT = arg('out', `_gate/report/raw/${LABEL}_${THROTTLE}.json`);

const THROTTLES = {
  fast: null,
  '700': { latency: 220, downloadThroughput: 700 * 1024, uploadThroughput: 700 * 1024 },
  '150': { latency: 220, downloadThroughput: 150 * 1024, uploadThroughput: 150 * 1024 },
};
if (!(THROTTLE in THROTTLES)) throw new Error('bad --throttle: ' + THROTTLE);
const TH = THROTTLES[THROTTLE];
const TIMEOUT_MS = Number(arg('timeout', TH ? (THROTTLE === '150' ? 240000 : 120000) : 45000));

/* document_start 注入的页内探针：所有时间戳都是 performance.now()（相对 navigationStart） */
const INIT = `(() => {
  if (window.__gateT) return;
  const S = window.__gateT = { t0: performance.now(), reveal: null, menu: null, bootDone: null, firstState: {}, states: [] };
  try { performance.setResourceTimingBufferSize(6000); } catch (e) {}
  const tick = () => {
    const now = performance.now();
    try {
      if (S.reveal === null && window.__boot && window.__boot.done) S.reveal = now;
      if (S.bootDone === null && window.__game && window.__game._bootDone === true) S.bootDone = now;
      if (window.__game && window.__game.state) {
        const st = window.__game.state;
        if (S.firstState[st] === undefined) { S.firstState[st] = now; S.states.push(st); }
        if (S.menu === null && st === 'menu') S.menu = now;
      }
    } catch (e) {}
    if (S.reveal !== null && S.menu !== null) { S.ended = now; return; }
    setTimeout(tick, 8);
  };
  tick();
})();`;

const PROBE_RES = `JSON.stringify({
  gateT: window.__gateT || null,
  boot: window.__boot ? { done: !!window.__boot.done, pct: window.__boot.pct, timeline: window.__boot.timeline || null } : null,
  bootGate: window.__hksBootGate || null,
  prewarm: window.__prewarmInfo || null,
  gameState: window.__game ? window.__game.state : null,
  bootVisible: (() => { const b = document.getElementById('boot'); if (!b) return null; const cs = getComputedStyle(b); return { display: cs.display, opacity: cs.opacity, done: b.classList.contains('done') }; })(),
  bootElDisplay: (document.getElementById('boot') || {}).style ? document.getElementById('boot').style.display : null,
  nav: (() => { const n = performance.getEntriesByType('navigation')[0]; if (!n) return null;
    return { type: n.type, transferSize: n.transferSize, encodedBodySize: n.encodedBodySize,
      startTime: Math.round(n.startTime), responseEnd: Math.round(n.responseEnd),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd), loadEnd: Math.round(n.loadEventEnd) }; })(),
  resources: performance.getEntriesByType('resource').map((e) => ({
    u: e.name, t: e.initiatorType, ts: e.transferSize, eb: e.encodedBodySize, db: e.decodedBodySize,
    st: Math.round(e.startTime), re: Math.round(e.responseEnd), d: Math.round(e.duration) }))
})`;

const PAGE_NOW = `performance.now()`;

const isSong = (u) => /\/engine\/songs\/[^/]+\.js(\?|$)/.test(u);
const isScript = (e) => e.t === 'script' || /\.m?js(\?|$)/.test(e.u);
const isImg = (e) => e.t === 'img' || /\.(webp|png|jpe?g|avif|gif|svg)(\?|$)/i.test(e.u);
const isCss = (e) => e.t === 'css' || /\.css(\?|$)/.test(e.u);
const isMedia = (e) => /\.(mp3|ogg|m4a|wav)(\?|$)/i.test(e.u);

function bucketize(resources, gate) {
  const gateStart = gate && typeof gate.startedAt === 'number' ? gate.startedAt : null;
  const b = {
    total: { n: resources.length, uq: 0, ts: 0, eb: 0, zeroTs: 0 },
    kit: { n: 0, uq: 0, ts: 0, eb: 0 },
    songs: { n: 0, uq: 0, ts: 0, eb: 0 },
    scriptOther: { n: 0, uq: 0, ts: 0, eb: 0 },
    img: { n: 0, uq: 0, ts: 0, eb: 0 },
    css: { n: 0, uq: 0, ts: 0, eb: 0 },
    media: { n: 0, uq: 0, ts: 0, eb: 0 },
    other: { n: 0, uq: 0, ts: 0, eb: 0 },
  };
  const urls = { total: new Set(), kit: new Set(), songs: new Set(), scriptOther: new Set(), img: new Set(), css: new Set(), media: new Set(), other: new Set() };
  for (const e of resources) {
    const ts = e.ts || 0, eb = e.eb || 0;
    b.total.ts += ts; b.total.eb += eb;
    if (!ts) b.total.zeroTs += 1;
    let k;
    if (isSong(e.u)) k = 'songs';
    else if (isScript(e)) k = gateStart !== null && e.st >= gateStart ? 'kit' : 'scriptOther';
    else if (isCss(e)) k = 'css';
    else if (isImg(e)) k = 'img';
    else if (isMedia(e)) k = 'media';
    else k = 'other';
    b[k].n += 1; b[k].ts += ts; b[k].eb += eb;
    urls[k].add(e.u); urls.total.add(e.u);
  }
  for (const k of Object.keys(urls)) b[k].uq = urls[k].size;
  return b;
}

function songInfo(resources, needle, tReveal) {
  const hits = resources.filter((e) => e.u.includes(needle));
  if (!hits.length) return null;
  hits.sort((a, b) => a.st - b.st);
  const h = hits[0];
  return {
    url: h.u.split('/').slice(-2).join('/'),
    start: h.st, responseEnd: h.re,
    readyBeforeReveal: tReveal === null ? null : h.re <= tReveal,
    leadMs: tReveal === null ? null : h.re - tReveal,
    bytes: h.ts || 0,
  };
}

function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : +((v[m - 1] + v[m]) / 2).toFixed(2);
}
const stat = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return { n: 0, median: null, min: null, max: null };
  return { n: v.length, median: median(v), min: Math.min(...v), max: Math.max(...v), all: v };
};

async function safeEval(T, expr, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { return await T.eval(expr); } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(100);
    }
  }
}

async function oneRun(idx) {
  const T = await launch({ port: PORT, width: 1280, height: 720 });
  const run = {
    i: idx, throttle: THROTTLE, base: BASE, query: QUERY, startedAt: new Date().toISOString(),
    t_reveal: null, t_reveal_src: null, t_menu: null,
    samples: {}, bytes: null, bytes_by_reveal: null, resourcesCount: null,
    bootGate: null, errors: [], httpBad: [], netFails: [],
    bootVisible: null, gameState: null, timeout: false, wallMs: null, loadEnd: null,
  };
  const wall0 = Date.now();
  try {
    await T.send('Network.enable');
    await T.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (TH) {
      await T.send('Network.emulateNetworkConditions', {
        offline: false, latency: TH.latency,
        downloadThroughput: TH.downloadThroughput, uploadThroughput: TH.uploadThroughput,
        connectionType: 'cellular3g',
      });
    }
    await T.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    await T.nav(BASE + '/index.html' + QUERY);

    const t0 = Date.now();
    let probe = null;
    while (Date.now() - t0 < TIMEOUT_MS) {
      const raw = await safeEval(T, `(() => { const g = window.__gateT; return g ? JSON.stringify({ reveal: g.reveal, menu: g.menu }) : null; })()`).catch(() => null);
      if (raw) {
        const st = JSON.parse(raw);
        if (st.reveal !== null && st.menu !== null) { probe = st; break; }
      }
      await sleep(120);
    }
    if (!probe) { run.timeout = true; probe = { reveal: null, menu: null }; }

    /* 采样点：按时间排序依次等（都相对页内 performance.now()） */
    const points = [];
    if (probe.menu !== null) points.push({ key: 'menuPlus2s', at: probe.menu + MENU_PLUS_MS });
    if (probe.reveal !== null) points.push({ key: 'revealPlus3s', at: probe.reveal + REVEAL_PLUS_MS });
    if (!points.length) {
      const nowPage = await safeEval(T, PAGE_NOW).catch(() => null);
      if (typeof nowPage === 'number') points.push({ key: 'timeoutPoint', at: nowPage + REVEAL_PLUS_MS });
    }
    points.sort((a, b) => a.at - b.at);
    for (const p of points) {
      const nowPage = await safeEval(T, PAGE_NOW).catch(() => null);
      if (typeof nowPage === 'number') {
        const wait = p.at - nowPage;
        if (wait > 0) await sleep(Math.min(wait, 240000));
      }
      try {
        const raw = await safeEval(T, PROBE_RES);
        run.samples[p.key] = JSON.parse(raw);
      } catch (e) {
        run.samples[p.key] = null;
      }
    }

    const s = run.samples.revealPlus3s || run.samples.menuPlus2s || run.samples.timeoutPoint || null;
    if (!s) throw new Error('no sample collected');
    run.gameState = s.gameState;
    run.bootVisible = s.bootVisible;
    run.bootGate = s.bootGate;
    run.loadEnd = s.nav ? s.nav.loadEnd : null;
    run.navProbe = s.nav;
    run.bootTimeline = s.boot ? s.boot.timeline : null;
    run.prewarm = s.prewarm;
    run.gateT = s.gateT;
    run.sampleKeys = Object.keys(run.samples);

    /* t_reveal：优先 timeline 里 hide() 的精确时间；退回页内轮询值 */
    const tl = (s.boot && Array.isArray(s.boot.timeline)) ? s.boot.timeline : [];
    const hide = [...tl].reverse().find((p) => p && p.n === 'hide');
    if (hide && typeof hide.t === 'number') { run.t_reveal = hide.t; run.t_reveal_src = 'timeline.hide'; }
    else if (s.gateT && typeof s.gateT.reveal === 'number') { run.t_reveal = +s.gateT.reveal.toFixed(1); run.t_reveal_src = 'poll'; }
    run.t_menu = s.gateT && typeof s.gateT.menu === 'number' ? +s.gateT.menu.toFixed(1) : null;
    run.t_title_interactive = s.gateT && typeof s.gateT.bootDone === 'number' ? +s.gateT.bootDone.toFixed(1) : null;
    run.menuStateFirst = s.gateT ? s.gateT.firstState : null;

    const resources = s.resources || [];
    run.resourcesCount = resources.length;
    run.bytes = bucketize(resources, s.bootGate);
    /* 「揭幕前已到齐」口径：responseEnd <= t_reveal（in-flight 的自然被排除） */
    if (run.t_reveal !== null) {
      const before = resources.filter((e) => e.re > 0 && e.re <= run.t_reveal);
      run.bytes_by_reveal = bucketize(before, s.bootGate);
      run.resourcesCount_by_reveal = before.length;
    }
    run.songs = {
      honou_pre1: songInfo(resources, '/engine/songs/honou_pre1.js', run.t_reveal),
      youma_stage1: songInfo(resources, '/engine/songs/youma_stage1.js', run.t_reveal),
      stage_js: songInfo(resources, '/game/stage.js', run.t_reveal),
      bullets_js: songInfo(resources, '/game/bullets.js', run.t_reveal),
      story_js: songInfo(resources, '/game/story.js', run.t_reveal),
    };
    run.errors = [...T.errors];
    run.httpBad = T.httpBad.map((x) => x.status + ' ' + x.url.split('/').slice(-2).join('/'));
    run.netFails = T.netFails.filter((f) => !f.canceled).map((f) => f.err + ' ' + String(f.url).split('/').slice(-2).join('/'));
  } catch (e) {
    run.error = String((e && e.stack) || e).slice(0, 800);
  } finally {
    run.wallMs = Date.now() - wall0;
    try { await T.close(); } catch {}
    await sleep(600);
  }
  return run;
}

const bytesAt = (r, key) => (r.samples && r.samples[key] ? bucketize(r.samples[key].resources || [], r.samples[key].bootGate) : null);

function summarize(runs) {
  const ok = runs.filter((r) => !r.error && !r.timeout);
  const pick = (fn) => stat(ok.map(fn));
  const bytesPick = (k, src) => stat(ok.map((r) => {
    const b = src === 'reveal3' ? r.bytes : src === 'byReveal' ? r.bytes_by_reveal : bytesAt(r, 'menuPlus2s');
    return b ? b[k].ts : null;
  }));
  const cntPick = (k, src) => stat(ok.map((r) => {
    const b = src === 'reveal3' ? r.bytes : src === 'byReveal' ? r.bytes_by_reveal : bytesAt(r, 'menuPlus2s');
    return b ? b[k].n : null;
  }));
  return {
    completeRuns: ok.length, totalRuns: runs.length,
    t_reveal: pick((r) => r.t_reveal),
    t_menu: pick((r) => r.t_menu),
    t_title_interactive: pick((r) => r.t_title_interactive),
    t_gate_kit_done: pick((r) => (r.bootGate && r.bootGate.finishedAt) || null),
    t_gate_span: pick((r) => (r.bootGate && r.bootGate.finishedAt && r.bootGate.startedAt)
      ? +(r.bootGate.finishedAt - r.bootGate.startedAt).toFixed(1) : null),
    bytes_reveal3_total: bytesPick('total', 'reveal3'),
    bytes_reveal3_kit: bytesPick('kit', 'reveal3'),
    bytes_reveal3_songs: bytesPick('songs', 'reveal3'),
    bytes_reveal3_img: bytesPick('img', 'reveal3'),
    bytes_byreveal_total: bytesPick('total', 'byReveal'),
    bytes_byreveal_kit: bytesPick('kit', 'byReveal'),
    bytes_byreveal_songs: bytesPick('songs', 'byReveal'),
    req_reveal3_total: cntPick('total', 'reveal3'),
    req_reveal3_uniq: stat(ok.map((r) => (r.bytes ? r.bytes.total.uq : null))),
    req_byreveal_uniq: stat(ok.map((r) => (r.bytes_by_reveal ? r.bytes_by_reveal.total.uq : null))),
    req_reveal3_kit: cntPick('kit', 'reveal3'),
    req_reveal3_songs: cntPick('songs', 'reveal3'),
    req_reveal3_img: cntPick('img', 'reveal3'),
    req_byreveal_total: cntPick('total', 'byReveal'),
    zeroTs_in_flight: pick((r) => (r.bytes && r.bytes.total.zeroTs) || 0),
    songs_ready_before_reveal: stat(ok.map((r) => {
      const a = r.songs || {};
      return ['honou_pre1', 'youma_stage1'].filter((k) => a[k] && a[k].readyBeforeReveal === true).length;
    })),
    console_errors: stat(runs.map((r) => (r.errors || []).length)),
    http_bad: stat(runs.map((r) => (r.httpBad || []).length)),
    gate_failed_nonempty: stat(ok.map((r) => (r.bootGate && Array.isArray(r.bootGate.failed) ? r.bootGate.failed.length : null))),
    perRun: runs.map((r) => ({
      i: r.i, t_reveal: r.t_reveal, t_menu: r.t_menu, t_title_interactive: r.t_title_interactive,
      wallMs: r.wallMs, timeout: r.timeout, error: r.error ? r.error.split('\n')[0] : null,
      bytes_reveal3: r.bytes ? r.bytes.total.ts : null,
      req_reveal3: r.bytes ? r.bytes.total.n : null,
      kit_reveal3: r.bytes ? r.bytes.kit.ts : null,
      kitReq_reveal3: r.bytes ? r.bytes.kit.n : null,
      bytes_byreveal: r.bytes_by_reveal ? r.bytes_by_reveal.total.ts : null,
      req_byreveal: r.bytes_by_reveal ? r.bytes_by_reveal.total.n : null,
      zeroTs: r.bytes ? r.bytes.total.zeroTs : null,
      gate_failed: r.bootGate && Array.isArray(r.bootGate.failed) ? r.bootGate.failed : null,
      gate_at: r.bootGate ? { art: r.bootGate.art, kit: r.bootGate.kit, music: r.bootGate.music } : null,
      songs: r.songs ? Object.fromEntries(Object.entries(r.songs).map(([k, v]) => [k, v ? { re: v.responseEnd, before: v.readyBeforeReveal, bytes: v.bytes } : null])) : null,
      errors: (r.errors || []).length,
    })),
  };
}

mkdirSync(dirname(OUT), { recursive: true });
const doc = {
  meta: {
    base: BASE, label: LABEL, throttle: THROTTLE, throttleSpec: TH, query: QUERY, runs: RUNS,
    menuPlusMs: MENU_PLUS_MS, revealPlusMs: REVEAL_PLUS_MS,
    startedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  },
  runs: [],
};
const tStart = Date.now();
for (let i = 0; i < RUNS; i++) {
  console.log(`[${LABEL}/${THROTTLE}${QUERY}] run ${i + 1}/${RUNS} ...`);
  const r = await oneRun(i);
  doc.runs.push(r);
  const b = r.bytes, bb = r.bytes_by_reveal;
  console.log(`  -> t_reveal=${r.t_reveal}ms(${r.t_reveal_src}) t_menu=${r.t_menu}ms | @reveal+3s ${b ? b.total.ts + 'B/' + b.total.n + 'req' : '-'} kit=${b ? b.kit.ts + 'B/' + b.kit.n : '-'} songs=${b ? b.songs.ts + 'B/' + b.songs.n : '-'} | byReveal ${bb ? bb.total.ts + 'B/' + bb.total.n + 'req' : '-'} | zeroTs=${b ? b.total.zeroTs : '-'} err=${(r.errors || []).length} wall=${r.wallMs}ms${r.timeout ? ' TIMEOUT' : ''}${r.error ? ' ERROR:' + r.error.split('\n')[0] : ''}`);
  if (r.bootGate) console.log(`     gate: art=${r.bootGate.art} kit=${r.bootGate.kit} music=${r.bootGate.music} startedAt=${r.bootGate.startedAt} finishedAt=${r.bootGate.finishedAt} span=${r.bootGate.finishedAt && r.bootGate.startedAt ? Math.round(r.bootGate.finishedAt - r.bootGate.startedAt) : '-'}ms failed=${JSON.stringify(r.bootGate.failed)}`);
  writeFileSync(OUT, JSON.stringify({ ...doc, summary: summarize(doc.runs), elapsedMs: Date.now() - tStart }, null, 1));
}
doc.summary = summarize(doc.runs);
doc.elapsedMs = Date.now() - tStart;
doc.finishedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(doc, null, 1));
console.log(`\n[${LABEL}/${THROTTLE}${QUERY}] summary:`);
console.log(JSON.stringify(doc.summary, null, 1));
console.log('wrote ' + OUT);
