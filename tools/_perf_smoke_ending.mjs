/**
 * 结局路径冒烟：_playEnding 动态加载 ending.js + endings.js → 演出推进 → 回到标题。
 * 用法：node tools/_perf_smoke_ending.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9576, width: 1280, height: 720 });
const out = (k, v) => console.log(`  ${k.padEnd(30)} ${v}`);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('http://127.0.0.1:8138/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.waitFor('window.__game.state === "menu" && window.__game._bootDone === true', 20000);
  await sleep(600);
  out('初始 ending', await T.eval('String(window.__game.ending)'));

  // 假装是灵梦通关（endingFor 只认 char/mode）
  await T.eval('window.__game.char = "reimu"');
  const t0 = Date.now();
  await T.eval('window.__game._playEnding("bad")');
  out('state 立刻切换', await T.eval('window.__game.state'));
  const ok = await T.waitFor('!!window.__game.ending && window.__game.state === "ending"', 15000);
  out('结局模块载入', ok + '  ' + (Date.now() - t0) + 'ms');
  out('ending ctor', await T.eval('window.__game.ending?.constructor?.name'));

  // 跑几秒动画，确认 draw/update 不炸
  await sleep(2500);
  out('演出中', JSON.stringify(await T.eval(
    '({state:window.__game.state, t:Math.round(window.__game.t||0)})')));
  await T.shot('_perf/smoke_ending.png');

  // Enter 一段段推，最多 80 次；推不动就 skipToCard 强制跳到结局卡
  let back = false;
  for (let i = 0; i < 80; i++) {
    await T.key('Enter');
    await sleep(420);
    if (await T.eval('window.__game.state') === 'menu') { back = true; break; }
    if (i === 30) await T.eval('window.__game.ending?.skipToCard?.()');
    if (i === 55) await T.eval('window.__game.ending?.skipToCard?.()');
  }
  if (!back) {
    out('Enter 未推完，改强制 finish', '');
    await T.eval('window.__game.ending?.skipToCard?.(); window.__game.ending?.advance?.();');
    await sleep(1500);
  }
  out('结局后', await T.eval('window.__game.state + " ending=" + String(!!window.__game.ending)'));

  // 二次触发，验证模块复用（不该再走网络）
  await T.eval('window.__game._playEnding("good")');
  const ok2 = await T.waitFor('window.__game.state === "ending"', 8000);
  await sleep(1200);
  out('二次结局', ok2 + ' state=' + await T.eval('window.__game.state'));
  await T.eval('window.__game.ending?.skipToCard?.()');

  const rep = await T.report();
  console.log('\n错误：' + (rep.errors.length ? rep.errors.join('\n  ') : '无'));
  console.log('网络失败：' + (rep.netFails?.length ? JSON.stringify(rep.netFails.slice(0, 5)) : '无'));
  console.log('4xx/5xx：' + (rep.httpBad?.length ? JSON.stringify(rep.httpBad.slice(0, 5)) : '无'));
  const endingReqs = (rep.resources || []).filter((r) => /game\/ending/.test(r.url || '')).length;
  console.log('结局模块请求数：' + endingReqs);
  console.log('\n结论：' + (rep.errors.length === 0 && rep.httpBad?.length === 0 && ok ? 'PASS' : 'FAIL'));
} catch (e) {
  console.log('FATAL: ' + String(e).slice(0, 600));
  console.log('errors: ' + (T.errors || []).slice(0, 5).join(' || '));
} finally {
  await T.close();
}
