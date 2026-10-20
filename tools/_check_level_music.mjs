import { SONGS } from '../src/engine/songs/index.js';
import * as L from '../src/assets/levels.js';
const defs = L.LEVELS || L.LEVEL_DEFS || L.STAGE_LEVELS || Object.values(L).find(v => Array.isArray(v));
const bad = [];
for (const lv of defs) {
  for (const f of ['music', 'musicPre']) {
    if (lv[f] && !SONGS[lv[f]]) bad.push(lv.id + '.' + f + '=' + lv[f]);
  }
}
console.log('关卡数', defs.length, '曲库', Object.keys(SONGS).length);
console.log('缺失:', bad.length ? bad.join(', ') : '无');
console.log('musicPre:', defs.filter(l => l.musicPre).map(l => l.id + ':' + l.musicPre).join(' '));
