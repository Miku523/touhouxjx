const {execFileSync}=require('child_process'),fs=require('fs');
const run=(args)=>{try{return execFileSync('git',args,{encoding:'utf8'}).trim()}catch(e){return 'ERR '+String(e.message).slice(0,300)}};
const out={origin:run(['log','-1','--oneline','origin/main']), counts:run(['rev-list','--left-right','--count','origin/main...HEAD']), remote:run(['remote','-v'])};
fs.writeFileSync('tools/build/_yuk_kit/_git3.json',JSON.stringify(out,null,1));
console.log('ok');
