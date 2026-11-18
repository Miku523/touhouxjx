const cp=require('child_process'),fs=require('fs'),https=require('https');
const out={};
const chk=(f)=>{try{cp.execSync('node --check '+f,{stdio:'pipe'});return 'OK'}catch(e){return 'FAIL '+String(e.stderr||e.message).slice(0,300)}};
out.syntax={ idx:chk('src/engine/songs/index.js'), mt:chk('src/game/musicTracks.js'), main:chk('src/main.js'), yukmod:chk('src/engine/songs/yukari_ph.js') };
try{out.musicroom=cp.execSync('node tools/_check_musicroom.mjs',{encoding:'utf8'}).trim();}catch(e){out.musicroom='ERR '+String(e.stderr||e.message).slice(0,300)}
const head=(url)=>new Promise(r=>{const req=https.request(url,{method:'HEAD',timeout:8000},res=>{r(url.match(/\/([^/]+)$/)[1]+' '+res.statusCode+' len='+(res.headers['content-length']||'?'))});req.on('error',e=>r('ERR '+e.message));req.on('timeout',()=>{req.destroy();r('TIMEOUT')});req.end();});
(async()=>{
out.deployedYuk=await head('https://mikuascendlog.com/touhouxjx/src/assets/bgm/yukari_ph.mp3');
fs.writeFileSync('tools/build/_yuk_kit/_syntax.json',JSON.stringify(out,null,1));
})();
