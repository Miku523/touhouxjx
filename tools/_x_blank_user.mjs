// 复刻「用户视角」：1920x1080 视口（原始 HUD 文本才会落到左下而不是被折到屏幕外）
// 用法: node tools/_x_blank_user.mjs
import { launch, sleep } from './_pt_core.mjs';
import { installProbe, readProbe, sampleAt, throttle, cold, ctl, judge, saveJson, PROXY } from './_x_blanklib.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots/net_blank_user';
mkdirSync(OUT, { recursive: true });

const SCN = [
  { name: 'user-cssh', port: 9471, path: '/index.html?nosw=1', proxy: { cssHang: true }, times: [2, 8.5, 9.5, 12, 20, 30] },
  { name: 'user-css404', port: 9472, path: '/index.html?nosw=1', proxy: { cssStatus: 404 }, times: [1, 2, 5, 9, 15] },
  { name: 'user-slow3g', port: 9473, path: '/index.html', throttle: { latency: 600, downKBps: 40, upKBps: 12 }, times: [1, 3, 5, 8, 10, 14, 20, 30] },
  { name: 'user-csdelay', port: 9474, path: '/index.html?nosw=1', proxy: { cssDelay: 12000 }, times: [9, 11, 13, 15, 20] },
];

const out = {};
for (const sc of SCN) {
  console.log('\n=== ' + sc.name + ' (1920x1080) ===');
  const T = await launch({ port: sc.port, width: 1920, height: 1080 });
  try {
    await installProbe(T);
    if (sc.proxy) { await ctl({ reset: '1' }); await ctl(Object.fromEntries(Object.entries(sc.proxy).map(([k, v]) => [k, v === true ? '1' : String(v)]))); }
    await cold(T);
    if (sc.throttle) await throttle(T, sc.throttle);
    await T.nav(PROXY + sc.path);
    const rows = await sampleAt(T, sc.times, { dir: OUT, tag: sc.name });
    const probe = await readProbe(T);
    if (sc.proxy) await ctl({ reset: '1' });
    out[sc.name] = { rows: rows.map((r) => ({ at: r.at, shot: r.shot, img: r.img, dom: r.dom, j: judge(r.dom) })), probe };
    for (const r of out[sc.name].rows) {
      const d = r.dom || {}, j = r.j;
      console.log(String(r.at).padStart(5) + 's EXPOSED=' + String(j.exposed).padEnd(5) + ' cssReady=' + String(j.cssReady).padEnd(5) +
        ' bootCover=' + String(j.bootCovers).padEnd(5) + ' hudVis=' + String(d.hud && d.hud.vis).padEnd(5) +
        ' chip=' + String(j.chipRaw).padEnd(5) + ' light=' + (r.img ? r.img.lightPct : '-') + '% top=' + (r.img ? (r.img.top[0] || {}).c : '-') +
        ' body="' + String(d.bodyText || '').slice(0, 90) + '"');
    }
    if (probe) console.log('probe: cssReadyAt=' + probe.cssReadyAt + ' realCssAt=' + probe.realCssAt + ' gameAt=' + probe.gameAt + ' bootGoneAt=' + probe.bootGoneAt);
  } catch (e) {
    console.log('ERR', String(e).slice(0, 300));
    out[sc.name] = { error: String(e).slice(0, 400) };
  } finally { try { await T.close(); } catch {} }
}
saveJson('tools/reports/net_user.json', out);
console.log('\nwrote tools/reports/net_user.json');
