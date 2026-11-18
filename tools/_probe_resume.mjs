/**
 * 断局续玩（hks.run.v1）探针。
 * 用法：PT_BASE=http://127.0.0.1:8731 node tools/_probe_resume.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '_pt/resume';
mkdirSync(OUT, { recursive: true });

const out = [];
const ok = (name, pass, info) => {
  out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + JSON.stringify(info) : ''}`);
};

const T = await launch({ port: 9416 });

// 启动幕没揭完时按键会被 main.js 的 `if (!this._bootDone) return;` 吞掉
const waitBoot = async () => {
  for (let i = 0; i < 80; i++) {
    const done = await T.eval('!!window.__game?._bootDone').catch(() => false);
    if (done) return true;
    await sleep(200);
  }
  return false;
};
const skipIntro = () => T.eval('window.__game?._skipTitleIntro(); true').catch(() => {});

try {
  await T.boot();
  ok('启动幕揭幕完成（_bootDone）', await waitBoot());
  await sleep(300);

  // 无存档时标题页不该出现「继续上次」
  await T.eval("localStorage.removeItem('hks.run.v1'); true");
  await skipIntro();
  await T.eval('window.__game.showTitle(); true');
  await sleep(400);
  await skipIntro();
  const noSave = await T.eval(`(() => {
    const labels = (window.__game.menuButtons || []).map((b) => b._spec?.label || '');
    return { has: labels.includes('继续上次'), labels };
  })()`);
  ok('无存档时标题页没有「继续上次」', noSave.has === false, { labels: noSave.labels });
  await T.shot(`${OUT}/01-no-save.png`);

  // 造一次跨关状态：直接开第 3 面（index 2），改火力/残机，让 _saveRun() 写档
  await T.eval(`(async () => {
    const g = window.__game;
    g.difficulty = 'H';
    g.char = 'marisa';
    g.carryPower = 96;
    g.runLives = 4;
    g.carryExtend = 777;
    g.continues = 1;
    await g.startStage(2, { skipIntro: true });
    return true;
  })()`);
  await sleep(1200);
  const saved = await T.eval(`(() => {
    const raw = localStorage.getItem('hks.run.v1');
    return { raw: raw, parsed: raw ? JSON.parse(raw) : null, state: window.__game?.state };
  })()`);
  ok(
    '开局后写出 hks.run.v1',
    !!saved.parsed && saved.parsed.v === 1 && saved.parsed.levelIndex === 2,
    saved.parsed,
  );
  ok(
    '存档带全跨关字段',
    !!saved.parsed &&
      saved.parsed.difficulty === 'H' &&
      saved.parsed.char === 'marisa' &&
      saved.parsed.carryPower === 96 &&
      saved.parsed.runLives === 4 &&
      saved.parsed.carryExtend === 777 &&
      saved.parsed.continues === 1,
    saved.parsed,
  );

  // 重载页面 = 模拟玩家关掉再打开
  await T.reload();
  await sleep(1500);
  ok('重载后启动幕揭幕完成', await waitBoot());
  await sleep(300);
  const title2 = await T.eval(`(() => {
    const g = window.__game;
    const el = (g.menuButtons || []).find((b) => b._spec?.label === '继续上次');
    return {
      has: !!el,
      value: el ? el._spec?.value : null,
      hotkey: el ? el._spec?.hotkey : null,
    };
  })()`);
  ok('重载后标题页出现「继续上次」并带存档摘要', title2.has === true && !!title2.value, title2);
  ok('「继续上次」热键为 KeyC', title2.hotkey === 'KeyC', title2);
  await T.shot(`${OUT}/02-title-continue.png`);

  // 点它 → 应回到第 3 面，且火力/残机/1UP 一致
  await skipIntro();
  await T.eval(`(() => {
    const g = window.__game;
    const el = (g.menuButtons || []).find((b) => b._spec?.label === '继续上次');
    el.click();
    return true;
  })()`);
  await sleep(2500);
  const resumed = await T.eval(`(() => {
    const g = window.__game;
    return {
      state: g?.state,
      levelIndex: g?.levelIndex,
      difficulty: g?.difficulty,
      char: g?.char,
      carryPower: g?.carryPower,
      runLives: g?.runLives,
      carryExtend: g?.carryExtend,
      continues: g?.continues,
      playerPower: g?.stage?.player?.power,
      playerLives: g?.stage?.player?.lives,
      runKeyLeft: localStorage.getItem('hks.run.v1') !== null,
    };
  })()`);
  ok(
    '续玩后回到同一面且状态一致',
    resumed.state === 'play' &&
      resumed.levelIndex === 2 &&
      resumed.difficulty === 'H' &&
      resumed.char === 'marisa' &&
      resumed.carryPower === 96 &&
      resumed.runLives === 4 &&
      resumed.carryExtend === 777,
    resumed,
  );
  ok('续玩后关卡玩家确实拿到火力 96 / 残机 4', resumed.playerPower === 96, {
    playerPower: resumed.playerPower,
    playerLives: resumed.playerLives,
  });
  await T.shot(`${OUT}/03-resumed.png`);

  // 死亡即清档：此处有「重新挑战」，不该靠续玩赖着
  await T.eval(`(() => {
    const g = window.__game;
    const p = g.stage.player;
    p.lives = 1; p.hearts = 0; p.invuln = 0; p.casting = false; p.alive = true;
    p.hurt(1, null, 'bullet');
    return true;
  })()`);
  await sleep(1500);
  const dead = await T.eval(`({
    state: window.__game?.state,
    runKeyLeft: localStorage.getItem('hks.run.v1') !== null,
  })`);
  ok('游戏结束后清档', dead.state === 'gameover' && dead.runKeyLeft === false, dead);

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
