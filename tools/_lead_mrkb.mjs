// 音乐室键盘路径回归 + 悬停锁定过期后仍可选行
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9525, headless: true });
try {
  await T.boot({ query: '?v=mrkb_' + Date.now(), waitTitle: 15000 });
  await T.eval('window.__game.showMusicRoom()');
  await sleep(600);
  await T.tap('ArrowDown'); await sleep(250); // 第 2 行（未解锁）
  const sel = await T.eval('({idx: window.__game.musicRoom.index})');
  await T.tap('Enter'); await sleep(300);
  const warn = await T.eval('({vis:!document.querySelector(".mr-warn").classList.contains("hidden"), warnIdx:window.__game.musicRoom._warn?.index})');
  await T.tap('Enter'); await sleep(600);
  const played = await T.eval('({idx: window.__game.musicRoom.index, song: window.__game.audio.currentSong, state: document.querySelector(".mr-state").textContent, warnVis: !document.querySelector(".mr-warn").classList.contains("hidden"), title: document.querySelector(".mr-title").textContent})');
  await sleep(500);
  await T.tap('ArrowDown'); await sleep(250);
  const moved = await T.eval('({idx: window.__game.musicRoom.index})');
  // 鼠标悬停（移动）到第 5 行：用 CDP Input.dispatchMouseEvent mouseMoved
  const r5 = await T.eval('(() => { const r = document.querySelectorAll(".mr-row")[4]; const b = r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()');
  await T.mouse(r5.x, r5.y); await sleep(300);
  const hovered = await T.eval('({idx: window.__game.musicRoom.index})');
  const rep = await T.report({});
  console.log(JSON.stringify({ sel, warn, played, moved, hovered, errors: rep.errors }, null, 2));
} finally { await T.close().catch(() => {}); }
