(async()=>{
for(const [f,k] of [['pre1','HONOU_PRE1'],['pre2','GENSHI_PRE2'],['pre3','LUNATE_PRE3'],['pre4','FALL_PRE4'],['pre6','VOYAGE_PRE6']]){
  const m=await import('../../../src/engine/songs/'+f+'.js');
  const s=m[k][f]; let notes=0,drums=0;
  for(const t of s.tracks){ for(const x of t.notes){ notes++; if(x.length>=5 && x[3]===0 && x[2]===1) drums++; } }
  console.log(f, 'dur',s.duration,'bpm',s.bpm,'tracks',s.tracks.length,'events',notes,'title',s.title);
}
})()