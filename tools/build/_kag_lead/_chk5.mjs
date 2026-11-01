import { MUSIC_TRACKS } from '../../../src/game/musicTracks.js';
const t = MUSIC_TRACKS.find(x => x.key === 'stage6');
console.log('note len', t.note.length, 'time', t.time, 'title', t.title);
console.log(t.note.slice(0, 60), '...', t.note.slice(-40));
const packs = ['en','ja','zh-hant'];
for (const p of packs) {
  const m = await import('../../../src/i18n/packs/' + p + '.js');
  const D = m.default || m.PACK || Object.values(m)[0];
  const dict = (D && D.strings) ? D.strings : D;
  const hit = Object.keys(dict).filter(k => k.startsWith('六面 Boss 曲（2:42'));
  console.log(p, 'keys', typeof dict === 'object' ? Object.keys(dict).length : '?', 'hits', hit.length, hit.length ? ('val ' + String(dict[hit[0]]).length) : '');
}
const songs = await import('../../../src/engine/songs/index.js').catch(e => null);
console.log('songs module ok', !!songs);
