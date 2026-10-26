import { pathToFileURL } from 'node:url';
const root = 'C:/Users/GuSheng/Downloads/HKS/';
const load = (p) => import(pathToFileURL(root + p).href);
const { MUSIC_TRACKS } = await load('src/game/musicTracks.js');
const extra = MUSIC_TRACKS.find((t) => t.key === 'extra').note;
const pack = (await load('src/i18n/packs/en.js')).default;
const cands = Object.keys(pack).filter((k) => k.startsWith('EXTRA Boss'));
console.log('pack keys starting EXTRA Boss:', cands.length);
for (const k of cands) {
  let d = -1;
  for (let i = 0; i < Math.min(k.length, extra.length); i += 1) {
    if (k[i] !== extra[i]) { d = i; break; }
  }
  console.log('len pack=%d track=%d firstDiff=%d', k.length, extra.length, d);
  console.log('  pack :', JSON.stringify(k.slice(Math.max(0, d - 12), d + 12)));
  console.log('  track:', JSON.stringify(extra.slice(Math.max(0, d - 12), d + 12)));
}
