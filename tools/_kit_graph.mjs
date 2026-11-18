
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const ROOT='src/';
const gz=(f)=>{try{const b=fs.readFileSync(f);return zlib.gzipSync(b,{level:6}).length;}catch{return 0}};
const parse=(f)=>{const s=fs.readFileSync(f,'utf8');const out=[];const re=/(?:import|export)\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g;let m;while(m=re.exec(s)){const t=m[1];if(!t.startsWith('.'))continue;let p=path.normalize(path.join(path.dirname(f),t));if(!fs.existsSync(p)&&fs.existsSync(p+'.js'))p+='.js';out.push(p);}return out;};
// BFS depth from kit entries
const entries=['src/game/stage.js','src/game/bullets.js'].map(p=>path.normalize(p));
const depth=new Map(); const q=entries.map(p=>[p,0]); entries.forEach(p=>depth.set(p,0));
while(q.length){const [f,d]=q.shift();for(const c of parse(f)){if(!depth.has(c)){depth.set(c,d+1);q.push([c,d+1]);}}}
const rows=[...depth].map(([f,d])=>({f,gz:gz(f),d})).sort((a,b)=>b.gz-a.gz);
const tot=rows.reduce((s,r)=>s+r.gz,0);
console.log('kit modules',rows.length,'gzip total',(tot/1024).toFixed(0)+'KB');
const byD={};rows.forEach(r=>{byD[r.d]=(byD[r.d]||0)+r.gz;});
console.log('bytes by depth',JSON.stringify(Object.entries(byD).map(([d,b])=>[d,(b/1024).toFixed(0)+'KB'])));
console.log('max depth',Math.max(...rows.map(r=>r.d)));
console.log(rows.slice(0,12).map(r=>`d${r.d} ${r.f} ${(r.gz/1024).toFixed(1)}KB`).join('\n'));
