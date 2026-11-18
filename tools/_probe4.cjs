const fs=require('fs'),cp=require('child_process');
const out={};
const sw=fs.readFileSync('sw.js','utf8');
out.precacheBgm=(sw.match(/bgm[^'"\)]*/g)||[]).slice(0,5);
out.swMentionsYuk=sw.includes('yukari_ph');
out.swLines=sw.split('\n').filter(l=>/PRECACHE|CACHE_VERSION|bgm/.test(l)).slice(0,12).map(s=>s.trim().slice(0,140));
try{out.headYuk=cp.execSync("curl -s -o /dev/null -w '%{http_code} %{size_download}' -I https://mikuascendlog.com/touhouxjx/src/assets/bgm/yukari_ph.mp3",{encoding:'utf8'}).trim();}catch(e){out.headYuk='ERR'}
try{out.pkgs=fs.readdirSync('src/assets/bgm').length;}catch(e){}
out.bgmList=fs.readdirSync('src/assets/bgm').filter(f=>f.endsWith('.mp3')).map(f=>{const s=fs.statSync('src/assets/bgm/'+f);return f+':'+s.size});
fs.writeFileSync('tools/build/_yuk_kit/_probe4.json',JSON.stringify(out,null,1));
