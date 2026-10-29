import { launch } from '../_pt_core.mjs';
const T = await launch({ port: 9554, url: 'http://127.0.0.1:8140/index.html?lang=en' });
try {
  await T.waitFor('!!window.__game', 60000);
  const out = await T.eval(`(async () => {
    const i18n = await import('./src/i18n/index.js');
    await i18n.setLang('en');
    const mt = await import('./src/game/musicTracks.js');
    const t = mt.MUSIC_TRACKS.find(x => x.key === 'extra');
    return { lang: document.documentElement.lang, title: i18n.tr(t.title), sub: i18n.tr(t.sub), orig: i18n.tr(t.orig), noteHead: i18n.tr(t.note).slice(0, 120) };
  })()`, { awaitPromise: true });
  console.log(JSON.stringify(out, null, 1));
} finally { await T.close?.(); }
