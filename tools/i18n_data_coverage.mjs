import { STORY } from '../src/game/story.js';
import { ENDINGS } from '../src/game/endings.js';
import { MUSIC_TRACKS } from '../src/game/musicTracks.js';

const packs = {
  en: (await import('../src/i18n/packs/en.js')).default,
  ja: (await import('../src/i18n/packs/ja.js')).default,
  hant: (await import('../src/i18n/packs/zh-hant.js')).default,
};

const CJK = /[\u3400-\u9fff]/;
const texts = new Set();
const walk = (v) => {
  if (typeof v === 'string') { if (CJK.test(v)) texts.add(v); return; }
  if (Array.isArray(v)) { v.forEach(walk); return; }
  if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
walk(STORY);
walk(ENDINGS);
walk(MUSIC_TRACKS);

const uniq = [...texts];
const out = { total: uniq.length };
for (const [name, k] of Object.entries(packs)) {
  const miss = uniq.filter((t) => !(t in k));
  out[name] = { covered: uniq.length - miss.length, missing: miss.length, sample: miss.slice(0, 5) };
}
console.log(JSON.stringify(out, null, 2));

// 有缺口就以退出码 1 结束，供 tools/i18n_gate.mjs / CI 使用
const gaps = ['en', 'ja', 'hant'].reduce((n, k) => n + (out[k]?.missing || 0), 0);
if (gaps > 0) process.exitCode = 1;
