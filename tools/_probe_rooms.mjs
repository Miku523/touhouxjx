/**
 * 排行榜 / 录像回顾 / 符卡练习 三个入口的冒烟探针。
 * 用法：PT_BASE=http://127.0.0.1:8731 node tools/_probe_rooms.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '_pt/rooms';
mkdirSync(OUT, { recursive: true });

const out = [];
const ok = (name, pass, info) => {
  out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + JSON.stringify(info) : ''}`);
};

const T = await launch({ port: 9413 });

// 启动幕没揭完时按键会被 main.js:509 的 `if (!this._bootDone) return;` 吞掉
const waitBoot = async () => {
  for (let i = 0; i < 80; i++) {
    const done = await T.eval('!!window.__game?._bootDone').catch(() => false);
    if (done) return true;
    await sleep(200);
  }
  return false;
};
// 回标题会重播入场动画，动画期间第一次按键只用来跳过它，不吃热键
const skipIntro = () => T.eval('window.__game?._skipTitleIntro(); true').catch(() => {});

try {
  await T.boot();
  ok('启动幕揭幕完成（_bootDone）', await waitBoot());
  await sleep(300);

  // ── 排行榜（KeyR）
  await T.key('KeyR');
  await sleep(700);
  const rk = await T.eval(`(() => {
    const el = document.querySelector('.rk-root');
    const g = window.__game;
    return {
      found: !!el,
      hidden: el ? el.classList.contains('hidden') : null,
      text: el ? (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 220) : null,
      state: g?.state,
      roomVisible: !!g?.rankingRoom?.visible,
    };
  })()`);
  ok('KeyR 打开排行榜（.rk-root 出现且未隐藏）', rk.found && rk.hidden === false && rk.roomVisible, rk);
  ok('排行榜有内容（含难度页签文案）', !!rk.text && /难度|简单|普通|困难|狂气|EXTRA/.test(rk.text), { text: rk.text });
  await T.shot(`${OUT}/01-ranking.png`);

  // 切到「每日挑战」页
  await T.key('Tab');
  await sleep(500);
  const daily = await T.eval(`(() => {
    const el = document.querySelector('.rk-root');
    return { text: el ? (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 260) : null };
  })()`);
  ok('每日挑战页可渲染', !!daily.text && /每日|挑战|种子|seed/i.test(daily.text), daily);
  await T.shot(`${OUT}/02-daily.png`);

  await T.key('Escape');
  await sleep(800);
  const backTitle = await T.eval(`({ state: window.__game?.state, rk: !!document.querySelector('.rk-root:not(.hidden)') })`);
  ok('Esc 退出排行榜回到标题', backTitle.rk === false, backTitle);

  // ── 录像回顾（KeyV）
  await skipIntro();
  await T.key('KeyV');
  await sleep(700);
  const rr = await T.eval(`(() => {
    const el = document.querySelector('.rr');
    return {
      found: !!el,
      hidden: el ? el.classList.contains('hidden') : null,
      text: el ? (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 220) : null,
      visible: !!window.__game?.replayRoom?.visible,
    };
  })()`);
  ok('KeyV 打开录像回顾（.rr 出现且未隐藏）', rr.found && rr.hidden === false && rr.visible, rr);
  await T.shot(`${OUT}/03-replays.png`);
  await T.key('Escape');
  await sleep(800);

  // ── 符卡练习（KeyP）
  await skipIntro();
  await T.key('KeyP');
  await sleep(1400);
  const pr = await T.eval(`(() => {
    const g = window.__game;
    return {
      room: !!g?.practiceRoom,
      visible: !!g?.practiceRoom?.visible,
      state: g?.state,
    };
  })()`);
  ok('KeyP 打开符卡练习', pr.room && pr.visible, pr);
  await T.shot(`${OUT}/04-practice.png`);

  const rep = await T.report();
  ok('无 console error', rep.errors.length === 0, rep.errors.slice(0, 4));
  ok('无 4xx/5xx', rep.httpBad.filter((u) => !/favicon/.test(u)).length === 0, rep.httpBad.slice(0, 4));
} catch (e) {
  out.push('FAIL  探针异常  — ' + (e && e.message ? e.message.slice(0, 300) : String(e)));
} finally {
  console.log(out.join('\n'));
  console.log(`\n共 ${out.length} 项：PASS ${out.filter((l) => l.startsWith('PASS')).length} / FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`);
  await T.close();
}
