#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9383, BASE='http://127.0.0.1:8137';
const profile=mkdtempSync(join(tmpdir(),'edge-paddesktop-'));
const proc=spawn(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port='+PORT,'--window-size=1280,720','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let page; for(let i=0;i<80;i++){try{const l=await(await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();page=l.find(t=>t.type==='page');if(page)break;}catch{}await sleep(200);} if(!page)throw new Error('no target');
const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let seq=0;const pending=new Map();ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}};
const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,{res:r,rej:j});ws.send(JSON.stringify({id,method,params}));});
const evalJS=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,800));return r.result&&r.result.value;};
await send('Page.enable');await send('Runtime.enable');await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false,screenWidth:1280,screenHeight:720});
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
await send('Page.navigate',{url:BASE+'/tools/_pad_preview.html?tools=0&scheme=stick&state=play&v='+Date.now()});
await sleep(1200);
const res=await evalJS(`(async()=>{
 const coarse=matchMedia('(pointer: coarse)').matches;
 const m=await import('../src/ui/virtualPad.js');
 const before=document.querySelectorAll('#hksTouchPad').length;
 const pFalse=new m.TouchPad({input:{touchDevice:false}});
 const afterFalse=document.querySelectorAll('#hksTouchPad').length;
 const pUndef=new m.TouchPad({input:{}});
 const afterUndef=document.querySelectorAll('#hksTouchPad').length;
 const out={coarse,before,afterFalse,afterUndef,activeFalse:pFalse.active,activeUndef:pUndef.active,renderedFalse:pFalse.rendered,renderedUndef:pUndef.rendered};
 pFalse.destroy();pUndef.destroy();
 return out;
})()`);
console.log(JSON.stringify(res,null,1));
const pass=res.coarse===false && res.afterFalse===res.before && res.afterUndef===res.before && res.activeFalse===false && res.activeUndef===false;
console.log('PASS',pass);
try{ws.close();}catch{}proc.kill();await sleep(300);try{rmSync(profile,{recursive:true,force:true});}catch{}
if(!pass)process.exitCode=1;
