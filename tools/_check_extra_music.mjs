import { SONGS } from '../src/engine/songs/index.js';
import { LEVELS } from '../src/assets/levels.js';
import { MUSIC_TRACKS, MUSIC_TOTAL } from '../src/game/musicTracks.js';
const px = SONGS.ex_pre, mx = SONGS.ex_mid, bx = SONGS.extra;
console.log('ex_pre', px.duration.toFixed(2) + 's', px.tracks.length + ' 轨', px.drums.length + ' 鼓',
            '| ex_mid', mx.duration.toFixed(2) + 's', mx.tracks.length + ' 轨', mx.drums.length + ' 鼓',
            '| extra', bx.duration.toFixed(2) + 's', bx.tracks.length + ' 轨', bx.audio ? '(离线渲染 ' + bx.audio + ')' : '');
console.log('MUSIC_TOTAL', MUSIC_TOTAL, '/ tracks', MUSIC_TRACKS.length);
const lx = LEVELS.find(l => l.id === 'extra');
console.log('extra musicPre =', lx.musicPre, ' musicMid =', lx.musicMid, ' music =', lx.music,
            ' 解析:', !!SONGS[lx.musicPre], !!SONGS[lx.musicMid], !!SONGS[lx.music]);
const allNotes = (s) => [...s.tracks.flatMap(t => t.notes.map(n => n[0])), ...s.drums.map(d => d[0])];
for (const [k, s] of [['ex_pre', px], ['ex_mid', mx]]) {
  console.log(k, '循环点 t 全部 < duration:', allNotes(s).every(t => t < s.duration),
              '｜最晚音符', Math.max(...allNotes(s)).toFixed(3));
}
console.log(MUSIC_TRACKS.map(t => t.no + ':' + t.key).join(' '));
