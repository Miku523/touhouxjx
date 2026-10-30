import { launch, sleep, BASE } from './_pt_core.mjs';
const T = await launch({ port: 9493, width: 1280, height: 720 });
const out = {};
try {
  await T.send('Network.enable', {});
  await T.send('Network.setBlockedURLs', { urls: ['*src/main.js*'] });
  await T.nav(BASE + '/index.html?nosw=1&autoretry=1');
  await sleep(8000);
  out.afterTwoLoads = await T.eval('(function(){var st=window.__hksBootState();return {navType:performance.getEntriesByType("navigation")[0].type,retryFlag:(function(){try{return sessionStorage.getItem("hks.autoRetry")}catch(e){return "blocked"}})(),panel:st.panel,errorShown:st.errorShown,uiReady:st.uiReady,leak:(function(){var a=[],k=document.querySelectorAll("#ui > *");for(var i=0;i<k.length;i++){if(k[i].id==="boot")continue;if(getComputedStyle(k[i]).display!=="none")a.push(k[i].id)}return a})()};})()');
  await T.shot('_pt/autoretry/panel.png');
  await T.send('Network.setBlockedURLs', { urls: [] });
  await T.eval('location.reload()');
  await sleep(4000);
  const okMenu = await T.waitFor('window.__game && window.__game.state === "menu"', 30000);
  out.recovered = okMenu;
  out.menu = await T.eval('(function(){var st=window.__hksBootState();return {cls:document.documentElement.className,state:window.__game?window.__game.state:null,retryFlag:(function(){try{return sessionStorage.getItem("hks.autoRetry")}catch(e){return "blocked"}})(),panel:st.panel};})()');
  const rep = await T.report();
  out.errors = rep.errors.slice(0, 6); out.httpBad = rep.httpBad.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.log('ERR', e && e.stack || e); }
finally { await T.close(); }
