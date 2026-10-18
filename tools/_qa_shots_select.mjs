import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9379, sleep = (ms) => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-sel-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-port='+PORT,'about:blank'], { stdio:'ignore' });
async function target(){ for(let i=0;i<100;i++){ try{ const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p=l.find(t=>t.type==='page'); if(p)return p; }catch{} await sleep(200);} throw new Error('no target'); }
let ws, id=0; const pending=new Map(); const errors=[];
function send(m,p={}){ return new Promise((res,rej)=>{ const mid=++id; pending.set(mid,{res,rej}); ws.send(JSON.stringify({id:mid,method:m,params:p})); }); }
const ev = async (e)=>{ const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text); return r.result?.value; };
try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
  ws.onmessage=(e)=>{ const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){ const{res,rej}=pending.get(m.id); pending.delete(m.id); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);} if(m.method==='Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description||'').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`${URL0}?sel=${Date.now()}`});
  for(let i=0;i<80;i++){ if(await ev('!!window.__game')) break; await sleep(100); }
  await sleep(900);
  await ev(`window.__game.showCharSelect()`);
  await sleep(800);
  const r = await send('Page.captureScreenshot',{format:'png'});
  writeFileSync('_qa_shots_select.png', Buffer.from(r.data,'base64'));
  console.log('SELECT', await ev(`JSON.stringify({ shown: !!document.querySelector('.cc-card'), notes: [...document.querySelectorAll('.cc-note')].map(n => ({ text: n.textContent, w: Math.round(n.getBoundingClientRect().width), cardW: Math.round(n.closest('.cc-card').getBoundingClientRect().width), overflow: n.scrollWidth > n.clientWidth + 1 })) })`));
  console.log('ERRORS', JSON.stringify(errors));
} finally { try{ws?.close();}catch{} try{proc.kill();}catch{} await sleep(200); process.exit(0); }
