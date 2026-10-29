import { launch } from '../_pt_core.mjs';
const BASE = 'http://127.0.0.1:8140';
const T = await launch({ port: 9553, url: BASE + '/index.html' });
const out = {};
try {
  await T.waitFor('!!window.__game', 60000);
  out.ver = await T.eval("document.querySelector('.title-ver')?.textContent || ''");
  out.song = await T.eval(`(async () => {
    const m = await import('./src/engine/songs/index.js');
    await m.ensureSong('extra');
    const s = m.getSong('extra');
    return { title: s.title, dur: s.duration, bpm: s.bpm, tracks: s.tracks.length, drums: s.drums.length, audio: s.audio || null };
  })()`, { awaitPromise: true });
  out.fetch = await T.eval(`(async () => {
    const r = await fetch('src/assets/bgm/flandre_devil.mp3?v=1.6.33');
    const b = await r.arrayBuffer();
    return { status: r.status, ct: r.headers.get('content-type'), bytes: b.byteLength };
  })()`, { awaitPromise: true });
  out.track = await T.eval(`(async () => {
    const mt = await import('./src/game/musicTracks.js');
    const t = mt.MUSIC_TRACKS.find(x => x.key === 'extra');
    return { no: t.no, title: t.title, sub: t.sub, orig: t.orig, time: t.time, tone: t.tone };
  })()`, { awaitPromise: true });
  out.i18nEn = await T.eval(`(async () => {
    const { setLang, tr } = await import('./src/i18n/index.js');
    const mt = await import('./src/game/musicTracks.js');
    const t = mt.MUSIC_TRACKS.find(x => x.key === 'extra');
    setLang('en');
    return { title: tr(t.title), sub: tr(t.sub), noteHead: tr(t.note).slice(0, 90) };
  })()`, { awaitPromise: true });
  out.errors = await T.eval('JSON.stringify(window.__game?.errors || [])');
} finally {
  await T.close?.();
}
console.log(JSON.stringify(out, null, 1));
