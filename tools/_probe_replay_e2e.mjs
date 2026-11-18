// 录制闭环探针：开一局 stage1 → 跑若干帧 → 触发 gameover → 查 ReplayStore 是否存下 → 进录像室列表看得到
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9415 });
let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('PASS ', name, info ? ' — ' + JSON.stringify(info) : ''); }
  else { fail++; console.log('FAIL ', name, info ? ' — ' + JSON.stringify(info) : ''); }
};

try {
  await T.boot();
  for (let i = 0; i < 80; i++) {
    if (await T.eval('!!window.__game?._bootDone')) break;
    await sleep(200);
  }
  await T.eval('window.__game?._skipTitleIntro(); true');

  // 清空旧录像，保证断言干净
  await T.eval(`(async () => {
    const { ReplayStore } = await import('/src/game/replay.js');
    const s = new ReplayStore();
    const rows = await s.list();
    for (const r of rows) { try { await s.remove(r.id); } catch (e) {} }
    return rows.length;
  })()`);

  // 开一局 stage1（跳过对话），跑 60 帧左右
  const started = await T.eval(`(() => {
    const g = window.__game;
    g.startStage(0, { skipIntro: true });
    return { state: g.state, rec: !!g._recorder, active: g._recorder?.active };
  })()`);
  await sleep(1500);
  const mid = await T.eval(`(() => {
    const g = window.__game;
    return { state: g.state, active: g._recorder?.active, frames: g._recorder?.frames, hasPlayer: !!g.stage?.player };
  })()`);
  ok('开局后录制已启动', mid.active === true && mid.frames > 5, mid);

  // 直接把命打光 → gameover
  // 真的打死：残机清零 + 血清零 + 解除无敌，然后走正常受伤 → die → 掉残机 → gameover
  await T.eval(`(() => {
    const g = window.__game; const p = g.stage?.player;
    if (!p) return 'noPlayer';
    p.lives = 1; p.hearts = 0; p.invuln = 0; p.casting = false; p.alive = true;
    p.hurt(1, null, 'bullet');
    return { alive: p.alive, lives: p.lives, state: g.state };
  })()`);
  await sleep(2500);
  const over = await T.eval(`(() => { const g = window.__game; return { state: g.state, active: g._recorder?.active }; })()`);
  ok('gameover 后录制已停', over.active === false, over);

  // 等 IndexedDB 落盘
  await sleep(800);
  const rows = await T.eval(`(async () => {
    const { ReplayStore } = await import('/src/game/replay.js');
    const s = new ReplayStore();
    const rows = await s.list();
    return rows.map(r => ({ id: r.id, frames: r.frames, stage: r.meta?.stage, diff: r.meta?.difficulty, char: r.meta?.char, size: r.size }));
  })()`);
  ok('录像已写入 IndexedDB', Array.isArray(rows) && rows.length >= 1, rows);

  // 进录像室看列表
  const list = await T.eval(`(() => { const g = window.__game; g.showTitle(); g._skipTitleIntro(); g.showReplays(); return true; })()`);
  await sleep(900);
  const rr = await T.eval(`(() => { const el = document.querySelector('.rr'); return { found: !!el, hidden: el?.classList.contains('hidden'), text: (el?.innerText || '').replace(/\\s+/g, ' ').slice(0, 200) }; })()`);
  ok('录像室列出这条录像', rr.found && !rr.hidden && !/还没有录像/.test(rr.text), rr);

  // 播放这条录像
  await T.tap('Enter');
  await sleep(1200);
  const play = await T.eval(`(() => { const g = window.__game; const r = g.replayRoom; return { mode: r?.mode, frame: r?.player?.frame, total: r?.player?.data?.frames, canvas: !!r?.canvas }; })()`);
  ok('回车后进入播放态且有轨迹帧', play.mode === 'play' && play.frame > 0, play);

  const rep = await T.report();
  ok('无 console error', rep.errors.length === 0, rep.errors.slice(0, 3));
  ok('无 4xx/5xx', rep.httpBad.length === 0, rep.httpBad.slice(0, 3));
} finally {
  console.log(`\n共 ${pass + fail} 项：PASS ${pass} / FAIL ${fail}`);
  await T.close();
}
