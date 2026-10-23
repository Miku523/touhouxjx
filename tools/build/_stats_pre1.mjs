import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const N = n => Array.isArray(n) ? {t:n[0], m:n[1], d:n[2], v:n[3]} : {t:n.t, m:n.m, d:n.d, v:n.v};
console.log('title', s.title, '| dur', s.duration, '| bpm', s.bpm, '| drums', s.drums.length);
s.tracks.forEach((tr, i) => {
  const ns = tr.notes.map(N);
  const byOn = new Map();
  for (const n of ns) { const k = Math.round(n.t*1000); if(!byOn.has(k)) byOn.set(k, []); byOn.get(k).push(n); }
  const times = [...byOn.keys()].sort((a,b)=>a-b);
  let gap=0, span=0;
  for (let i=0;i<times.length-1;i++){ const d=Math.max(...byOn.get(times[i]).map(n=>n.d)); const nx=(times[i+1]-times[i])/1000; span+=nx; gap+=Math.max(0, nx-d); }
  const durs = ns.map(n=>n.d).sort((a,b)=>a-b);
  const md = durs.length? durs[Math.floor(durs.length/2)] : 0;
  console.log(String(i).padStart(2), tr.wave.padEnd(8), ('g='+tr.gain).padEnd(6), 'notes', String(ns.length).padStart(4), 'onsets', String(times.length).padStart(4),
    '| dur med', md.toFixed(2), 'min', (durs[0]||0).toFixed(2), 'max', (durs[durs.length-1]||0).toFixed(2),
    '| gapratio', span? (gap/span).toFixed(3) : '-');
});