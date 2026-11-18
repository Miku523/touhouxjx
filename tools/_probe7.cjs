const {execFileSync}=require('child_process'),fs=require('fs');
const g=(a)=>{try{return execFileSync('git',a,{encoding:'utf8',maxBuffer:1e8}).trim()}catch(e){return 'ERR '+String(e.stderr||e.message).slice(0,150)}};
const out={};
out.phBossRefs=g(['grep','-n','-I','-i','ph_boss']).split('\n').slice(0,12);
out.phStage=g(['grep','-n','-I','ex_boss\|phBoss\|PH Boss']).split('\n').slice(0,10);
out.stageKeys=g(['grep','-n','-I',"id: 'stage",'--','src']).split('\n').slice(0,20);
fs.writeFileSync('tools/build/_yuk_kit/_probe7.json',JSON.stringify(out,null,1));
console.log('ok');
