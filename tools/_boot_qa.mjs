// 启动幕（开屏）回归自检：正常网 / 按键门禁 / 节流网 三段，全部断言用真加载跑
//
// 用法（先用 tools/serve_nocache.py 或任意静态服务器把仓库根目录挂到 8138）：
//   node tools/_boot_qa.mjs
//
// 检查的契约（改动 src/game/bootScreen.js 或 #boot 的 DOM 结构后要重跑）：
//   1. 进度条单调不倒退，且确实从低位起步（不是一上来就满格）
//   2. 揭幕瞬间读数必须是 100，之后 #boot 先透明、再 display:none（CSS 动画要真的停掉）
//   3. 开屏盖着时的 Enter / 方向键不许漏进标题菜单（不然会盲选到「开始游戏」）
//   4. 节流到 700 KB/s 时进度条要逐格推进、最终仍然揭幕（不能卡死或直接跳过动画）；
//      测之前必须先卸 Service Worker + 清 Cache Storage，否则二次导航全命中预缓存，节流测不到
//   5. 全程零 console error
import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT_DIR = '_pt';
mkdirSync(OUT_DIR, { recursive: true });

const T = await launch({ port: 9424, width: 1280, height: 720 });
const out = { checks: [], samples: {}, timeline: null, errors: [] };

const probe = `(() => {
  const b = document.getElementById('boot');
  const cs = b ? getComputedStyle(b) : null;
  return JSON.stringify({
    pct: window.__boot ? window.__boot.pct : -1,
    done: !!(window.__game && window.__game._boot && window.__game._boot.done),
    visible: !!b && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01,
    state: window.__game ? window.__game.state : 'n/a',
  });
})()`;

/** 每 ~55ms 读一次探针，直到启动幕收尾（done 且不可见）或超时 */
async function sampleUntilReveal(maxMs) {
  const list = [];
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const s = JSON.parse(await T.eval(probe));
      s.t = Date.now() - t0;
      list.push(s);
      if (s.done && !s.visible) break;
    } catch (e) {
      list.push({ t: Date.now() - t0, err: String(e).slice(0, 120) });
    }
    await sleep(55);
  }
  return list;
}

function check(name, ok, detail = '') {
  out.checks.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  return ok;
}

// ---------- 场景 A：正常网 ----------
await T.nav(BASE + '/index.html');
const a = await sampleUntilReveal(20000);
out.samples.normal = a;
out.timeline = JSON.parse(await T.eval('JSON.stringify(window.__boot && window.__boot.timeline || null)'));
const pcts = a.filter((s) => typeof s.pct === 'number' && s.pct >= 0).map((s) => s.pct);
let mono = true;
for (let i = 1; i < pcts.length; i++) if (pcts[i] < pcts[i - 1] - 0.5) mono = false;
const last = a[a.length - 1] || {};
check('A 进度单调不倒退', mono, 'samples=' + pcts.length);
check('A 起点不是满格', pcts.length > 2 && pcts[0] < 60, 'first=' + pcts[0] + ' n=' + pcts.length);
check('A 揭幕时 pct=100', last.pct === 100, 'pct=' + last.pct);
check('A 揭幕后 #boot 不可见', last.visible === false);
check('A 揭幕后进入菜单', last.state === 'menu', 'state=' + last.state);
check('A 总时长 >= 1.4s', last.t >= 1400, 't=' + last.t + 'ms');
await sleep(950); // 等 hide() 里 900ms 的 display:none
const bootDisplay = await T.eval(`getComputedStyle(document.getElementById('boot')).display`);
check('A 顶层 display:none 已收尾', bootDisplay === 'none', 'display=' + bootDisplay);

// ---------- 场景 B：开屏期间按键不能盲操作菜单 ----------
await T.nav(BASE + '/index.html');
await sleep(260);
await T.key('Enter');
await T.key('ArrowDown');
await sleep(2600);
const stateAfter = await T.eval('window.__game ? window.__game.state : "n/a"');
check('B 开屏期间 Enter/Arrow 被门禁吃掉', stateAfter === 'menu', 'state=' + stateAfter);

// ---------- 场景 C：节流网（慢速）----------
// 首屏跑完后 sw.js 已经装上，二次导航的请求会被 Cache Storage 全部命中——
// CDP 的网络节流对 SW 命中的响应无效（2026-10-27 实测：260KB/s 下 9.6MB 资源 128ms 返回）。
// 所以先卸 Service Worker、清 Cache Storage、关 HTTP 缓存，让这一趟真的走网络。
await T.eval(`(async () => {
  try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); } catch (e) {}
  try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) {}
  return 1;
})()`);
await T.send('Network.enable');
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 220,
  downloadThroughput: 700 * 1024,
  uploadThroughput: 700 * 1024,
  connectionType: 'cellular3g',
});
await T.nav(BASE + '/index.html');
const c = await sampleUntilReveal(60000);
out.samples.slow = c;
await T.send('Network.setCacheDisabled', { cacheDisabled: false });
await T.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const cp = c.filter((s) => typeof s.pct === 'number' && s.pct >= 0).map((s) => s.pct);
const mid = cp.filter((p) => p > 0 && p < 100).length;
const clast = c[c.length - 1] || {};
check('C 节流下进度条有中间态', mid >= 3, 'mid=' + mid);
check('C 节流下揭幕明显变慢', clast.t > 2500, 't=' + clast.t + 'ms');
check('C 节流下最终仍揭幕', clast.done === true && clast.visible === false);
check('C 节流下 pct 到 100', clast.pct === 100, 'pct=' + clast.pct);

const rep = await T.report();
out.errors = rep.errors;
check('无 console error', rep.errors.length === 0, rep.errors.slice(0, 4).join(' | '));
await T.close();

writeFileSync(OUT_DIR + '/boot_qa_report.json', JSON.stringify(out, null, 1));
const failed = out.checks.filter((c) => !c.ok);
console.log('\n' + (failed.length ? `${failed.length} FAILED` : 'ALL PASS') + ' / ' + out.checks.length + ' checks');
console.log('明细写到 ' + OUT_DIR + '/boot_qa_report.json');
if (failed.length) process.exitCode = 1;
