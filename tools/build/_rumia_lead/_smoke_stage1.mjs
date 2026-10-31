import { launch } from '../../_pt_core.mjs';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8203';
const PORT = Number(process.env.CDP_PORT || 9598);
const T = await launch({ port: PORT, url: BASE + '/index.html' });
try {
  const ok = await T.waitFor('!!window.__game', 30000);
  if (!ok) throw new Error('game not booted');
  // 解锁音频
  await T.eval("(() => { const c = new AudioContext(); c.resume(); window.__actx = c; return c.state; })()", { awaitPromise: true });
  await T.eval("window.__game.showMusicRoom(); 1");
  await new Promise(r => setTimeout(r, 1500));
  const rep = await T.eval(`(async () => {
    const mr = window.__game.musicRoom;
    const tr = mr.tracks.find(t => t.key === 'stage1');
    if (!tr) return { err: 'track not found' };
    mr._play(tr);
    await new Promise(r => setTimeout(r, 2500));
    const a = mr.audio || window.__game.audio;
    const src = (a && (a._audioSrc || a._audioEl)) || null;
    return {
      ver: (document.querySelector('.title-ver') || {}).textContent || '',
      title: tr.title, no: tr.no, time: tr.time,
      mode: a && a._audioMode, srcUrl: a && a._audioSrc && a._audioSrc.buffer ? 'buffer' : String(a && a._audioSrcUrl || ''),
      bufDur: a && a._audioSrc && a._audioSrc.buffer ? a._audioSrc.buffer.duration : null,
      current: a && a.currentSong,
    };
  })()`, { awaitPromise: true });
  console.log(JSON.stringify(rep, null, 1));
  const mp3 = await T.eval(`fetch('/src/assets/bgm/youma_stage1.mp3?v=1.6.57').then(r => r.arrayBuffer()).then(b => b.byteLength)`, { awaitPromise: true });
  console.log('mp3 bytes', mp3);
} finally { await T.close(); }
