import { launch } from '../../_pt_core.mjs';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8217';
const T = await launch({ port: 9603, url: BASE + '/index.html' });
try {
  await T.waitFor('!!window.__game', 30000);
  await new Promise(r => setTimeout(r, 1200));
  await T.key('Enter');
  await new Promise(r => setTimeout(r, 800));
  const a = await T.eval(`(() => {
    const au = window.__game.audio;
    au.setMusic(true);
    au.playMusic('stage2');
    return { hasAudio: !!au, musicOn: au.musicOn, ctx: !!au.ctx, state: au.ctx && au.ctx.state };
  })()`);
  console.log('start', JSON.stringify(a));
  await new Promise(r => setTimeout(r, 3500));
  const rep = await T.eval(`(() => {
    const au = window.__game.audio;
    return {
      mode: au._audioMode, song: au.currentSong,
      dur: au._audioSrc && au._audioSrc.buffer ? au._audioSrc.buffer.duration : null,
      src: au._audioSrc && au._audioSrc.url ? String(au._audioSrc.url) : null,
      ver: (document.querySelector('.title-ver')||{}).textContent || '',
    };
  })()`);
  console.log('after', JSON.stringify(rep));
} finally { await T.close(); }
