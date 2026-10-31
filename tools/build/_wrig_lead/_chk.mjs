import('../../../src/engine/songs/wriggle_stage2.js').then(m => {
  const s = m.WRIGGLE_STAGE2.stage2;
  const per = {};
  for (const t of s.tracks) per[t.name] = t.notes.length;
  console.log(JSON.stringify({dur: s.duration, bpm: s.bpm, tracks: s.tracks.length, notes: s.tracks.reduce((a,t)=>a+t.notes.length,0), drums: s.drums.length, per}));
});