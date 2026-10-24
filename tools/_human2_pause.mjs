import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9621, headless: true });
await T.boot();
const L = [];
const S = (tag) => T.eval(`(() => {
  const g = window.__game, d = g.dialogue, p = g.stage && g.stage.player;
  const ov = document.getElementById('overlay');
  const btns = [...overlay.querySelectorAll('.btn')].map((b, i) => {
    const r = b.getBoundingClientRect();
    return { i, t: b.innerText.replace(/\\s+/g, ' ').trim().slice(0, 40), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  return { tag: ${JSON.stringify(tag)}, st: g.state, paused: g.state === 'paused',
    ov: !ov.classList.contains('hidden'), text: ov.innerText.replace(/\\s+/g, ' ').trim().slice(0, 260),
    dlg: d ? { on: d.active, i: d.index, n: d.script ? d.script.length : null, typing: d.shown < (d.fullText ? d.fullText.length : 0) } : null,
    x: p ? Math.round(p.x) : null, lives: g.lives, hearts: p ? p.hearts : null,
    settingsBtn: (() => { const b = document.getElementById('settingsBtn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), vis: r.width > 0 }; })(),
    btns };
})()`);

// —— 进入第 1 面（EASY + 灵梦）——
await T.key('Enter'); await sleep(700);
await T.key('KeyE'); await sleep(600);
await T.key('Enter'); await sleep(900);
L.push(await S('after_charselect'));           // 检查一次 Enter 是否连跳两屏
await T.shot('_pt/human2/10_after_charselect.png');

// —— 对话期连按 空格/Z ——
L.push(await S('dlg_before_spam'));
for (let i = 0; i < 6; i++) { await T.key('Space', 25); await sleep(55); await T.key('KeyZ', 25); await sleep(55); }
await sleep(400);
L.push(await S('dlg_after_spam'));
await T.shot('_pt/human2/11_dialogue_spam.png');
// 对话中 Esc 不应打开菜单
await T.key('Escape'); await sleep(400);
L.push(await S('dlg_after_esc'));
await T.shot('_pt/human2/12_dialogue_esc.png');

// —— 推进到关卡 ——
for (let i = 0; i < 45; i++) {
  const s = await S('tick' + i);
  if (!s.dlg || !s.dlg.on) break;
  await T.key('Enter', 40); await sleep(260);
}
await sleep(600);
L.push(await S('stage_start'));

// —— 暂停：键盘四项 ——
await T.key('Escape'); await sleep(400);
L.push(await S('paused_kb'));
await T.shot('_pt/human2/13_pause_keyboard.png');
await T.key('Enter'); await sleep(500);            // 继续
L.push(await S('resumed_kb'));
await sleep(500);
await T.key('Escape'); await sleep(300);           // 暂停
await T.key('ArrowDown'); await sleep(120);        // 设置
await T.key('Enter'); await sleep(500);
L.push(await S('pause_settings'));
await T.shot('_pt/human2/14_pause_settings.png');
await T.key('Escape'); await sleep(400);
L.push(await S('pause_settings_back'));
await T.key('Escape'); await sleep(400);           // 继续游戏
L.push(await S('resumed_kb2'));

// —— 暂停：重新开始本关 ——
await T.key('Escape'); await sleep(300);
await T.key('ArrowDown', 40); await sleep(90);
await T.key('ArrowDown', 40); await sleep(90);
await T.key('Enter'); await sleep(700);
L.push(await S('pause_restart'));
await T.shot('_pt/human2/15_pause_restart.png');
// 若重开后出现开场对话，推进
for (let i = 0; i < 30; i++) {
  const s = await S('r' + i);
  if (!s.dlg || !s.dlg.on) break;
  await T.key('Enter', 40); await sleep(200);
}
await sleep(400);

// —— 暂停：退出到标题（含二次确认 + Esc 取消）——
await T.key('Escape'); await sleep(300);
await T.key('ArrowDown', 40); await sleep(80);
await T.key('ArrowDown', 40); await sleep(80);
await T.key('ArrowDown', 40); await sleep(80);
await T.key('Enter'); await sleep(450);
L.push(await S('quit_confirm'));
await T.shot('_pt/human2/16_quit_confirm.png');
await T.key('Escape'); await sleep(350);
L.push(await S('quit_cancelled'));
await T.key('Enter'); await sleep(400);            // 再点退出到标题 → 确认框
await T.key('Enter'); await sleep(600);            // 确认
L.push(await S('back_title_kb'));
await T.shot('_pt/human2/17_back_title.png');

// —— 鼠标：HUD 设置键 + 暂停四项 ——
await T.key('Enter'); await sleep(700);
await T.key('Enter'); await sleep(500);            // 默认 NORMAL
await T.key('Enter'); await sleep(900);            // 灵梦
for (let i = 0; i < 45; i++) {
  const s = await S('m' + i);
  if (!s.dlg || !s.dlg.on) break;
  await T.key('Enter', 40); await sleep(220);
}
await sleep(500);
let s0 = await S('stage_for_mouse');
L.push(s0);
if (s0.settingsBtn) { await T.mouse(s0.settingsBtn.x, s0.settingsBtn.y); await sleep(400); }
L.push(await S('paused_mouse'));
await T.shot('_pt/human2/18_pause_mouse.png');
// 点「设置」
let items = (await S('q')).btns;
let it = items.find((b) => b.t.includes('设置'));
if (it) { await T.mouse(it.x, it.y); await sleep(500); }
L.push(await S('mouse_settings'));
await T.shot('_pt/human2/19_mouse_settings.png');
items = (await S('q2')).btns;
it = items.find((b) => b.t.includes('返回'));
if (it) { await T.mouse(it.x, it.y); await sleep(450); }
L.push(await S('mouse_back_pause'));
items = (await S('q3')).btns;
it = items.find((b) => b.t.includes('继续'));
if (it) { await T.mouse(it.x, it.y); await sleep(450); }
L.push(await S('mouse_resume'));
// 再次暂停 → 鼠标点退出到标题 → 取消 → 再确认
await T.key('Escape'); await sleep(350);
items = (await S('q4')).btns;
it = items.find((b) => b.t.includes('退出到标题'));
if (it) { await T.mouse(it.x, it.y); await sleep(450); }
L.push(await S('mouse_quit_confirm'));
items = (await S('q5')).btns;
it = items.find((b) => b.t.includes('取消') || b.t.includes('继续游戏'));
if (it) { await T.mouse(it.x, it.y); await sleep(400); }
L.push(await S('mouse_quit_cancel'));
items = (await S('q6')).btns;
it = items.find((b) => b.t.includes('退出到标题'));
if (it) { await T.mouse(it.x, it.y); await sleep(400); }
items = (await S('q7')).btns;
it = items.find((b) => b.t.includes('确认') || b.t.includes('退出到标题'));
if (it) { await T.mouse(it.x, it.y); await sleep(600); }
L.push(await S('mouse_back_title'));
await T.shot('_pt/human2/20_mouse_back_title.png');

const rep = await T.report();
L.push({ errors: rep.errors.slice(0, 6), warns: rep.warns.slice(0, 6), netFails: rep.netFails.slice(0, 6), httpBad: rep.httpBad.slice(0, 6) });
console.log(JSON.stringify(L, null, 1));
await T.close();
