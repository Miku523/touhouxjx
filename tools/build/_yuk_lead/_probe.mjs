import fs from 'fs';
const d = JSON.parse(fs.readFileSync('tools/build/_pret_ref/necrofantasia/midi_flat.json','utf8'));
console.log('keys', Object.keys(d).slice(0,10));
console.log('type', Array.isArray(d)? 'array': typeof d);
const s = JSON.stringify(d).slice(0,300); console.log(s);
