/**
 * 第二刀冒烟：音乐回忆室按需加载 / 设置页在 pad、gamepad 为 null 时不崩。
 * 用法：node tools/_perf_smoke_ui.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9570, width: 1280, height: 720 });
const out = (k, v) => console.log(`  ${k.padEnd(30)} ${v}`);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('http://127.0.0.1:8138/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.waitFor('window.__game.state === "menu" && window.__game._bootDone === true', 20000);
  await sleep(800);
  out('pad / gamepad / musicRoom 初值', JSON.stringify(await T.eval(
    '({pad:window.__game.pad, gamepad:window.__game.gamepad, musicRoom:window.__game.musicRoom, touch:window.__game.input.touchDevice})')));

  // 设置页：pad 与 gamepad 都是 null 时的渲染路径
  await T.eval('window.__game._showSettings(0)');
  await sleep(700);
  out('设置页', JSON.stringify(await T.eval(
    '({state:window.__game.state, page:window.__game._page, rows:document.querySelectorAll(".set-row").length})')));
  await T.shot('_perf/smoke_settings.png');
  await T.key('Escape'); await sleep(600);

  // 音乐回忆室（动态 import 路径）
  const t0 = Date.now();
  await T.eval('window.__game.showMusicRoom()');
  const ok = await T.waitFor('!!window.__game.musicRoom && window.__game.musicRoom.visible', 15000);
  out('回忆室打开', ok + '  ' + (Date.now() - t0) + 'ms');
  out('musicRoom ctor', await T.eval('window.__game.musicRoom?.constructor?.name'));
  await sleep(900);
  await T.shot('_perf/smoke_musicroom.png');
  out('回忆室可见', await T.eval('String(window.__game.musicRoom?.visible)'));

  // 退出
  await T.eval('window.__game.musicRoom.hide(); window.__game._leaveMusicRoom()');
  await sleep(900);
  out('退出后', await T.eval('window.__game.state + " visible=" + String(window.__game.musicRoom?.visible)'));

  // 再进一次，验证模块复用
  await T.eval('window.__game.showMusicRoom()');
  await sleep(700);
  out('二次打开', await T.eval('String(window.__game.musicRoom?.visible)'));

  const rep = await T.report();
  console.log('\n错误：' + (rep.errors.length ? rep.errors.join('\n  ') : '无'));
  console.log('网络失败：' + (rep.netFails.length ? rep.netFails.join('\n  ') : '无'));
  console.log('4xx/5xx：' + (rep.httpBad.length ? rep.httpBad.join('\n  ') : '无'));
  console.log('\n结论：' + (rep.errors.length === 0 && rep.httpBad.length === 0 && ok ? 'PASS' : 'FAIL'));
} finally {
  await T.close();
}
