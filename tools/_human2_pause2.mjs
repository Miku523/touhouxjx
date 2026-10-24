import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9634, headless: true });
await T.boot();
const L = [];
const sel = () => T.eval(`(() => { const ov = document.getElementById('overlay'); const bs = [...ov.querySelectorAll('.btn')];
  const i = bs.findIndex(b => b.classList.contains('sel'));
  return { st: window.__game.state, i, t: bs[i] ? bs[i].innerText.replace(/\\s+/g,' ').trim().slice(0,30) : null,
    list: bs.map(b => b.innerText.replace(/\\s+/g,' ').trim().slice(0,24)), text: ov.innerText.replace(/\\s+/g,' ').trim().slice(0,240) }; })()`);
const pick = async (needle) => {
  for (let i = 0; i < 10; i++) { await T.key('ArrowUp', 30); await sleep(60); }
  for (let i = 0; i < 30; i++) {
    const s = await sel();
    if (s.t && s.t.includes(needle)) { await T.key('Enter'); await sleep(500); return true; }
    await T.key('ArrowDown', 30); await sleep(90);
  }
  return false;
};
const enterStage = async () => {
  await T.key('Enter'); await sleep(600);   // 标题 → 难度
  await T.key('KeyE'); await sleep(500);    // EASY
  await T.key('Enter'); await sleep(800);   // 角色选择 → 对话
  for (let i = 0; i < 60; i++) {
    const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`);
    if (!on) break;
    await T.key('Enter', 40); await sleep(170);
  }
  await sleep(500);
};
const stageInfo = () => T.eval(`(() => { const g = window.__game; const st = g.stage; return { st: g.state, x: st && st.player ? Math.round(st.player.x) : null, lives: g.lives, continues: g.continues, stageNo: g.stageNo }; })()`);

// —— 进入第 1 面 ——
await enterStage();
L.push({ got: 'stage', ...(await stageInfo()) });
// —— 暂停 → 重新开始本关（正确选中） ——
await T.key('Escape'); await sleep(400);
L.push({ pause: await sel() });
const okRestart = await pick('重新开始本关');
await sleep(700);
L.push({ restartPressed: okRestart, ...(await stageInfo()) });
await T.shot('_pt/human2/70_restart.png');
for (let i = 0; i < 60; i++) {
  const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`);
  if (!on) break;
  await T.key('Enter', 40); await sleep(170);
}
await sleep(400);

// —— 暂停 → 设置 → 音乐音量 ← 一次（80%→70%） ——
await T.key('Escape'); await sleep(400);
await pick('设置');
L.push({ settings: await sel() });
const okVol = await pick('音乐音量');
await T.key('ArrowLeft'); await sleep(300);
const vol = await T.eval(`(() => { const b = [...document.querySelectorAll('#overlay .btn')].find(x => x.innerText.includes('音乐音量')); return { txt: b.innerText.replace(/\\s+/g,' '), store: localStorage.getItem('hks.settings.v1') }; })()`);
L.push({ volChanged: vol });
await T.shot('_pt/human2/71_volume70.png');
await T.key('Escape'); await sleep(400);
L.push({ backPause: await sel() });
await T.key('Escape'); await sleep(400);
L.push({ resumed: await stageInfo() });

// —— 暂停 → 退出到标题：确认 + Esc 取消 + 再确认 ——
await T.key('Escape'); await sleep(400);
await pick('退出到标题');
L.push({ quitConfirm: await sel() });
await T.shot('_pt/human2/72_quit_confirm.png');
await T.key('Escape'); await sleep(400);
L.push({ quitCancel: await sel(), ...(await stageInfo()) });
await pick('退出到标题');
const okQuit = await pick('退出到标题');   // 确认层里再选「退出到标题」
L.push({ quitDone: okQuit, ...(await stageInfo()) });
await T.shot('_pt/human2/73_back_title.png');

// —— 重置进度：二次确认（默认取消）→ 确认 → 提示 + 存储 ——
await T.key('KeyS'); await sleep(600);
const okReset = await pick('重置进度');
L.push({ resetDialog: okReset ? await sel() : null });
await T.shot('_pt/human2/74_reset_confirm.png');
await T.key('ArrowUp'); await sleep(200);
L.push({ resetSel: await sel() });
await T.key('Enter'); await sleep(700);
const store = await T.eval(`(() => { const o = {}; for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); o[k] = localStorage.getItem(k).slice(0,120); } return o; })()`);
L.push({ afterReset: await sel(), store });
await T.shot('_pt/human2/75_after_reset.png');

// —— 键位立即生效：射击改 KeyF 后，Z 不再射击、F 射击 ——
await T.key('KeyS'); await sleep(500);
await pick('按键设置');
await pick('射击');
await T.shot('_pt/human2/76_bind_wait.png');
await T.key('KeyF'); await sleep(400);
L.push({ bound: await T.eval(`({ shootZ: window.__game.input.actionOf('KeyZ'), shootF: window.__game.input.actionOf('KeyF'), kb: localStorage.getItem('hks.keybinds.v1') })`) });
await T.key('Escape'); await sleep(300);
await T.key('Escape'); await sleep(400);
await enterStage();
const cnt = () => T.eval(`window.__game.stage ? window.__game.stage.bullets.pool.filter(b => b.active).length : -1`);
await sleep(1600); const a0 = await cnt();
await T.keyDown('KeyZ'); await sleep(700); await T.keyUp('KeyZ'); await sleep(120); const aZ = await cnt();
await sleep(1500); const b0 = await cnt();
await T.keyDown('KeyF'); await sleep(700); await T.keyUp('KeyF'); await sleep(120); const aF = await cnt();
L.push({ bulletCounts: { beforeZ: a0, afterZ: aZ, beforeF: b0, afterF: aF } });
await T.shot('_pt/human2/77_shoot_F.png');
const rep = await T.report();
L.push({ errors: rep.errors.slice(0, 5), warns: rep.warns.slice(0, 5), netFails: rep.netFails.slice(0, 5) });
console.log(JSON.stringify(L, null, 1));
await T.close();
