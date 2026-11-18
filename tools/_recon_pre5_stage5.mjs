import fs from 'fs';
const files=['src/engine/songs/tillwhen_pre5.js','src/engine/songs/yuuga_stage5.js','src/engine/songs/aya_stage4.js'];
for(const f of files){
  const src=fs.readFileSync("C:/Users/GuSheng/Downloads/HKS"+'/'+f,'utf8');
  const m=src.match(/export\s+const\s+(\w+)\s*=\s*/);
  console.log('=== '+f+' export='+(m?m[1]:'?'));
  const head=src.slice(0,600).replace(/\n/g,' | ');
  console.log('HEAD: '+head);
  // find tracks array
  const ti=src.indexOf('tracks');
  console.log('tracksIdx='+ti);
  // crude: eval via Function after stripping export
  try{
    const body=src.replace(/export\s+const\s+\w+\s*=\s*/,'').replace(/;\s*$/,'');
    const obj=Function('return ('+body+')')();
    for(const [k,v] of Object.entries(obj)){
      console.log(' KEY '+k+' title='+v.title+' bpm='+v.bpm+' dur='+v.duration+' tracks='+(v.tracks||[]).length);
      (v.tracks||[]).forEach((t,i)=>{
        const n=t.notes||[];
        const midi=n.map(x=>x[1]);
        console.log('   ['+i+'] name='+(t.name||'-')+' wave='+(t.wave||'-')+' gain='+t.gain+' notes='+n.length+(n.length?' midi '+Math.min(...midi)+'..'+Math.max(...midi):'')+(t.kind!==undefined?' kind='+t.kind:'')+(t.drums?' DRUMMSET':''));
      });
    }
  }catch(e){ console.log(' EVAL FAIL '+e.message); }
}
