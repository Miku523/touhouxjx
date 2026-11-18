import { readFileSync } from 'node:fs';
const keys=['追加曲','八云紫','隙间妖蝶','幻想乡境外 · 红月与隙间','原曲「ネクロファンタジア」/ 作曲：ZUN / 编曲：Miku523（逐音搬入重配器）'];
for (const f of ['en','ja','zh-hant']){
  const m = await import('../src/i18n/packs/'+f+'.js');
  const pack = m[Object.keys(m)[0]];
  const miss = keys.filter(k=>!(k in pack));
  console.log(f, Object.keys(pack).length, 'entries; missing:', JSON.stringify(miss));
}
const mt = await import('../src/game/musicTracks.js');
const arr = Object.values(mt).find(v=>Array.isArray(v));
console.log('tracks', arr.length, 'last', JSON.stringify(arr[arr.length-1]));
