import fs from 'fs';
const d = JSON.parse(fs.readFileSync('tools/build/_pret_ref/necrofantasia/midi_flat.json','utf8'));
const N=d.notes.filter(n=>n.bar>=2&&n.bar<=3);
for (const ch of [0,1,3,15,12]) {
  const arr=N.filter(n=>n.ch===ch).map(n=>[+n.t.toFixed(3), n.m, n.v]);
  console.log('ch'+ch, JSON.stringify(arr));
}
