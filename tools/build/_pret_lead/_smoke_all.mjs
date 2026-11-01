import { launch } from '../../_pt_core.mjs';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8241';
const T = await launch({ port: 9653, url: BASE + '/index.html' });
const out = [];
try {
  await T.waitFor('!!window.__game', 30000);
  await new Promise(r => setTimeout(r, 1200));
  await T.key('Enter');
  await new Promise(r => setTimeout(r, 800));
  await T.eval(`(() => { const au = window.__game.audio; au.setMusic(true); return 1; })()`);
  for (const k of ['pre1','pre2','pre3','pre4','pre6']) {
    await T.eval(`window.__game.audio.playMusic('${k}')`);
    await new Promise(r => setTimeout(r, 2600));
    const rep = await T.eval(`(() => {
      const au = window.__game.audio;
      return { mode: au._audioMode, song: au.currentSong,
        dur: au._audioSrc && au._audioSrc.buffer ? +au._audioSrc.buffer.duration.toFixed(3) : null,
        src: au._audioSrc && au._audioSrc.url ? String(au._audioSrc.url).slice(-34) : null,
        t: au._audioSrc ? +((au.ctx||{}).currentTime||0).toFixed(1) : null };
    })()`);
    out.push(k + ' ' + JSON.stringify(rep));
  }
  const ver = await T.eval(`(document.querySelector('.title-ver')||{}).textContent || ''`);
  console.log(out.join('\n'));
  console.log('VER', ver);
} finally { await T.close(); }