const {execFileSync}=require('child_process');
const fs=require('fs');
const run=(args)=>{try{return execFileSync('git',args,{encoding:'utf8',cwd:process.cwd()}).trim()}catch(e){return 'ERR '+String(e.message).slice(0,200)}};
const out={log:run(['log','-6','--date=iso','--pretty=%h %ad %s']), status:run(['status','--short'])};
try{fs.mkdirSync('tools/build/_yuk_kit',{recursive:true});}catch(e){}
fs.writeFileSync('tools/build/_yuk_kit/_git2.json',JSON.stringify(out,null,1));
console.log('done');
