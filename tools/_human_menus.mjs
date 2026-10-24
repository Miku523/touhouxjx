/**
 * 真人式菜单流程：标题 → 设置逐项 → 按键设置改键冲突/Del → 音乐回忆室试听 → 返回标题
 * 只使用 CDP 真实键鼠事件；eval 只用于读 DOM/localStorage 状态。
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9612, headless: true });
const log = (...a) => console.log(...a);
const settings = () => T.eval(`JSON.parse(localStorage.getItem('hks.settings.v1')||'null')`);
const kbinds = () => T.eval(`JSON.parse(localStorage.getItem('hks.keybinds.v1')||'null')`);
const selText = () => T.eval(`(document.querySelector('#overlay .btn.sel')||{}).innerText||''`);
const shot = (n) => T.shot('_pt/human/' + n);
const press = async (code, hold = 90) => { await T.key(code, hold); await sleep(120 + Math.random() * 150); };

await T.boot();
await sleep(800);

/* ---------- 1. 设置逐项 ---------- */
await T.key('KeyS', 100); await sleep(900);
await shot('10_settings_initial.png');
const S0 = await settings();
log('SETTINGS_INITIAL', JSON.stringify(S0));

// i0 全部静音
await press('Enter'); await sleep(300);
await shot('11_mute_on.png');
log('MUTE_ON', JSON.stringify(await settings()), '| sel=', await selText());
await press('Enter'); await sleep(300);
log('MUTE_RESTORED', JSON.stringify(await settings()));

// i1 背景音乐
await press('ArrowDown'); await press('Enter'); await sleep(250);
log('BGM_OFF', JSON.stringify(await settings()));
await press('Enter'); await sleep(250);
log('BGM_ON', JSON.stringify(await settings()));

// i2 音乐音量 ← ← 再 → →
await press('ArrowDown');
await press('ArrowLeft'); await press('ArrowLeft'); await sleep(200);
const volDown = await T.eval(`document.querySelector('#overlay').innerText.match(/音乐音量[^\\n]*\\n([^\\n]*)/)?.[1] || ''`);
log('MUSIC_VOL_DOWN_TEXT', JSON.stringify(volDown), JSON.stringify(await settings()));
await shot('12_music_vol_60.png');
await press('ArrowRight'); await press('ArrowRight'); await sleep(200);
log('MUSIC_VOL_RESTORED', JSON.stringify(await settings()));

// i3 音效
await press('ArrowDown'); await press('Enter'); await sleep(200);
log('SE_OFF', JSON.stringify(await settings()));
await press('Enter'); await sleep(200);

// i4 音效音量
await press('ArrowDown'); await press('ArrowLeft'); await sleep(200);
log('SE_VOL_DOWN', JSON.stringify(await settings()));
await press('ArrowRight'); await sleep(200);

// i5 画质
await press('ArrowDown');
const q0 = await selText();
await press('Enter'); await sleep(300);
const q1 = await selText();
await press('Enter'); await sleep(300);
const q2 = await selText();
await shot('13_quality_low.png');
await press('Enter'); await sleep(300);
const q3 = await selText();
log('QUALITY_CYCLE', JSON.stringify([q0, q1, q2, q3]), JSON.stringify(await settings()));

// i7 屏幕震动
await press('ArrowDown'); await press('Enter'); await sleep(250);
await shot('14_shake_off.png');
log('SHAKE_OFF', JSON.stringify(await settings()));
await press('Enter'); await sleep(250);

// i8 帧率上限
await press('ArrowDown'); await press('ArrowRight'); await sleep(300);
const fps60 = await T.eval(`({ sel: (document.querySelector('#overlay .btn.sel')||{}).innerText, cap: window.__game.loop?.frameCap })`);
log('FRAMECAP_60', JSON.stringify(fps60), JSON.stringify(await settings()));
await shot('15_fps60.png');
await press('ArrowLeft'); await sleep(300);
log('FRAMECAP_RESTORED', JSON.stringify(await settings()));

// i9 残机
await press('ArrowDown'); await press('ArrowLeft'); await sleep(250);
const lives2 = await T.eval(`({ txt: (document.querySelector('#overlay .btn.sel')||{}).innerText, lives: window.__game.lives })`);
log('LIVES_2', JSON.stringify(lives2), JSON.stringify(await settings()));
await shot('16_lives2.png');
await press('ArrowRight'); await sleep(250);
log('LIVES_RESTORED', JSON.stringify(await settings()));

/* ---------- 2. 按键设置 ---------- */
await press('ArrowDown'); // -> 按键设置
log('SEL_BEFORE_KB', JSON.stringify(await selText()));
await press('Enter'); await sleep(800);
await shot('17_keybinds.png');
const KB0 = await kbinds();
log('KB_INITIAL', JSON.stringify(KB0));
const kbDom = await T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return { text: ov.innerText.slice(0,2000),
    btns: Array.from(ov.querySelectorAll('.btn')).map((b,i)=>({i,t:b.innerText.replace(/\\s+/g,' ').slice(0,70),sel:b.classList.contains('sel')})) };
})()`);
log('KB_DOM', JSON.stringify(kbDom));
await T.close();
