import { SONGS } from '../src/engine/songs/index.js';
import { LEVELS } from '../src/assets/levels.js';
import { MUSIC_TRACKS, MUSIC_TOTAL } from '../src/game/musicTracks.js';
const s6 = SONGS.stage6, p6 = SONGS.pre6;
console.log('pre6', p6.duration.toFixed(2) + 's', p6.tracks.length + ' 轨', p6.drums.length + ' 鼓', '| stage6', s6.duration.toFixed(2) + 's', s6.tracks.length + ' 轨');
console.log('MUSIC_TOTAL', MUSIC_TOTAL, '/ tracks', MUSIC_TRACKS.length);
const l6 = LEVELS.find(l => l.id === 'stage6');
console.log('level6 musicPre =', l6.musicPre, ' music =', l6.music, ' 解析:', !!SONGS[l6.musicPre], !!SONGS[l6.music]);
console.log(MUSIC_TRACKS.map(t => t.no + ':' + t.key).join(' '));
