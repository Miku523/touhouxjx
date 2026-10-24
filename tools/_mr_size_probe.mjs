import { launch, sleep } from './_pt_core.mjs';
const W = +(process.env.W || 1024), H = +(process.env.H || 600);
const T = await launch({ port: 9627, headless: true, width: W, height: H });
try {
  await T.boot();
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(500);
  const keys = await T.eval(`window.__game.musicRoom.tracks.map(t => t.key)`);
  await T.eval(`localStorage.setItem('hks.music.v1', ${JSON.stringify(JSON.stringify({ heard: keys }))}); window.__p = 1;`);
  await T.reload();
  await T.waitFor('typeof window.__p === "undefined" && !!window.__game', 20000);
  await T.waitFor('window.__game.state === "menu"', 12000);
  await sleep(600);
  await T.eval(`window.__game.showMusicRoom()`);
  await sleep(900);
  await T.shot(`_pt/mr_i18n/_w${W}_before.png`);
  const dbg = await T.eval(`({ state: window.__game.state, hasMr: !!document.querySelector('.mr'), hasTitle: !!document.querySelector('.mr-title'), head: document.querySelector('.mr-head-sub') && document.querySelector('.mr-head-sub').textContent, body: document.body.className })`);
  console.log('dbg', JSON.stringify(dbg));
  await T.eval(`(() => { const mr = window.__game.musicRoom; mr.index = 10; mr._paint(); mr._paintList(); mr._reveal(); })()`);
  await sleep(400);
  const r = await T.eval(`(() => {
    const q = s => document.querySelector(s);
    const b = el => { const x = el.getBoundingClientRect(); return { x:+x.x.toFixed(1), y:+x.y.toFixed(1), w:+x.width.toFixed(1), h:+x.height.toFixed(1), sh:el.scrollHeight, ch:el.clientHeight }; };
    return { vw: innerWidth, vh: innerHeight, s: getComputedStyle(document.documentElement).getPropertyValue('--s'),
      titleText: q('.mr-title').textContent, title: b(q('.mr-title')), tags: b(q('.mr-tags')), orig: b(q('.mr-orig')), note: b(q('.mr-note')),
      stats: b(q('.mr-stats')), detail: b(q('.mr-detail')), list: b(q('.mr-list-wrap')) };
  })()`);
  console.log(JSON.stringify(r));
  await T.shot(`_pt/mr_i18n/_w${W}.png`);
} finally { await T.close(); }
