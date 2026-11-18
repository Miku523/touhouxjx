/**
 * 复现 _lead_smoke.mjs 的两条 FAIL（难度页 Enter 后 stage 未建 / BGM 还是 title）。
 * 记录 Enter 之后每一秒的 state / stage / song，看清停在哪一步。
 * 用法：PT_BASE=http://127.0.0.1:8731 node tools/_probe_enter.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9416 });
const trace = [];
try {
  await T.boot();
  for (let i = 0; i < 80; i++) {
    if (await T.eval('!!window.__game?._bootDone')) break;
    await sleep(200);
  }
  trace.push(['booted', await T.eval('({state:__game.state, page:__game._page, bootDone:__game._bootDone})')]);

  // 照 smoke 的做法：先等标题页，再 Enter 进难度页
  await T.key('Enter');
  await sleep(600);
  trace.push(['after Enter#1', await T.eval('({state:__game.state, page:__game._page, stage:!!__game.stage, song:__game.audio?.soundingSong ?? __game.audio?.currentSong ?? null})')]);

  // smoke 用的 waitFor 轮询 + 反复 Enter
  for (let i = 0; i < 8; i++) {
    const ok = await T.waitFor('window.__game.state === "play"', 700);
    if (ok) { trace.push([`play@iter${i}`, true]); break; }
    await T.key('Enter');
    await sleep(320);
    trace.push([`after Enter#${i + 2}`, await T.eval(`({
      state: __game.state,
      page: __game._page,
      stage: !!__game.stage,
      char: __game.char,
      diff: __game.difficulty,
      song: __game.audio?.soundingSong ?? __game.audio?.currentSong ?? null,
      dlg: !!__game.dialogue?.active,
      dlgIdx: __game.dialogue?.index ?? null,
    })`)]);
  }

  await sleep(2500);
  trace.push(['final', await T.eval(`({
    state: __game.state, page: __game._page, stage: !!__game.stage,
    song: __game.audio?.soundingSong ?? __game.audio?.currentSong ?? null,
    dlgActive: !!__game.dialogue?.active,
    dlgScriptLen: __game.dialogue?.script?.length ?? null,
    dlgIndex: __game.dialogue?.index ?? null,
  })`)]);

  // 再按几次 Enter 看对话能不能推进
  for (let i = 0; i < 6; i++) {
    await T.key('Enter');
    await sleep(400);
    const s = await T.eval('({state:__game.state, dlgIndex:__game.dialogue?.index ?? null, song:__game.audio?.soundingSong ?? null})');
    trace.push([`enter#${i} in dialogue`, s]);
    if (s.state === 'play') break;
  }
} catch (e) {
  trace.push(['ERROR', String(e && e.message || e).slice(0, 300)]);
} finally {
  for (const [k, v] of trace) console.log(k, '→', JSON.stringify(v));
  await T.close();
}
