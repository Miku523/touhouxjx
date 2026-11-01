/**
 * 首屏加载测量：冷 profile + 真实网络（或本地）。记录到 __game / menu / load 的时间与传输字节。
 *
 * 用法：
 *   PT_BASE=https://mikuascendlog.com/touhouxjx node tools/_perf_measure.mjs --runs=3 --label=online
 *   node tools/_perf_measure.mjs --runs=3 --label=local        (需先起 8138 服务)
 *   node tools/_perf_measure.mjs --runs=1 --label=x --throttle   (CDP 网络限速模拟 4G/弱网)
 *
 * 产物：tools/_perf_<label>.json + .md
 */
import { launch, sleep, BASE } from './_pt_core.mjs';
import { writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const RUNS = +(argv.runs || 3);
const LABEL = argv.label || 'measure';
const THROTTLE = !!argv.throttle;
const TIMEOUT = +(argv.timeout || 180000);
const BASE_URL = (process.env.PT_BASE || BASE) + '/index.html' + (process.env.PT_QUERY ? ('?' + process.env.PT_QUERY) : '');

// 弱网档：下行 15KB/s、上行 15KB/s、RTT 400ms —— 与 tools/_slownet.mjs 台架同口径
const NET = { offline: false, latency: 400, downloadThroughput: 15360, uploadThroughput: 15360 };

const rows = [];

for (let i = 0; i < RUNS; i++) {
  const port = 9520 + i;
  const T = await launch({ port, width: 1280, height: 720 });
  try {
    await T.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (THROTTLE) await T.send('Network.emulateNetworkConditions', NET);
    // 从导航时刻开始计时
    const t0 = Date.now();
    await T.send('Page.navigate', { url: BASE_URL });
    // 统一采样：__game 出现 / 标题幕揭开 / style.css 到达 / 菜单就绪 / load 完成。
    // 揭幕时刻（title）是 1.6.49「critical CSS 内联」的核心指标：它不再等 style.css。
    const marks = { game: -1, title: -1, styleOk: -1, uiReady: -1, menu: -1, load: -1 };
    const deadline = t0 + TIMEOUT;
    while (Date.now() < deadline) {
      const s = await T.eval(`(() => {
        const g = window.__game;
        const b = window.__hksBootState ? window.__hksBootState() : null;
        return {
          game: !!g,
          title: !!(g && g._bootDone),
          styleOk: !!(b && b.css && b.css.styleOk),
          uiReady: !!(b && b.uiReady),
          menu: !!(g && g.state === "menu"),
          load: document.readyState === "complete",
        };
      })()`).catch(() => null);
      if (s) {
        const now = Date.now() - t0;
        for (const k of Object.keys(marks)) if (marks[k] < 0 && s[k]) marks[k] = now;
        // v4 全量门禁下揭幕可能远晚于 load（menu state 从构造起就是 menu），收工要等揭幕
        if (marks.title > 0 && marks.load > 0) break;
      }
      await sleep(100);
    }
    const ok = marks.game > 0;
    const tGame = marks.game, tTitle = marks.title, tStyle = marks.styleOk, tMenu = marks.menu, tLoad = marks.load;
    await sleep(500);

    const m = await T.eval(`(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const rs = performance.getEntriesByType('resource');
      let bytes = 0, encoded = 0, cnt = 0;
      const top = [];
      const byType = {};
      for (const r of rs) {
        const sz = r.transferSize || 0;
        bytes += sz; cnt++;
        const kind = r.initiatorType || 'other';
        byType[kind] = (byType[kind] || 0) + sz;
        top.push([r.name.replace(/^https?:\\/\\/[^/]+/, ''), sz, Math.round(r.duration), Math.round(r.startTime)]);
      }
      top.sort((a, b) => b[1] - a[1]);
      return {
        ttfb: Math.round(n.responseStart || 0),
        dcl: Math.round(n.domContentLoadedEventEnd || 0),
        load: Math.round(n.loadEventEnd || 0),
        bytes, cnt, byType,
        top: top.slice(0, 15),
      };
    })()`).catch((e) => ({ err: String(e).slice(0, 200) }));

    const row = {
      run: i + 1,
      gameMs: tGame, titleMs: tTitle, styleOkMs: tStyle, menuMs: tMenu, loadMs: tLoad,
      navTtfb: m.ttfb, navDcl: m.dcl, navLoad: m.load,
      bytes: m.bytes, reqs: m.cnt, byType: m.byType, top: m.top,
      errors: T.errors.slice(0, 5),
      netFails: T.netFails.filter((f) => !f.canceled).slice(0, 8),
    };
    rows.push(row);
    console.log(`[run ${i + 1}/${RUNS}] game=${tGame}ms title=${tTitle}ms styleOk=${tStyle}ms menu=${tMenu}ms load=${tLoad}ms bytes=${(m.bytes / 1024).toFixed(0)}KB reqs=${m.cnt} ttfb=${m.ttfb} dcl=${m.dcl} errors=${row.errors.length}`);
    if (row.errors.length) console.log('   errors: ' + row.errors.join(' || '));
  } catch (e) {
    rows.push({ run: i + 1, fatal: String(e).slice(0, 400) });
    console.log(`[run ${i + 1}/${RUNS}] FATAL ${String(e).slice(0, 200)}`);
  } finally {
    await T.close();
  }
}

const ok = rows.filter((r) => !r.fatal && r.gameMs > 0);
const med = (k) => {
  const v = ok.map((r) => r[k]).filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : -1;
};
const sum = {
  label: LABEL, base: BASE_URL, throttle: THROTTLE, runs: RUNS,
  median: { gameMs: med('gameMs'), titleMs: med('titleMs'), styleOkMs: med('styleOkMs'), menuMs: med('menuMs'), loadMs: med('loadMs'), bytes: med('bytes'), reqs: med('reqs'), navTtfb: med('navTtfb'), navDcl: med('navDcl'), navLoad: med('navLoad') },
  rows,
};
writeFileSync(`tools/_perf_${LABEL}.json`, JSON.stringify(sum, null, 2));

const md = [];
md.push(`# 首屏测量 · ${LABEL}`);
md.push('');
md.push(`- 入口：${BASE_URL}`);
md.push(`- 限速：${THROTTLE ? '15KB/s · RTT400ms' : '不限速（本机真实网络）'} · 冷 profile · 缓存禁用`);
md.push(`- 运行次数：${RUNS}（成功 ${ok.length}）`);
md.push('');
md.push('## 中位');
md.push('');
md.push('| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |');
md.push('|---|---|---|---|---|---|---|---|');
md.push(`| ${med('titleMs')}ms | ${med('styleOkMs')}ms | ${med('menuMs')}ms | ${med('loadMs')}ms | ${(med('bytes') / 1024).toFixed(0)}KB | ${med('reqs')} | ${med('navTtfb')}ms | ${med('navDcl')}ms |`);
md.push('');
md.push('## 逐次');
md.push('');
md.push('| # | 揭幕 | style.css | menu | load | 字节 | 请求 |');
md.push('|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (r.fatal) md.push(`| ${r.run} | FATAL | | | | | |`);
  else md.push(`| ${r.run} | ${r.titleMs}ms | ${r.styleOkMs}ms | ${r.menuMs}ms | ${r.loadMs}ms | ${(r.bytes / 1024).toFixed(0)}KB | ${r.reqs} |`);
}
const first = ok[0];
if (first && first.top) {
  md.push('');
  md.push('## 最大资源（第 1 次）');
  md.push('');
  md.push('| 资源 | 字节 | 耗时 | 起始 |');
  md.push('|---|---|---|---|');
  for (const [n, b, d, s] of first.top) md.push(`| ${n} | ${(b / 1024).toFixed(1)}KB | ${d}ms | ${s}ms |`);
  md.push('');
  md.push('## 按发起者分类字节（第 1 次）');
  md.push('');
  for (const [k, v] of Object.entries(first.byType || {})) md.push(`- ${k}: ${(v / 1024).toFixed(0)}KB`);
}
writeFileSync(`tools/_perf_${LABEL}.md`, md.join('\n'));
console.log(`\n== ${LABEL} 中位：title=${med('titleMs')}ms styleOk=${med('styleOkMs')}ms menu=${med('menuMs')}ms load=${med('loadMs')}ms bytes=${(med('bytes') / 1024).toFixed(0)}KB reqs=${med('reqs')}`);
console.log(`产物：tools/_perf_${LABEL}.json / .md`);
