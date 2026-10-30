import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('_pt/deploy_verify', { recursive: true });
const URL = 'https://mikuascendlog.com/touhouxjx/?deploy=' + Date.now();
const T = await launch({ port: 9491, width: 1280, height: 720 });
function probeExpr() {
  return '(function(){' +
    'var st=(window.__hksBootState&&window.__hksBootState())||null;' +
    'var hud=document.getElementById("hud");' +
    'var leak=[];var kids=document.querySelectorAll("#ui > *");' +
    'for(var i=0;i<kids.length;i++){var el=kids[i];if(el.id==="boot")continue;var d=getComputedStyle(el).display;if(d!=="none")leak.push(el.id||el.className||el.tagName);}' +
    'var p=document.getElementById("hks-boot-error");var h=document.getElementById("hks-boot-hint");var b=document.getElementById("boot");' +
    'var g=window.__game;' +
    'return {cls:document.documentElement.className,state:g?g.state:null,ver:document.querySelector(".title-ver")?document.querySelector(".title-ver").textContent:null,' +
    'bootDisp:b?getComputedStyle(b).display:"n/a",hudDisp:hud?getComputedStyle(hud).display:"n/a",leak:leak,' +
    'panel:p?(p.textContent||"").replace(/\\s+/g," ").slice(0,60):null,hint:h?(h.textContent||"").slice(0,60):"",boot:st};' +
  '})()';
}
const rows = [];
try {
  await T.send('Network.enable', {});
  await T.send('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: 45000, uploadThroughput: 90000 });
  const t0 = Date.now();
  await T.nav(URL);
  let shots = 0;
  for (let i = 0; i < 24; i++) {
    await sleep(2000);
    let p = null;
    try { p = await T.eval(probeExpr()); } catch (e) { p = { evalError: String(e).slice(0, 80) }; }
    rows.push({ t: Date.now() - t0, ...p });
    if (i < 4 || i === 10 || i === 20) {
      try { await T.shot('_pt/deploy_verify/' + String(shots).padStart(2, '0') + '_t' + Math.round((Date.now() - t0) / 1000) + 's.png'); shots++; } catch (e) {}
    }
    if (p && p.state === 'menu' && p.cls && p.cls.indexOf('hks-ready') >= 0) break;
  }
  await T.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const done = await T.waitFor('window.__game && window.__game.state === "menu"', 60000).catch(() => false);
  await sleep(1500);
  const final = await T.eval(probeExpr());
  const rep = await T.report();
  console.log(JSON.stringify({ url: URL, samples: rows, menuAfterThrottleRelease: done, final: final, errors: rep.errors.slice(0, 5), netFails: rep.netFails.slice(0, 8), httpBad: rep.httpBad.slice(0, 8) }, null, 1));
} catch (e) { console.log('ERR', e && e.stack || e); }
finally { await T.close(); }
