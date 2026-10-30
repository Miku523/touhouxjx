import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('_pt/deploy_verify2', { recursive: true });
const T = await launch({ port: 9492, width: 1280, height: 720 });
const URL = 'https://mikuascendlog.com/touhouxjx/?fresh=' + Date.now();
const rows = [];
try {
  const t0 = Date.now();
  await T.nav(URL);
  let menuAt = null;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const p = await T.eval('(()=>{const b=window.__hksBootState?window.__hksBootState():null;const g=window.__game;return {state:g?g.state:null,cls:document.documentElement.className,boot:b?{css:b.cssReady,ui:b.uiReady,panel:b.panel,landed:b.css.landed}:null,navN:performance.getEntriesByType("resource").length};})()').catch(e => ({ err: String(e).slice(0,60) }));
    rows.push({ t: Date.now() - t0, ...p });
    if (p && p.state === 'menu') { menuAt = Date.now() - t0; await T.shot('_pt/deploy_verify2/menu.png'); break; }
    if (i === 5) await T.shot('_pt/deploy_verify2/t18s.png');
  }
  const rep = await T.report();
  console.log(JSON.stringify({ url: URL, menuAt: menuAt, last: rows.slice(-3), errors: rep.errors.slice(0, 8), netFails: rep.netFails.slice(0, 10), httpBad: rep.httpBad.slice(0, 10) }, null, 1));
  if (!menuAt) {
    const res = await T.eval('JSON.stringify(performance.getEntriesByType("resource").filter(r=>/main\.js|avif_manifest/.test(r.name)).map(r=>({n:r.name.split("?")[0],dur:Math.round(r.duration),size:r.transferSize,start:Math.round(r.startTime)})))').catch(()=>null);
    console.log('RES', res);
  }
} catch (e) { console.log('ERR', e && e.stack || e); }
finally { await T.close(); }
