import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9488, width: 1280, height: 720 });
const checks = [];
const chk = (ok, name, detail = '') => checks.push({ ok: !!ok, name, detail });
try {
  await T.boot({ query: '?nosw=1', timeout: 40000 });
  await sleep(1200);
  let s = await T.eval('({state:window.__game.state,page:window.__game._page})');
  chk(s.state === 'menu', 'boot-menu', JSON.stringify(s));

  await T.key('Enter'); await sleep(350);
  s = await T.eval('({state:window.__game.state,page:window.__game._page})');
  chk(s.page === 'difficulty', 'difficulty-page-marker', JSON.stringify(s));

  await T.key('Escape'); await sleep(350);
  s = await T.eval('({page:window.__game._page})');
  chk(s.page === 'title', 'back-title', JSON.stringify(s));

  await T.key('Enter'); await sleep(300);
  await T.key('Enter'); await sleep(300);
  s = await T.eval('({page:window.__game._page})');
  chk(s.page === 'charselect', 'charselect-page', JSON.stringify(s));
  await T.key('Enter'); await sleep(600);
  // 推进开场对白到 play
  let st = null;
  for (let i = 0; i < 60; i++) {
    st = await T.eval('window.__game.state');
    if (st === 'play') break;
    await T.key('Enter'); await sleep(120);
  }
  chk(st === 'play', 'reach-play', st);

  await T.key('Escape'); await sleep(350);
  await T.key('KeyQ'); await sleep(350);
  s = await T.eval('({state:window.__game.state,page:window.__game._page})');
  chk(s.state === 'paused' && s.page === 'paused', 'quit-confirm-page-marker', JSON.stringify(s));
  await T.key('Escape'); await sleep(350);
  await T.key('Escape'); await sleep(350);
  s = await T.eval('({state:window.__game.state,page:window.__game._page})');
  chk(s.state === 'play', 'back-to-play', JSON.stringify(s));

  // QA-02：按键设置页方向键导航写回 _keybindIndex
  await T.eval('window.__game.showKeybinds(0)');
  await sleep(300);
  let k0 = await T.eval('window.__game._keybindIndex');
  await T.key('ArrowDown'); await sleep(150);
  await T.key('ArrowDown'); await sleep(150);
  const k2 = await T.eval('window.__game._keybindIndex');
  const sel = await T.eval('(()=>{const b=window.__game.buttonsEl.querySelector(".btn.sel");const a=b&&b._spec&&b._spec.action;return {idx:window.__game._keybindIndex,action:a,label:b&&b.querySelector(".set-label")&&b.querySelector(".set-label").textContent};})()');
  chk(k0 === 0, 'keybind-start0', String(k0));
  chk(k2 === 2 && sel.action === 'up', 'keybind-nav-sync', JSON.stringify(sel));
  // 重进页面能停在同一行
  await T.eval('window.__game.showKeybinds(window.__game._keybindIndex)'); await sleep(250);
  const sel2 = await T.eval('(()=>{const b=window.__game.buttonsEl.querySelector(".btn.sel");return b&&b._spec&&b._spec.action;})()');
  chk(sel2 === 'up', 'keybind-reenter-row', String(sel2));

  const rep = await T.report();
  chk(rep.errors.length === 0, 'no-js-errors', JSON.stringify(rep.errors).slice(0, 300));
  chk(rep.httpBad.length === 0, 'no-http-bad', JSON.stringify(rep.httpBad).slice(0, 200));
  await T.shot('_pt/lead_qa_fixes/final.png');
} catch (e) {
  chk(false, 'exception', String(e && e.stack || e));
} finally {
  const pass = checks.filter((c) => c.ok).length;
  console.log(JSON.stringify({ pass, fail: checks.length - pass, checks }, null, 1));
  await T.close();
  process.exit(pass === checks.length ? 0 : 1);
}
