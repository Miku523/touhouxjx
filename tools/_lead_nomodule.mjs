import { launch, saveJson, makeChecks } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';
const PORT = Number(process.env.CDP_PORT || 9487);
const OUT = '_pt/lead_nomodule';
mkdirSync(OUT, { recursive: true });
const T = await launch({ port: PORT, width: 1280, height: 720 });
const checks = makeChecks(); const c = checks.chk, eq = checks.eq;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
try {
  await T.send('Page.enable');
  await T.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__hksNoModule = true;' });
  await T.send('Network.enable');
  await T.send('Network.setBlockedURLs', { urls: ['*/src/main.js*'] });
  await T.nav(process.env.PT_BASE + '/index.html?nomod=1');
  await sleep(1600);
  const panel = await T.eval('(function(){var p=document.getElementById("hks-boot-error");if(!p)return null;return {title:(p.querySelector("div div")||{}).textContent||"",text:p.textContent.slice(0,600)};})()');
  console.log('panel@1.6s', JSON.stringify(panel));
  c(!!panel, 'panel appears fast without main.js on old browser');
  if (panel) {
    c(panel.text.indexOf('版本过旧') >= 0, 'panel says browser too old');
    c(panel.text.indexOf('ES Module') >= 0, 'panel mentions ES Module');
  }
  await T.shot(OUT + '/nomodule_panel.png');
  const leak = await T.eval('(function(){var ui=document.getElementById("ui");var bad=[];for(var i=0;i<ui.children.length;i++){var el=ui.children[i];if(el.id==="boot")continue;var cs=getComputedStyle(el);if(cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity)>0.05)bad.push(el.id||el.className);}return bad;})()');
  console.log('leak', JSON.stringify(leak));
  eq((leak||[]).length, 0, 'no raw UI leak with no-module flag');
  const s = checks.sum();
  saveJson(OUT + '/result.json', { pass: s.pass, fail: s.fail, rows: s.rows, panel, leak });
  console.log(JSON.stringify({ pass: s.pass, fail: s.fail, failed: s.rows.filter(x=>!x.ok).map(x=>x.name) }));
} catch (e) { console.error('FAIL', e && e.stack || e); process.exitCode = 1; }
finally { await T.close(); }
