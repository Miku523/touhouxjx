const fs=require('fs'),cp=require('child_process');
const p='src/assets/bgm/yukari_ph.mp3';
const out={};
try{const s=fs.statSync(p);out.size=s.size;out.mtime=s.mtime.toISOString();
const b=fs.readFileSync(p);out.head=b.slice(0,4).toString('hex');out.tail=b.slice(-128).slice(0,4).toString('hex');
// frame scan: count 0xFFE sync at even-ish offsets
let sync=0;for(let i=0;i<b.length-1;i++){if(b[i]===0xFF&&(b[i+1]&0xE0)===0xE0){sync++;i+=1;}}
out.syncApprox=sync;}catch(e){out.err=String(e);}
try{out.jsSize=fs.statSync('src/engine/songs/yukari_ph.js').size;}catch(e){out.jsErr=String(e);}
try{out.mp3_2=fs.statSync('src/assets/bgm/yukari_ph2.mp3').size;}catch(e){out.err2=String(e);}
try{out.indexVer=(fs.readFileSync('index.html','utf8').match(/1\.6\.\d+/g)||[]).slice(0,3);}catch(e){out.iverr=String(e);}
fs.writeFileSync('tools/build/_yuk_kit/_probe_now.json', JSON.stringify(out,null,1));
