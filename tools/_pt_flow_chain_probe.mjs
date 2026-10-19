/** 一次性探针：确认标题/难度/选人页按钮文本、第一面坐标/字段，便于写正式脚本。 */
import { sleep } from './_pt_core.mjs';
import { openGame, read, drive, ensureInvuln, warpPlatform, poll, killBoss, PORT } from './_pt_flow_chain_lib.mjs';
import { saveJson } from './_pt_core.mjs';

const T = await openGame({ port: PORT, clearStorage: true });
try {
  const out = {};
  const cur = async () => {
    const s = await read(T);
    return { state: s.state, title: s.title, buttons: s.buttons, prog: s.prog };
  };
  out.title = await cur();
  await T.shot('_pt/flow_chain/_probe/01_title.png');
  await T.key('Enter'); await sleep(700);
  out.difficulty = await cur();
  await T.shot('_pt/flow_chain/_probe/02_difficulty.png');
  await T.key('KeyE'); await sleep(700);
  out.charSelect = await cur();
  await T.shot('_pt/flow_chain/_probe/03_char.png');
  await T.key('Digit1'); await sleep(900);
  out.afterChar = await cur();
  const s1 = await drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 120000, label: 'stage1-play' });
  out.play = { state: s1.state, st: s1.st, hud: s1.hud, prog: s1.prog };
  await ensureInvuln(T);
  await T.shot('_pt/flow_chain/_probe/04_stage1.png');
  // 道中对话 26%
  out.mid1 = await warpPlatform(T, { frac: 0.30 });
  out.mid1dlg = await poll(T, `s.state === 'dialogue' || s.dlg`);
  await sleep(1200);
  out.mid1after = (await read(T)).state;
  await T.shot('_pt/flow_chain/_probe/05_mid1.png');
  // Boss 触发
  out.bossWarp = await warpPlatform(T, { boss: true });
  const bs = await drive(T, `s.st && s.st.bossStarted && s.st.boss`, { timeout: 120000, label: 'boss1' });
  out.boss1 = { boss: bs.st.boss, hud: bs.hud, state: bs.state };
  await T.shot('_pt/flow_chain/_probe/06_boss1.png');
  const kb = await killBoss(T, { label: 'boss1' });
  out.kill1 = { hits: kb.hits, st: kb.state.st.state, finished: kb.state.st.finished, bullets: kb.state.st.bullets };
  const cl = await drive(T, `s.state === 'clear'`, { timeout: 30000, label: 'clear-state', press: false }).catch(() => null);
  out.clear = cl ? { state: cl.state, stState: cl.st.state } : null;
  await T.shot('_pt/flow_chain/_probe/07_clear.png');
  const nx = await drive(T, `s.level === 1 && s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 120000, label: 'stage2' });
  out.stage2 = { level: nx.level, st: nx.st, hud: nx.hud, prog: nx.prog };
  await T.shot('_pt/flow_chain/_probe/08_stage2.png');
  saveJson('_pt/flow_chain/_probe/probe.json', out);
  console.log(JSON.stringify(out, null, 1).slice(0, 6000));
  const rep = await T.report();
  console.log('REPORT', JSON.stringify({ errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad }).slice(0, 1200));
} finally {
  await T.close();
}
