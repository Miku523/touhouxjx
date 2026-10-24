/** 全 19 曲逐条量取版式（需先设置全部已听） */
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9626, headless: true });
try {
  await T.boot();
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(500);
  const keys = await T.eval(`window.__game.musicRoom.tracks.map(t => t.key)`);
  await T.eval(`localStorage.setItem('hks.music.v1', ${JSON.stringify(JSON.stringify({ heard: keys }))}); window.__p = 1;`);
  await T.boot();
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(400);
  await T.eval(`window.__game.showMusicRoom()`);
  await sleep(800);
  const rows = [];
  for (let i = 0; i < 19; i++) {
    await T.eval(`(() => { const m = window.__game.musicRoom; m.index = ${i}; m._paint(); m._paintList(); m._reveal(); })()`);
    await sleep(150);
    const r = await T.eval(`(() => {
      const q = s => document.querySelector(s);
      const b = el => { const x = el.getBoundingClientRect(); return { y: +x.y.toFixed(1), h: +x.height.toFixed(1), sh: el.scrollHeight, ch: el.clientHeight }; };
      const d = q('.mr-detail');
      return { cat: q('.mr-cat').textContent, title: q('.mr-title').textContent,
        titleBox: b(q('.mr-title')), tags: b(q('.mr-tags')), orig: b(q('.mr-orig')),
        note: b(q('.mr-note')), stats: b(q('.mr-stats')), detailBottom: +(d.getBoundingClientRect().bottom).toFixed(1) };
    })()`);
    rows.push(r);
  }
  console.log(JSON.stringify(rows));
  await T.shot('_pt/mr_i18n/_all_last.png');
} finally { await T.close(); }
