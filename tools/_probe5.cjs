const fs=require('fs'),cp=require('child_process'),https=require('https');
const out={};
const html=fs.readFileSync('index.html','utf8').split('\n');
out.oldVerLines=html.map((l,i)=>[i+1,l]).filter(([i,l])=>/1\.6\.(42|26|51)/.test(l)).map(([i,l])=>i+': '+l.trim().slice(0,160));
out.ver86=html.filter(l=>/1\.6\.86/.test(l)).length;
const req=(url)=>new Promise(r=>{const q=https.request(url,{method:'GET',timeout:10000},res=>{let n=0;res.on('data',c=>{n+=c.length;if(n>200000)res.destroy()});res.on('end',()=>r(url+' '+res.statusCode+' len='+n));res.on('close',()=>r(url+' '+res.statusCode+' len='+n));});q.on('error',e=>r('ERR '+e.message));q.on('timeout',()=>{q.destroy();r('TIMEOUT')});q.end();});
(async()=>{
out.pages=await req('https://touhouxjx.pages.dev/index.html');
fs.writeFileSync('tools/build/_yuk_kit/_probe5.json',JSON.stringify(out,null,1));
})();
