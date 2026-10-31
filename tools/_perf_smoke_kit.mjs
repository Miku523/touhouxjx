/**
 * 代码分割后的冒烟：首屏到菜单 → 进难度 → 选人 → 进关 → 验证 stage/hud → 回标题 → 再进关。
 * 用法：node tools/_perf_smoke_kit.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9560, width: 1280, height: 720 });
const out = (k, v) => console.log(`  ${k.padEnd(28)} ${v}`);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('http://127.0.0.1:8138/index.html');
  const ok = await T.waitFor('!!window.__game', 40000);
  out('__game 就绪', ok);
  await T.waitFor('window.__game.state === "menu" && window.__game._bootDone === true', 20000);
  out('到菜单/揭幕', await T.eval('window.__game.state + " bootDone=" + window.__game._bootDone'));

  // 进关前 game kit 应该是异步拉下来的：等它到
  await sleep(1500);
  const kitState = await T.eval('document.getElementById("kitLoad")?.style.display || "none"');
  out('kitLoad 遮罩(此时应为 none)', kitState);

  // 标题 → 开始游戏（Enter 选第一项）
  await T.key('Enter');
  await sleep(600);
  out('state after Enter', await T.eval('window.__game.state + " page=" + window.__game._page'));

  // 难度页 → Enter 选默认难度
  await T.key('Enter');
  await sleep(800);
  out('state after 难度Enter', await T.eval('window.__game.state + " page=" + window.__game._page'));

  // 选人页 → Enter
  await T.key('Enter');
  await sleep(1500);
  const hasHud = await T.eval('!!window.__game.hud');
  out('选人后', JSON.stringify(await T.eval('({state:window.__game.state, stage:!!window.__game.stage, hud:!!window.__game.hud, page:window.__game._page})')));

  // 开场对白用 Enter 一段段推（打字机动画要时间），最多 40 次；推不动就直接开关卡（验证另一条入口）
  let inStage = false;
  for (let i = 0; i < 40; i++) {
    await T.key('Enter');
    await sleep(420);
    if (await T.eval('!!window.__game.stage')) { inStage = true; break; }
  }
  if (!inStage) {
    out('对白自动推进未进关，改直接调 startStage', '');
    await T.eval('window.__game.startStage(0)');
    await sleep(1200);
    inStage = await T.eval('!!window.__game.stage');
  }
  const hasStage = inStage;
  out('进关', JSON.stringify(await T.eval('({state:window.__game.state, stage:!!window.__game.stage, hud:!!window.__game.hud, stageCtor:window.__game.stage?.constructor?.name})')));
  // 让游戏跑 2s，确认没有异常
  await sleep(2000);
  out('对局运行 2s', JSON.stringify(await T.eval('({state:window.__game.state, t:Math.round(window.__game.t||0), bossHp: window.__game.stage?.boss?.hp ?? null})')));
  await T.shot('_perf/smoke_stage.png');

  // Esc 回标题，确认 hud 判空路径不炸
  await T.key('Escape'); await sleep(400);
  await T.key('Escape'); await sleep(1200);
  out('回标题', await T.eval('window.__game.state + " page=" + window.__game._page'));

  // 再进一次关（验证动态模块缓存复用）
  await T.key('Enter'); await sleep(500);
  await T.key('Enter'); await sleep(700);
  await T.key('Enter'); await sleep(1200);
  out('二次进关', JSON.stringify(await T.eval('({state:window.__game.state, stage:!!window.__game.stage, hud:!!window.__game.hud})')));

  const rep = await T.report();
  console.log('\n错误：' + (rep.errors.length ? rep.errors.join('\n  ') : '无'));
  console.log('网络失败：' + (rep.netFails.length ? JSON.stringify(rep.netFails.slice(0, 5)) : '无'));
  console.log('4xx/5xx：' + (rep.httpBad.length ? JSON.stringify(rep.httpBad.slice(0, 5)) : '无'));
  console.log('\n结论：' + (rep.errors.length === 0 && hasStage && hasHud ? 'PASS' : 'FAIL'));
} catch (e) {
  console.log('FATAL: ' + String(e).slice(0, 500));
  console.log('errors: ' + T.errors.slice(0, 5).join(' || '));
} finally {
  await T.close();
}
