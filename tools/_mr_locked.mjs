import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9629, headless: true, width: 1280, height: 720 });
try {
  await T.boot();
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(500);
  await sleep(400);
  await T.eval(`window.__game.showMusicRoom()`);
  await sleep(900);
  const s = await T.eval(`(() => {
    const q = s => document.querySelector(s);
    return {
      title: q('.mr-title') && q('.mr-title').textContent,
      orig: q('.mr-orig') && q('.mr-orig').textContent,
      note: q('.mr-note') && q('.mr-note').textContent,
      head: q('.mr-head-sub') && q('.mr-head-sub').textContent,
      count: q('.mr-count') && q('.mr-count').textContent,
      rows: [...document.querySelectorAll('.mr-row')].slice(0, 4).map(r => r.textContent.trim()),
    };
  })()`);
  console.log(JSON.stringify(s, null, 1));
  await T.shot('_pt/mr_i18n/00_locked.png');
  await T.eval(`(() => { const mr = window.__game.musicRoom; mr._openWarn(6); })()`);
  await sleep(500);
  await T.shot('_pt/mr_i18n/00_warn.png');
} finally { await T.close(); }
