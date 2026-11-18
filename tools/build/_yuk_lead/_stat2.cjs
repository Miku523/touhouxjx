
const fs = require('fs');
const s = fs.readFileSync('src/engine/songs/yukari_ph2.js','utf8');
const json = s.slice(s.indexOf('{'), s.lastIndexOf('}')+1);
const o = eval('('+json+')');
// object is {ph_boss2: {...}}
const key = Object.keys(o)[0];
const d = o[key];
const tracks = d.tracks.map(t=>({name:t.name, n:t.notes.length, gain:t.gain}));
const total = tracks.reduce((a,b)=>a+b.n,0);
const drums = d.drums.length;
const kinds = {};
for (const e of d.drums) kinds[e[1]] = (kinds[e[1]]||0)+1;
console.log(JSON.stringify({key, title:d.title, duration:d.duration, bpm:d.bpm, tracks, total, drums, kinds}));
