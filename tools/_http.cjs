const http=require('http');
const get=(path)=>new Promise((res)=>{http.get({host:'127.0.0.1',port:8251,path},(r)=>{let n=0;r.on('data',c=>{n+=c.length});r.on('end',()=>res(path+' '+r.statusCode+' bytes='+n));}).on('error',e=>res(path+' ERR '+e.message));});
(async()=>{
const a=await get('/index.html');
const b=await get('/src/assets/bgm/yukari_ph.mp3');
const c=await get('/src/engine/songs/yukari_ph.js');
const d=await get('/src/engine/songs/index.js');
require('fs').writeFileSync('tools/build/_yuk_kit/_http.json',JSON.stringify({a,b,c,d},null,1));
})();
