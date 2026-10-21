import { SONGS } from '../src/engine/songs/index.js';
import { LEVELS } from '../src/assets/levels.js';
import { MUSIC_TRACKS, MUSIC_TOTAL } from '../src/game/musicTracks.js';
const s5 = SONGS.stage5, p5 = SONGS.pre5;
console.log('pre5', p5.duration.toFixed(2) + 's', p5.tracks.length + ' 轨', '| stage5', s5.duration.toFixed(2) + 's', s5.tracks.length + ' 轨');
console.log('MUSIC_TOTAL', MUSIC_TOTAL, '/ tracks', MUSIC_TRACKS.length);
const l5 = LEVELS.find(l => l.id === 'stage5');
console.log('level5 musicPre =', l5.musicPre, ' music =', l5.music, ' 解析:', !!SONGS[l5.musicPre], !!SONGS[l5.music]);
console.log(MUSIC_TRACKS.map(t => t.no + ':' + t.key).join(' '));
