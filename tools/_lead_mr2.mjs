// 聚焦：音乐室点击未遇曲目 -> 弹窗 -> 点「播放」是否播对曲目
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9524, headless: true });
async function center(sel) {
  return T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
}
try {
  await T.boot({ query: '?v=mr2_' + Date.now(), waitTitle: 15000 });
  await T.eval('window.__game.showMusicRoom()');
  await sleep(700);
  const rows = await T.eval('(() => [...document.querySelectorAll(".mr-row")].map((r,i)=>({i, locked:r.classList.contains("is-locked"), txt:r.textContent.replace(/\\s+/g," ").trim()})))()');
  console.log('rows', JSON.stringify(rows.slice(0, 6)));
  const lockedIdx = rows.find((r) => r.locked).i;
  const rc = await center(`.mr-row:nth-child(${lockedIdx + 1})`);
  await T.mouse(rc.x, rc.y); await sleep(400);
  const warnIdx = await T.eval('({warn: window.__game.musicRoom._warn && window.__game.musicRoom._warn.index, mrIdx: window.__game.musicRoom.index, vis: !document.querySelector(".mr-warn").classList.contains("hidden")})');
  console.log('after row click', warnIdx);
  const pb = await center('[data-act="play"]');
  console.log('play btn', pb);
  await T.mouse(pb.x, pb.y); await sleep(800);
  const after = await T.eval('({mrIdx: window.__game.musicRoom.index, song: window.__game.audio.currentSong, musicOn: window.__game.audio.musicOn, state: document.querySelector(".mr-state").textContent, title: document.querySelector(".mr-title").textContent, warnVis: !document.querySelector(".mr-warn").classList.contains("hidden")})');
  console.log('after play', after);
  // 再测：先点「取消」，再用键盘选中同一行并 Enter 播放，比较曲目
  const mr = await T.eval('({trackKeys: window.__game.musicRoom.tracks.map(t=>t.key).slice(0,6)})');
  console.log('trackKeys', mr);
} finally { await T.close().catch(() => {}); }
