const fs=require('fs');
function parse(file, exportName, key){
  let s=fs.readFileSync(file,'utf8');
  s=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  s=s.replace('export const','const');
  s=s+'; module.exports='+exportName+';';
  const m={exports:{}};
  new Function('module','exports',s)(m,m.exports);
  const obj=m.exports[key];
  const out={file,title:obj.title,bpm:obj.bpm,duration:obj.duration,tail:obj.tail||null,tracks:[]};
  obj.tracks.forEach((tr,i)=>{
    out.tracks.push({i,name:tr.name||null,wave:tr.wave,gain:tr.gain,n:tr.notes.length,
      len3:tr.notes.filter(n=>n.length===3).length,
      t0:tr.notes[0][0],t1:tr.notes[tr.notes.length-1][0],
      midiMin:Math.min(...tr.notes.map(n=>n[1])),midiMax:Math.max(...tr.notes.map(n=>n[1]))});
  });
  return out;
}
const pre5=parse('src/engine/songs/tillwhen_pre5.js','TILLWHEN_PRE5','pre5');
const st5=parse('src/engine/songs/yuuga_stage5.js','YUGA_STAGE5','stage5');
fs.writeFileSync('tools/build/_base_summary.json',JSON.stringify({pre5,stage5:st5},null,1));
console.log(JSON.stringify({pre5,stage5:st5},null,1));
