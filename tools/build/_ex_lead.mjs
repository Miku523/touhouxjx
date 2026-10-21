import { TEPES_EX } from '../../src/engine/songs/tepes_ex.js';
import fs from 'fs';
const s = TEPES_EX.ex_pre;
const lead = s.tracks[0].notes.map(n => [n[0], n[1], n[2]]);
fs.writeFileSync('tools/build/_ex_lead.json', JSON.stringify(lead));
console.log('lead', lead.length);
