import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const root='C:/Users/GuSheng/Downloads/HKS/src';
const groups={};
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory()){walk(p);continue;}
 if(!/\.(js|css)$/.test(e.name))continue;
 const raw=fs.readFileSync(p);const gz=zlib.gzipSync(raw,{level:6}).length;
 const rel=path.relative(root,p).replace(/\\/g,'/');
 const key=rel.split('/').slice(0,-1).join('/')||'(root)';
 groups[key]=(groups[key]||0)+gz;
 groups['__total']=(groups['__total']||0)+gz;}}
walk(root);
Object.entries(groups).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(String(v).padStart(7),k));
