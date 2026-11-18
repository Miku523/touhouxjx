import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
for (const name of ['lead','counter','strings','pad','choir','bell','brass','choir']){
  const s=(tr[name]||[]).filter(n=>n[0]>=12.8&&n[0]<=14.6).map(n=>[+n[0].toFixed(3),n[1],+n[2].toFixed(3),n[3]]);
  if(s.length) console.log(name, JSON.stringify(s));
}
console.log('--- 25.0-26.0 strings');
console.log(JSON.stringify((tr['strings']||[]).filter(n=>n[0]>=24.6&&n[0]<=26.2).map(n=>[+n[0].toFixed(3),n[1],+n[2].toFixed(3),n[3]])));
