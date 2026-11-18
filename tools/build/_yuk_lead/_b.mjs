import fs from 'fs';
const d = JSON.parse(fs.readFileSync('tools/build/_pret_ref/necrofantasia/midi_flat.json','utf8'));
const N=d.notes;
const sel=(b0,b1,ch)=>N.filter(n=>n.ch===ch&&n.bar>=b0&&n.bar<=b1);
for(const ch of [3,6,15,2,9]){
  const a=sel(18,19,ch).map(n=>[ +( (n.beat).toFixed(2)), n.m, n.v]);
  console.log('bar18-19 ch'+ch, JSON.stringify(a));
}
const range=sel(18,33,6).map(n=>n.m);
console.log('ch6 bars18-33 n=',range.length,'min',Math.min(...range),'max',Math.max(...range));
const r3=sel(18,33,3).map(n=>n.m);
console.log('ch3 bars18-33 n=',r3.length,'min',Math.min(...r3),'max',Math.max(...r3));
