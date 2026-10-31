
const m = await import('../../../src/engine/songs/aya_stage4_b.js');
const S = m.AYA_STAGE4?.stage4;
console.log('title', S.title, 'dur', S.duration, 'bpm', S.bpm, 'tracks', S.tracks.length, 'notes', S.tracks.reduce((a,t)=>a+t.notes.length,0), 'drums', S.drums.length, 'audio', S.audio||'(none)');
console.log(S.tracks.map(t => t.name + ':' + t.wave + ':' + t.gain + ':' + t.notes.length).join(' | '));
