const fs=require('fs');
const files=['index.html','sw.js','src/ui/platform.js','src/engine/songs/index.js'];
let out=[];
for(const f of files){
  const s=fs.readFileSync(f,'utf8');
  const n=(s.match(/1\.6\.82/g)||[]).length;
  fs.writeFileSync(f, s.split('1.6.82').join('1.6.83'));
  out.push(f+' -> '+n);
}
fs.writeFileSync('tools/build/_yuk_kit/_bump.log', out.join('\n'));
console.log(out.join(' | '));
