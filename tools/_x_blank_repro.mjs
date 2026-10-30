// 复现「别人电脑上第一次访问 = 紫黑空屏 + 裸 HUD 文字」
// 用法：
//   node tools/_x_blank_repro.mjs                 # 全部场景
//   node tools/_x_blank_repro.mjs fast css-hang   # 指定场景
// 输出：tools/shots/net_blank/<scene>_<t>s.png + tools/reports/net_repro.json
import { launch, sleep } from './_pt_core.mjs';
import {
  installProbe, readProbe, domState, sampleAt, throttle, cold, ctl, proxyLog, judge,
  saveJson, decodePng, colorStats, PROXY,
} from './_x_blanklib.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = 'tools/shots/net_blank';
const JSON_OUT = 'tools/reports/net_repro.json';
mkdirSync(OUT, { recursive: true });

// 弱网参考：320kbps / 600ms RTT、100kbps / 900ms RTT（国内 4G 最差 / 2G 边缘）
const SLOW3G = { latency: 600, downKBps: 40, upKBps: 12 };
const SLOW100K = { latency: 900, downKBps: 12.5, upKBps: 5 };

const SCN = {
  fast: { port: 9471, path: '/index.html', times: [1, 2, 3, 6], note: '本机快网基线（对照）' },
  slow3g: { port: 9472, path: '/index.html', throttle: SLOW3G, times: [1, 3, 5, 8, 9, 10, 12, 15, 20, 30], note: '冷缓存 + 320kbps 弱网，不注入失败' },
  'slow100k': { port: 9478, path: '/index.html', throttle: SLOW100K, times: [1, 5, 8, 10, 15, 20, 30, 45], note: '冷缓存 + 100kbps 极弱网' },
  'css-delay-12s': { port: 9474, path: '/index.html?nosw=1', proxy: { cssDelay: 12000 }, times: [1, 5, 8, 9, 10, 13, 16], note: '样式表 12s 才到（> 8s 硬兜底）' },
  'css-hang': { port: 9473, path: '/index.html?nosw=1', proxy: { cssHang: true }, times: [1, 5, 8, 9, 12, 20, 30], note: '样式表请求挂死（头部已回、body 不来）' },
  'css-404': { port: 9475, path: '/index.html?nosw=1', proxy: { cssStatus: 404 }, times: [1, 5, 9, 15], note: '4 份样式表 404' },
  'js-hang': { port: 9476, path: '/index.html?nosw=1', proxy: { jsHang: true }, times: [3, 9, 15, 25], note: 'main.js 挂死、样式表正常' },
  'all-hang': { port: 9477, path: '/index.html?nosw=1', proxy: { cssHang: true, jsHang: true }, times: [5, 9, 20, 30], note: '样式表 + JS 全挂' },
  deployed: { port: 9479, remote: 'https://mikuascendlog.com/touhouxjx/', times: [1, 3, 5, 8, 10, 15, 25, 45, 70], note: '线上站点冷缓存真实网络' },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(SCN);
const out = {};

function summarize(rows) {
  return rows.map((r) => {
    const d = r.dom || {};
    const j = judge(d);
    return {
      at: r.at, cssReady: d.cssReady, sheets: j.sheetsLoaded,
      bootVis: d.boot ? d.boot.vis : null, bootCovers: j.bootCovers, overlayVis: d.overlay ? d.overlay.vis : null,
      hudVis: d.hud ? d.hud.vis : null, bctVis: d.bct ? d.bct.vis : null,
      hiddenLeak: (d.hiddenVisible || []).length, exposed: j.exposed,
      htmlBg: d.htmlBg, game: d.game, lightPct: r.img ? r.img.lightPct : null,
      topColor: r.img ? (r.img.top[0] || {}).c : null, topPct: r.img ? (r.img.top[0] || {}).pct : null,
      shot: r.shot,
    };
  });
}

for (const name of names) {
  const sc = SCN[name];
  if (!sc) { console.log('unknown scene', name); continue; }
  console.log('\n=== ' + name + ' :: ' + sc.note + ' ===');
  const T = await launch({ port: sc.port, width: 1280, height: 720 });
  try {
    await installProbe(T);
    if (sc.proxy) { await ctl({ reset: '1' }); await ctl(Object.fromEntries(Object.entries(sc.proxy).map(([k, v]) => [k, v === true ? '1' : String(v)]))); }
    await cold(T);
    if (sc.throttle) await throttle(T, sc.throttle);
    const url = sc.remote || (PROXY + sc.path);
    await T.nav(url);
    const rows = await sampleAt(T, sc.times, { dir: OUT, tag: name });
    let probe = await readProbe(T);
    let rep = null;
    try { rep = await T.report(); } catch (e) { rep = { err: String(e) }; }
    let res = [];
    try {
      res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(function(e){return {n:e.name.split('/').pop().slice(0,40),d:Math.round(e.startTime),end:Math.round(e.responseEnd),sz:e.transferSize,init:e.initiatorType};}))"));
    } catch (e) {}
    if (sc.proxy) await ctl({ reset: '1' });
    const sum = summarize(rows);
    out[name] = { note: sc.note, url, rows, probe, report: rep, resources: res, summary: sum };
    for (const s of sum) {
      console.log(String(s.at).padStart(5) + 's cssReady=' + String(s.cssReady).padEnd(5) + ' sheets=' + s.sheets +
        ' bootVis=' + String(s.bootVis).padEnd(5) + ' cover=' + String(s.bootCovers).padEnd(5) +
        ' hudVis=' + String(s.hudVis).padEnd(5) + ' chip=' + String(s.bctVis).padEnd(5) +
        ' leak=' + s.hiddenLeak + ' EXPOSED=' + String(s.exposed).padEnd(5) +
        ' light=' + s.lightPct + '% top=' + s.topColor + '(' + s.topPct + '%) game=' + s.game);
    }
    if (probe) console.log('probe: cssReadyAt=' + probe.cssReadyAt + ' realCssAt=' + probe.realCssAt + ' gameAt=' + probe.gameAt + ' bootGoneAt=' + probe.bootGoneAt + ' linkMedia=' + probe.linkMedia.length);
    const cssRes = res.filter((r) => /\.css/.test(r.n));
    if (cssRes.length) console.log('css arrivals(ms): ' + cssRes.map((r) => r.n.slice(0, 22) + '@' + r.end).join(' '));
  } catch (e) {
    console.log('SCENE ERROR', name, String(e).slice(0, 300));
    out[name] = { note: sc.note, error: String(e).slice(0, 500) };
  } finally {
    try { await T.close(); } catch {}
  }
}

saveJson(JSON_OUT, out);
console.log('\nwrote ' + JSON_OUT);
