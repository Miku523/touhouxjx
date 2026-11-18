import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0=(7-1)*bar, t1=22*bar;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const w = n => n.filter(x=>x[0]>=t0&&x[0]<t1);
const lead=w(tr['lead']), harp=w(tr['harpsi']), arp=w(tr['arp']), cnt=w(tr['counter']);
const near = (list,t,win=0.06)=> list.filter(n=>Math.abs(n[0]-t)<=win).map(n=>n[1]);
const iv = (a,b)=>{const d=((a-b)%12+12)%12; return Math.min(d,12-d);};
const stat=(name,list)=>{const h={}; for(const n of lead){ for(const m of near(list,n[0])){ const i=iv(n[1],m); h[i]=(h[i]||0)+1; } } return h;};
console.log('lead-vs-harpsi(6%%)', JSON.stringify(stat('h',harp)));
console.log('lead-vs-arp', JSON.stringify(stat('a',arp)));
console.log('lead-vs-counter', JSON.stringify(stat('c',cnt)));
// how many harpsi notes total in window and their pc histogram
const pcOf=l=>{const h={}; for(const n of l) h[n[1]%12]=(h[n[1]%12]||0)+1; return h;};
console.log('harpPC', JSON.stringify(pcOf(harp)), 'n=',harp.length);
console.log('arpPC ', JSON.stringify(pcOf(arp)), 'n=',arp.length);
