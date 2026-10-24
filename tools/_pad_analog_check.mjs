#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9382;
const BASE = 'http://127.0.0.1:8137';
const OUT = '_shots_pad/analog';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'edge-padanalog-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port='+PORT,'--window-size=717,512','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i=0;i<80;i++){ try{ const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json(); page=l.find(t=>t.type==='page'); if(page) break; }catch{} await sleep(200); }
if(!page) throw new Error('no target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let seq=0; const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}};
const send=(method,params={})=>new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method,params}));});
const evalJS=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails).slice(0,800));return r.result&&r.result.value;};
const shot=async(p)=>{const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync(p,Buffer.from(r.data,'base64'));console.log('SHOT',p);};
const touch=(type, points)=>send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({x:p.x,y:p.y,id:p.id||1,radiusX:8,radiusY:8,force:1}))});
await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride',{width:717,height:512,deviceScaleFactor:2,mobile:true,screenWidth:717,screenHeight:512});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'});
await send('Page.navigate',{url:BASE+'/tools/_pad_preview.html?tools=0&scheme=stick&state=play&v='+Date.now()});
let up=false; for(let i=0;i<80;i++){ up=await evalJS('!!(window.pad && window.pad.rendered)'); if(up) break; await sleep(150); }
if(!up) throw new Error('pad not booted');
const geom = await evalJS('(() => ({ c: window.pad._centers.stick, r: window.pad._stickR }))()');
console.log('GEOM', JSON.stringify(geom));
const c = geom.c, R = geom.r;
if (!c) throw new Error('no dock center');
const read = async () => await evalJS('JSON.stringify(window.__mockInput.stick)');
const results = [];
async function moveTo(px,py){ await touch('touchStart',[{x:c.x,y:c.y,id:1}]); await sleep(70); await touch('touchMove',[{x:px,y:py,id:1}]); await sleep(110); const s=JSON.parse(await read()); await touch('touchEnd',[]); await sleep(120); const s0=JSON.parse(await read()); results.push({px,py,s,s0,mag:+Math.hypot(s.x,s.y).toFixed(4)}); }
await moveTo(c.x + R*0.5, c.y);
await moveTo(c.x + R, c.y);
await moveTo(c.x + R*0.1, c.y);
await moveTo(c.x + R*0.5*Math.SQRT1_2, c.y + R*0.5*Math.SQRT1_2);
await shot(join(OUT,'axes-717x512.png'));
console.log(JSON.stringify(results,null,1));
const half = results[0], full = results[1], dead = results[2], diag = results[3];

// 非吸附分支：同样只做死区门控、保留幅度
await evalJS("window.pad.setSetting('snap8', false); 1");
const nsStart = results.length;
await moveTo(c.x + R * 0.5, c.y);
await moveTo(c.x + R, c.y);
await moveTo(c.x + R * 0.1, c.y);
await evalJS("window.pad.setSetting('snap8', true); 1");
const nsHalf = results[nsStart], nsFull = results[nsStart + 1], nsDead = results[nsStart + 2];

const checks = {
  halfMag: Math.abs(half.mag - 0.5) < 0.06,
  halfSnap: Math.abs(half.s.y) < 0.02 && half.s.x > 0.44,
  fullMag: Math.abs(full.mag - 1) < 0.06,
  dead: dead.mag === 0,
  diagMag: Math.abs(diag.mag - 0.5) < 0.06,
  diagBalanced: Math.abs(diag.s.x - diag.s.y) < 0.03 && diag.s.x > 0.30,
  released: results.every(r => r.s0.x === 0 && r.s0.y === 0),
  nsHalfMag: nsHalf && Math.abs(nsHalf.mag - 0.5) < 0.06,
  nsFullMag: nsFull && Math.abs(nsFull.mag - 1) < 0.06,
  nsDead: nsDead && nsDead.mag === 0,
  nsReleased: [nsHalf, nsFull, nsDead].every(r => r && r.s0.x === 0 && r.s0.y === 0),
};
console.log('CHECKS', JSON.stringify(checks,null,1));
writeFileSync(join(OUT,'result.json'), JSON.stringify({ geom, results, checks }, null, 1));
try{ws.close();}catch{} proc.kill(); await sleep(300); try{rmSync(profile,{recursive:true,force:true});}catch{}
if (Object.values(checks).some(v=>!v)) process.exitCode = 1;
