// 校验：音乐室两条 EX 解说在 en / ja / zh-hant 三个 pack 里都有对应译文（不回退中文）。
import { pathToFileURL } from 'node:url';
const root = 'C:/Users/GuSheng/Downloads/HKS/';
const load = (p) => import(pathToFileURL(root + p).href);

const { MUSIC_TRACKS } = await load('src/game/musicTracks.js');
const exMid = MUSIC_TRACKS.find((t) => t.key === 'ex_mid');
const extra = MUSIC_TRACKS.find((t) => t.key === 'extra');
console.log('ex_mid head:', exMid.note.slice(0, 36));
console.log('extra  head:', extra.note.slice(0, 36));

const STALE = ['EXTRA 中段。圆舞曲', 'EXTRA Boss 曲。芙兰朵露', '只留远处一下一下的心跳'];
for (const lang of ['en', 'ja', 'zh-hant']) {
  const pack = (await load(`src/i18n/packs/${lang}.js`)).default;
  const keys = Object.keys(pack);
  const staleHits = keys.filter((k) => STALE.some((s) => k.startsWith(s))).length;
  console.log(
    lang.padEnd(8),
    'ex_mid:', pack[exMid.note] ? 'OK' : 'MISSING',
    '| extra:', pack[extra.note] ? 'OK' : 'MISSING',
    '| stale keys:', staleHits,
  );
  if (lang === 'en') console.log('  en extra:', pack[extra.note].slice(0, 70));
  if (lang === 'ja') console.log('  ja extra:', pack[extra.note].slice(0, 40));
}
const zh = (await load('src/i18n/packs/zh-hant.js')).default;
console.log('zh-hant extra:', zh[extra.note].slice(0, 30));
