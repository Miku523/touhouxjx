import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9626, headless: true });
await T.boot();
const L = [];
const help = () => T.eval(`(() => {
  const ov = document.getElementById('overlay');
  const panel = ov.querySelector('.panel');
  const rows = [...ov.querySelectorAll('.btn, .help-row, .set-row, .info')].map(b => b.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean);
  const r = panel.getBoundingClientRect();
  return { st: window.__game.state, text: ov.innerText.replace(/\\s+/g,' ').trim().slice(0, 1400), rows,
    panel: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), scrollH: panel.scrollHeight, clientH: panel.clientHeight, scrollTop: panel.scrollTop },
    iw: innerWidth, ih: innerHeight, mode: ov.className };
})()`);

// 打开操作说明（? / Slash）
await T.key('Slash'); await sleep(700);
L.push(await help());
await T.shot('_pt/human2/40_manual_top.png');
// 键盘尝试滚动：↓ / PageDown / End
await T.key('ArrowDown'); await sleep(250);
await T.key('PageDown'); await sleep(350);
await T.key('End'); await sleep(350);
L.push({ afterKeys: await help() });
// 鼠标滚轮（CDP 原生）
await T.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 420, deltaX: 0, deltaY: 620 });
await sleep(500);
L.push({ afterWheel: await help() });
await T.shot('_pt/human2/41_manual_wheel_bottom.png');
// 继续滚到底
await T.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 420, deltaX: 0, deltaY: 900 });
await sleep(400);
L.push({ wheel2: await help() });
await T.shot('_pt/human2/42_manual_bottom.png');
// 鼠标点击「返回」
const back = await T.eval(`(() => { const b = [...document.querySelectorAll('#overlay .btn')].find(x => x.innerText.includes('返回')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), vis: r.top >= 0 && r.bottom <= innerHeight }; })()`);
if (back && back.vis) { await T.mouse(back.x, back.y); await sleep(500); }
L.push({ backTitle: await T.eval(`({ st: window.__game.state, ov: !document.getElementById('overlay').classList.contains('hidden') })`) , backRect: back });
await T.shot('_pt/human2/43_manual_back.png');

// 与当前键位对照（读 input 实际键位）
const binds = await T.eval(`(() => { const i = window.__game.input, out = {}; for (const a of ['left','right','up','down','jump','shoot','slow','dash','cast','confirm','pause','restart','mute','quit']) out[a] = i.labelFor(a); return out; })()`);
L.push({ binds });
const rep = await T.report();
L.push({ errors: rep.errors.slice(0, 5), warns: rep.warns.slice(0, 5), netFails: rep.netFails.slice(0, 5) });
console.log(JSON.stringify(L, null, 1));
await T.close();
