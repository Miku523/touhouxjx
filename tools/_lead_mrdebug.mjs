// 音乐室鼠标路径调试
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9521, headless: true });
try {
  await T.boot({ query: '?v=mr_' + Date.now(), waitTitle: 15000 });
  const btn = await T.eval(`(() => { const b = [...document.querySelectorAll('.btn')].find(e => /音乐回忆室/.test(e.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2, cx: [...document.querySelectorAll('.btn')].indexOf(b)}; })()`);
  console.log('btn', btn);
  if (btn) await T.mouse(btn.x, btn.y);
  await sleep(900);
  const s = await T.eval('({mr: !!document.querySelector(".mr"), hidden: document.querySelector(".mr")?.classList.contains("hidden"), state: window.__game.state, page: window.__game._page, rows: document.querySelectorAll(".mr-row").length, ov: !document.querySelector("#overlay").classList.contains("hidden")})');
  console.log('musicState', s);
  const rowsType = await T.eval('(() => { const a = [...document.querySelectorAll(".mr-row")].map(r => !r.classList.contains("is-locked") ? "k" : "L"); return {joined: a.join(""), len: a.length, t: typeof a.join("")}; })()');
  console.log('rowsType', rowsType);
  const row0 = await T.eval('(() => { const r = document.querySelector(".mr-row"); if (!r) return null; const b = r.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height}; })()');
  console.log('row0', row0);
  if (row0) await T.mouse(row0.x, row0.y);
  await sleep(600);
  const after = await T.eval('({mrIdx: window.__game.musicRoom.index, playing: window.__game.musicRoom.isPlaying, state: document.querySelector(".mr-state").textContent, title: document.querySelector(".mr-title").textContent})');
  console.log('afterRow', after);
  await T.shot('_pt/lead_r3/mr_debug.png');
  const rep = await T.report({});
  console.log('errors', rep.errors);
} finally { await T.close().catch(() => {}); }
