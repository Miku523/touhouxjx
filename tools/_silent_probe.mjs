import { launch, sleep } from './_pt_core.mjs';
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
const H = EVAL("(()=>{const g=window.__game,h=document.getElementById('hint');return {hint:h?h.textContent:null,hidden:h?h.hidden:null,silent:g._audioSilent,musicOn:g.musicOn,vol:g.audio.musicVolume}})()");
const T = await launch({ port: 9542, width: 1280, height: 720, realAudio: true });
await T.nav('http://127.0.0.1:8138/index.html?v=1.6.88');
await T.waitFor("!!window.__game", 90000);
await sleep(1200);
// 存档里音量 0
await T.eval(EVAL("(()=>{localStorage.setItem('hks.settings.v1',JSON.stringify({musicVolume:0}));return 1})()"));
await T.eval("location.reload()");
await T.waitFor("!!window.__game", 90000);
await sleep(1200);
console.log('vol0 before', await T.eval(H));
await T.eval("(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return 1})()");
await sleep(3500);
console.log('vol0 after ', await T.eval(H));
// 调回 0.8 应立刻消失
await T.eval(EVAL("(()=>{window.__game.audio.setMusicVolume(0.8);window.__game._saveSettings();window.__game._refreshTitleVoiceHint();return 1})()"));
await sleep(300);
console.log('vol restored', await T.eval(H));
process.exit(0);