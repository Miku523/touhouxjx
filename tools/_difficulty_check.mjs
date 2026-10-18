// 验证难度 / 残机设置改动（独立 headless Edge，CDP）
// 用法: node tools/_difficulty_check.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const profile = mkdtempSync(join(tmpdir(), 'edge-diff-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?diffcheck=${Date.now()}` });
let ready = false;
for (let i = 0; i < 100; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot');

// 清空进度 / 设置后回到标题，保证从「未解锁」状态开始
await evaluate(`(() => {
  localStorage.removeItem('hks.progress.v1');
  localStorage.removeItem('hks.settings.v1');
  const g = window.__game;
  g.unlockedExtra = false;
  g.lives = 3;
  g.difficulty = 'N';
  g.showTitle();
  return true;
})()`);
await sleep(300);

const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(s.data, 'base64'));
};

const results = {};
results.title = await evaluate(`(() => {
  const g = window.__game;
  return {
    labels: g.menuButtons.map(b => b.innerText.replace(/\\s+/g, ' ').trim()),
    hint: g.hintEl.textContent,
    extraUnlocked: g.unlockedExtra,
  };
})()`);
await shot('_diff_title.png');

// 开始游戏 → 难度页
await evaluate(`window.__game.menuButtons[0].click()`);
results.difficulty = await evaluate(`(() => {
  const g = window.__game;
  return {
    title: g.titleEl.textContent,
    subtitle: g.subtitleEl.textContent,
    labels: g.menuButtons.map(b => b.innerText.replace(/\\s+/g, ' ').trim()),
    grid: g.buttonsEl.className,
  };
})()`);
await shot('_diff_select.png');

// 选 E → 选灵梦 → 跳过开场 → 进入第 1 面
await evaluate(`window.__game.menuButtons[0].click()`);
results.char = await evaluate(`(() => ({
  difficulty: window.__game.difficulty,
  subtitle: window.__game.subtitleEl.textContent,
}))()`);
await evaluate(`(() => { const g = window.__game; g.menuButtons[0].click(); g.dialogue.close(); return true; })()`);
results.easyStage1 = await evaluate(`(() => {
  const g = window.__game, s = g.stage;
  return {
    difficulty: g.difficulty,
    stageDifficulty: s.difficulty,
    enemyDifficulty: s.enemies?.difficulty || null,
    hpScale: s.diff.hpScale,
    lives: s.player.lives,
  };
})()`);

// E：4 / 5 面各少一张；第 6 面不存在
async function bossInfo(diffKey, index) {
  await evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diffKey)};
    g.startStage(${index});
    g.dialogue.stop();
    g.state = 'play';
    const s = g.stage;
    if (s) { s.state = 'play'; s.beginBoss(); }
    return true;
  })()`);
  return evaluate(`(() => {
    const g = window.__game, s = g.stage, b = s && s.boss;
    return b ? {
      stage: s.index + 1,
      phases: b.phases.length,
      difficulty: b.difficulty,
      hpScale: b.diff.hpScale,
      names: b.phases.map(p => p.name),
    } : {
      phaseTitle: g.titleEl.textContent,
      stage: null,
      state: g.state,
      ending: g.ending && g.ending.active ? (g.ending.spec || {}).kindLabel : null,
    };
  })()`);
}
results.easy4 = await bossInfo('E', 3);
results.easy5 = await bossInfo('E', 4);
results.easy6 = await bossInfo('E', 5);
results.normal4 = await bossInfo('N', 3);
results.normal5 = await bossInfo('N', 4);
results.normal6 = await bossInfo('N', 5);
results.hard4 = await bossInfo('H', 3);
results.hard5 = await bossInfo('H', 4);
results.hard6 = await bossInfo('H', 5);
results.lunatic6 = await bossInfo('L', 5);

// E 通关：不解锁 EX
await evaluate(`(() => {
  const g = window.__game;
  g.showTitle();
  g.difficulty = 'E';
  g.unlockedExtra = false;
  g._onAllCleared();
  return true;
})()`);
results.easyClear = await evaluate(`(() => ({
  title: window.__game.titleEl.textContent,
  state: window.__game.state,
  ending: window.__game.ending && window.__game.ending.active ? (window.__game.ending.spec || {}).kindLabel : null,
  unlockedExtra: window.__game.unlockedExtra,
  saved: localStorage.getItem('hks.progress.v1'),
}))()`);
await shot('_diff_easy_clear.png');

// E 不去锁掉已有的解锁
results.easyDoesNotRelock = await evaluate(`(() => {
  const g = window.__game;
  g.unlockedExtra = true;
  g._onAllCleared();
  return g.unlockedExtra;
})()`);

// N 通关：解锁并持久化
await evaluate(`(() => {
  const g = window.__game;
  g.showTitle();
  g.difficulty = 'N';
  g.unlockedExtra = false;
  localStorage.removeItem('hks.progress.v1');
  g._onAllCleared();
  g.dialogue.stop();
  return true;
})()`);
results.normalClear = await evaluate(`(() => ({
  unlockedExtra: window.__game.unlockedExtra,
  saved: localStorage.getItem('hks.progress.v1'),
}))()`);

// Extra：固定 H、完整 10 张
results.extra = await evaluate(`(() => {
  const g = window.__game;
  g.showTitle();
  g.unlockedExtra = true;
  g._startExtraStage();
  g.dialogue.stop();
  g.state = 'play';
  const s = g.stage;
  s.state = 'play';
  s.beginBoss();
  return { stageDifficulty: s.difficulty, phases: s.boss.phases.length, boss: s.boss.key, stageNumber: s.boss.stageNumber };
})()`);

// 设置里的残机行 + 持久化
await evaluate(`(() => { const g = window.__game; g.showTitle(); g._showSettings(0, 'title'); return true; })()`);
results.settings = await evaluate(`(() => {
  const g = window.__game;
  return {
    first: g.menuButtons[0].innerText.replace(/\\s+/g, ' ').trim(),
    labels: g.menuButtons.map(b => b.innerText.replace(/\\s+/g, ' ').trim()),
  };
})()`);
await shot('_diff_settings.png');
results.livesAdjust = await evaluate(`(() => {
  const g = window.__game;
  g._adjustLives(1);
  return { lives: g.lives, saved: JSON.parse(localStorage.getItem('hks.settings.v1')).lives };
})()`);

// 设置里的残机应进入下一局：1 面玩家的命数跟随设置
results.livesNextRun = await evaluate(`(() => {
  const g = window.__game;
  g.showTitle();
  g.startStage(0);
  g.dialogue.stop();
  g.state = 'play';
  return { setting: g.lives, playerLives: g.stage.player.lives };
})()`);

// 运行 15 秒弹幕，确认难度倍率 / 裁剪后没有运行时异常
async function stress(key, index, extra = false) {
  await evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.unlockedExtra = true;
    g.difficulty = ${JSON.stringify(key)};
    ${extra ? 'g._startExtraStage();' : `g.startStage(${index});`}
    g.dialogue.stop();
    g.state = 'play';
    const s = g.stage;
    s.state = 'play';
    s.beginBoss();
    const b = s.boss;
    b.state = 'battle';
    b.introT = 2;
    b.alpha = 1;
    b.spellLock = 0;
    return true;
  })()`);
  return evaluate(`(() => {
    const g = window.__game, s = g.stage, b = s.boss;
    for (let i = 0; i < 900; i++) b.update(1 / 60, s.player, s.bullets, s.fx, {});
    return {
      phase: b.spellIdx, count: b.phaseCount, bullets: s.bullets.activeCount,
      volleys: b.volleys, hp: Math.round(b.spellHp), state: b.state,
    };
  })()`);
}
results.stress = {
  E4: await stress('E', 3),
  N6: await stress('N', 5),
  H5: await stress('H', 4),
  L6: await stress('L', 5),
  Extra: await stress('H', 0, true),
};

console.log(JSON.stringify(results, null, 2));

// 基础断言
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAIL: ' + msg); };
assert(results.difficulty.labels.length === 6, '难度页应有 4 难度 + 详情 + 返回');
assert(results.difficulty.labels[0].startsWith('E'), '第一项应为 E');
assert(results.difficulty.labels[3].startsWith('L'), '第四项应为 L');
assert(results.easyStage1.stageDifficulty === 'E', 'E 局关卡难度应为 E');
assert(results.easyStage1.enemyDifficulty === 'easy', 'E 道中敌人应为 easy');
assert(results.easy4.phases === 4, `E 4面符卡应为4，实际 ${results.easy4.phases}`);
assert(results.easy5.phases === 5, `E 5面符卡应为5，实际 ${results.easy5.phases}`);
assert(results.easy6.stage === null && results.easy6.ending === 'EASY CLEAR ENDING',
  `E 打完第5面应直接进 EASY CLEAR 结局，实际 ${JSON.stringify(results.easy6)}`);
assert(results.normal4.phases === 4, 'N 4面应为4张');
assert(results.normal5.phases === 5, 'N 5面应为5张');
assert(results.normal6.phases === 7, `N 6面应为7张，实际 ${results.normal6.phases}`);
assert(results.hard4.phases === 5, 'H 4面应为完整5张');
assert(results.hard5.phases === 6, 'H 5面应为完整6张');
assert(results.hard6.phases === 8, 'H 6面应为完整8张');
assert(results.lunatic6.phases === 8, 'L 6面应为完整8张');
assert(results.easyClear.unlockedExtra === false, 'E 通关不应解锁');
assert(results.easyClear.saved === null || !JSON.parse(results.easyClear.saved).extraUnlocked, 'E 通关不应写入解锁');
assert(results.easyDoesNotRelock === true, 'E 通关不应把已解锁锁回去');
assert(results.normalClear.unlockedExtra === true, 'N 通关应解锁');
assert(JSON.parse(results.normalClear.saved).extraUnlocked === true, 'N 通关应持久化解锁');
assert(results.extra.stageDifficulty === 'H' && results.extra.phases === 10, 'Extra 应固定 H 且 10 张');
assert(results.extra.stageNumber === 0, 'Extra stageNumber 应为 0');
assert(results.settings.labels.some((l) => l.includes('残机')), '设置页应有残机行');
assert(results.livesAdjust.lives === 4 && results.livesAdjust.saved === 4, '残机调整为4并持久化');
assert(results.livesNextRun.setting === 4 && results.livesNextRun.playerLives === 4, '下一局应按设置给4条残机');
for (const [name, r] of Object.entries(results.stress)) {
  assert(r.state === 'battle', `${name} 15秒后仍在战斗`);
  assert(Number.isFinite(r.hp) && r.hp > 0, `${name} 符卡血量应有效`);
  assert(r.volleys > 0, `${name} 应至少发射一轮弹幕`);
}

console.log('ALL DIFFICULTY CHECKS PASSED');
ws.close();
proc.kill();
await sleep(300);
process.exit(0);
