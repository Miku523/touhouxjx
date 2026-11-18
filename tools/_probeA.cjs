const fs=require('fs'),path=require('path');
const out={};
const mt=fs.readFileSync('src/game/musicTracks.js','utf8');
// parse entries roughly
const entries=[];
const re=/\{\s*key:\s*'([^']+)'[\s\S]*?\n  \},/g;let m;
while((m=re.exec(mt))){entries.push({key:m[1],block:m[0].slice(0,900)});}
out.entries=entries.map(e=>({key:e.key,title:(e.block.match(/title:\s*'([^']*)'/)||[])[1],sub:(e.block.match(/sub:\s*'([^']*)'/)||[])[1],cat:(e.block.match(/cat:\s*'([^']*)'/)||[])[1],place:(e.block.match(/place:\s*'([^']*)'/)||[])[1],orig:(e.block.match(/orig:\s*'([^']*)'/)||[])[1],time:(e.block.match(/time:\s*([\d.]+)/)||[])[1]}));
// midi files
const walk=(dir,acc)=>{for(const f of fs.readdirSync(dir,{withFileTypes:true})){if(f.name==='node_modules'||f.name==='.git')continue;const p=path.join(dir,f.name);if(f.isDirectory()){if(acc.length<400)walk(p,acc);}else if(/\.(mid|midi)$/i.test(f.name))acc.push(p);}};
const mids=[];walk('.',mids);out.midiCount=mids.length;out.midis=mids.slice(0,80);
const dirs=fs.readdirSync('tools/build',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
out.buildDirs=dirs;
fs.writeFileSync('tools/build/_yuk_kit/_probeA.json',JSON.stringify(out,null,1));
console.log('ok');
