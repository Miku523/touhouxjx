
const m = await import('../../../src/engine/songs/aya_stage4_b.js');
const S = m.AYA_STAGE4.stage4;
const BAR = 60/154*4;
S.tracks.forEach((t, i) => {
  const ps = t.notes.map(n => n[1]);
  const med = ps.slice().sort((a,b)=>a-b)[Math.floor(ps.length/2)];
  console.log(i, 'n=' + t.notes.length, 'range=' + Math.min(...ps) + '-' + Math.max(...ps), 'med=' + med,
    'first=' + JSON.stringify(t.notes.slice(0, 4)), 'lastT=' + t.notes[t.notes.length-1][0].toFixed(2));
});
// lead = track with highest median in 70..85 and many notes
const lead = S.tracks.reduce((a,b)=> (b.notes.filter(n=>n[1]>=70&&n[1]<=90).length > a.notes.filter(n=>n[1]>=70&&n[1]<=90).length ? b : a));
console.log('lead track notes 0..40:', JSON.stringify(lead.notes.slice(0, 40).map(n=>[+(n[0]/BAR+1).toFixed(2), n[1]])));
