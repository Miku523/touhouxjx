// 线上旧代码（1.6.41）用户视角复现：1920x1080 + 真实网络，冷缓存
// 输出 tools/shots/net_deployed_user/*.png + tools/reports/net_deployed_user.json
import { launch, sleep } from './_pt_core.mjs';
import { installProbe, readProbe, sampleAt, cold, judge, saveJson } from './_x_blanklib.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots/net_deployed_user';
mkdirSync(OUT, { recursive: true });
const T = await launch({ port: 9479, width: 1920, height: 1080 });
const out = { url: 'https://mikuascendlog.com/touhouxjx/' };
try {
  await installProbe(T);
  await cold(T);
  await T.nav(out.url);
  const rows = await sampleAt(T, [12, 20, 40], { dir: OUT, tag: 'deployed' });
  out.rows = rows.map((r) => ({ at: r.at, shot: r.shot, img: r.img, dom: r.dom, j: judge(r.dom) }));
  out.probe = await readProbe(T);
  for (const r of out.rows) {
    const d = r.dom || {}, j = r.j;
    console.log(String(r.at).padStart(4) + 's EXPOSED=' + String(j.exposed).padEnd(5) + ' cssReady=' + String(j.cssReady).padEnd(5) +
      ' bootVis=' + String(d.boot && d.boot.vis).padEnd(5) + ' hudVis=' + String(d.hud && d.hud.vis).padEnd(5) +
      ' chip=' + String(j.chipRaw).padEnd(5) + ' light=' + (r.img ? r.img.lightPct : '-') + '% top=' + (r.img ? (r.img.top[0] || {}).c : '-') +
      ' hud="' + String(d.hud && d.hud.text || '').slice(0, 60) + '" body="' + String(d.bodyText || '').slice(0, 120) + '"');
  }
  console.log('probe', JSON.stringify(out.probe && { cssReadyAt: out.probe.cssReadyAt, gameAt: out.probe.gameAt, bootGoneAt: out.probe.bootGoneAt }));
} catch (e) {
  console.log('ERR', String(e).slice(0, 300));
  out.error = String(e).slice(0, 400);
} finally { try { await T.close(); } catch {} }
saveJson('tools/reports/net_deployed_user.json', out);
console.log('wrote tools/reports/net_deployed_user.json');
