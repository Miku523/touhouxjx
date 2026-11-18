const {execFileSync}=require('child_process'),fs=require('fs');
const g=(a)=>{try{return execFileSync('git',a,{encoding:'utf8',maxBuffer:1e8}).trim()}catch(e){return 'ERR'}};
const out={};
out.headPhRefs=(g(['grep','-n','-i','ph_boss','HEAD']).split('\n').filter(Boolean)).slice(0,10);
out.headPhStage=(g(['grep','-rn','-i','"ph"','HEAD','--','src/game/']).split('\n').filter(Boolean)).slice(0,10);
out.jobs='';
fs.writeFileSync('tools/build/_yuk_kit/_probe6.json',JSON.stringify(out,null,1));
console.log('ok');
