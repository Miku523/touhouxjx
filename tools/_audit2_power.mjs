// 最小复现：续命「再战 Boss」后 POWER 是否被清零（P1-01）
// 用真实链路：startStage → beginBoss → _onGameOver → _retryStage
import { launch, sleep, makeChecks, saveJson } from './_pt_core.mjs';
const PORT = Number(process.argv[2] || 9727);
const T = await launch({ port: PORT });
const C = makeChecks();
const out = {};
try {
  await T.boot({ waitTitle: true });
  // 关掉开场对话，直接进第 1 面
  await T.eval(`(() => { const g = window.__game; g.dialogue && g.dialogue.close && g.dialogue.close(); g.state='menu'; return 1; })()`);
  await T.eval(`window.__game.startStage(0)`);
  await sleep(400);
  await T.eval(`(() => { const g = window.__game; g.dialogue?.close?.(); g.state='play'; return 1; })()`);
  await sleep(200);
  // 真实开始 Boss 战（会写 _safeSpot 检查点）
  await T.eval(`(() => { const g = window.__game; g.stage.beginBoss('rumia', {}); g.state='boss'; return { bossStarted: g.stage.bossStarted, key: g.stage.boss?.key }; })()`);
  await sleep(300);
  const pre = await T.eval(`(() => { const g = window.__game, p = g.stage.player;
    p.onGround = true; p.vy = 0;
    g.carryPower = 16; p.power = 16;
    g.stage._queueBoss && 0;
    return { power: p.power, carryPower: g.carryPower, bossStarted: g.stage.bossStarted, bossKey: g.stage.boss?.key, cp: p.checkpoint }; })()`);
  out.pre = pre;
  // 真实 gameover（残机用尽），再走真实续命重开
  const go = await T.eval(`(() => { const g = window.__game; g._onGameOver(); return { state: g.state, label: g._panel?.title || null, atBoss: g._canResumeBoss() }; })()`);
  out.gameover = go;
  await sleep(300);
  const post = await T.eval(`(() => { const g = window.__game; g._retryStage(); return null; })()`);
  await sleep(900);
  const after = await T.eval(`(() => { const g = window.__game, p = g.stage?.player;
    return { state: g.state, power: p?.power ?? null, maxPower: p?.maxPower ?? null,
      bossStarted: !!g.stage?.bossStarted, bossKey: g.stage?.boss?.key ?? null,
      lives: p?.lives ?? null, continues: g.continues, carryPower: g.carryPower }; })()`);
  out.after = after;
  C.chk(go.state === 'gameover', '前置：真的进了 gameover', JSON.stringify(go));
  C.chk(after.power === 0, '复现：再战后 power=0（BUG）', JSON.stringify(after));
  C.chk(after.bossStarted === true, '前置：再战确实回到 Boss 战', JSON.stringify(after));
  out.summary = C.sum();
  saveJson('_pt/audit2/power.json', out);
  console.log(JSON.stringify(out, null, 1));
  const rep = await T.report();
  console.log('errors', JSON.stringify(rep.errors.slice(0, 4)));
} finally { await T.close(); }
