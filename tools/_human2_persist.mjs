import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9622, headless: true });
await T.boot();
const L = [];
const A = (tag) => T.eval(`(() => {
  const g = window.__game, a = document.getElementById('overlay');
  const store = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); store[k] = localStorage.getItem(k); }
  return { tag: ${JSON.stringify(tag)}, st: g.state, settings: g.settings ? { ...g.settings } : null,
    lives: g.lives, frameCap: g.frameCap, difficulty: g.difficulty,
    text: a.innerText.replace(/\\s+/g, ' ').trim().slice(0, 300),
    actionShootZ: g.input.actionOf('KeyZ'), actionShootF: g.input.actionOf('KeyF'),
    store };
})()`);
const setSel = async (n) => { for (let i = 0; i < n; i++) { await T.key('ArrowDown', 40); await sleep(90); } };

L.push(await A('boot'));
// —— 设置：残机 2、帧率 60、音乐音量 60%、全部静音 ——
await T.key('KeyS'); await sleep(600);
await setSel(8); // 残机（跳过 info 行）
await T.key('ArrowLeft'); await sleep(250);
L.push(await A('lives2'));
await T.shot('_pt/human2/20_lives2.png');
await T.key('ArrowUp'); await sleep(120);   // 帧率
await T.key('ArrowRight'); await sleep(250);
L.push(await A('fps60'));
await T.shot('_pt/human2/21_fps60.png');
for (let i = 0; i < 6; i++) { await T.key('ArrowUp', 40); await sleep(90); }   // 音乐音量
await T.key('ArrowLeft'); await sleep(120);
await T.key('ArrowLeft'); await sleep(250);
L.push(await A('vol60'));
await T.shot('_pt/human2/22_vol60.png');
await T.key('ArrowUp'); await sleep(120);
await T.key('ArrowUp'); await sleep(120);   // 全部静音
await T.key('Enter'); await sleep(300);
L.push(await A('muted_on'));
await T.shot('_pt/human2/23_muted.png');
await T.key('Enter'); await sleep(250);     // 恢复静音 off，避免影响后续
await T.key('Escape'); await sleep(500);    // 回标题
L.push(await A('back_title'));
// —— 刷新持久化 ——
await T.reload();
await T.boot();
await sleep(400);
L.push(await A('after_reload'));
await T.shot('_pt/human2/24_after_reload.png');
// 设置页 UI 是否显示持久化值
await T.key('KeyS'); await sleep(600);
L.push(await A('settings_after_reload'));
await T.shot('_pt/human2/25_settings_after_reload.png');
await T.key('Escape'); await sleep(400);

// —— 难度持久化：改 HARD 后刷新 ——
await T.key('Enter'); await sleep(600);
await T.key('ArrowRight'); await sleep(200);   // N → H
L.push(await A('diff_H'));
await T.key('Enter'); await sleep(600);        // 进角色选择
L.push(await A('charselect_H'));
await T.shot('_pt/human2/26_charselect_H.png');
await T.key('Escape'); await sleep(400);
await T.key('Escape'); await sleep(500);
await T.reload(); await T.boot(); await sleep(300);
L.push(await A('reload_diff_H'));
await T.key('Enter'); await sleep(600);
L.push(await A('difficulty_page_after_reload'));
await T.shot('_pt/human2/27_difficulty_after_reload.png');
await T.key('Escape'); await sleep(400);

// —— 改键：射击 → KeyF，刷新持久 + 立即生效 ——
await T.key('KeyS'); await sleep(500);
await setSel(9); // 按键设置
await T.key('Enter'); await sleep(600);
await setSel(6); // 射击
await T.key('Enter'); await sleep(350);
await T.shot('_pt/human2/28_keybind_waiting.png');
await T.key('KeyF'); await sleep(400);
L.push(await A('keybind_F'));
await T.shot('_pt/human2/29_keybind_F.png');
await T.key('Escape'); await sleep(400);
await T.key('Escape'); await sleep(500);
await T.reload(); await T.boot(); await sleep(300);
L.push(await A('keybind_after_reload'));
// 进关验证按键生效（KeyF 为射击、KeyZ 不再是射击）
await T.key('Enter'); await sleep(600);
await T.key('Enter'); await sleep(600);
await T.key('Enter'); await sleep(900);
for (let i = 0; i < 45; i++) {
  const s = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`);
  if (!s) break;
  await T.key('Enter', 40); await sleep(200);
}
await sleep(500);
const count = () => T.eval(`window.__game.stage ? window.__game.stage.bullets.pool.filter(b => b.active).length : -1`);
const c0 = await count();
await T.keyDown('KeyF'); await sleep(650); await T.keyUp('KeyF'); await sleep(200);
const cF = await count();
await T.keyDown('KeyZ'); await sleep(650); await T.keyUp('KeyZ'); await sleep(200);
const cZ = await count();
L.push({ shots: { c0, cF, cZ }, inGame: await A('in_game_bindF') });
await T.shot('_pt/human2/30_shoot_keyF.png');
// 暂停 → 退出到标题
await T.key('Escape'); await sleep(350);
await setSel(3);
await T.key('Enter'); await sleep(350);
await T.key('Enter'); await sleep(500);

// —— Del 恢复默认键位 ——
await T.key('KeyS'); await sleep(500);
await setSel(9);
await T.key('Enter'); await sleep(500);
await T.key('Delete'); await sleep(400);
L.push(await A('keybind_default'));
await T.shot('_pt/human2/31_keybind_default.png');
await T.key('Escape'); await sleep(400);

// —— 重置进度：二次确认 + 不影响回忆/键位 ——
await setSel(1); // 重置进度（按键设置下方一行）
await T.key('Enter'); await sleep(450);
L.push(await A('reset_confirm'));
await T.shot('_pt/human2/32_reset_confirm.png');
await T.key('ArrowUp'); await sleep(200);   // 默认高亮「取消」，先移到「确认重置」
await T.key('Enter'); await sleep(700);
L.push(await A('after_reset'));
await T.shot('_pt/human2/33_after_reset.png');

const rep = await T.report();
L.push({ errors: rep.errors.slice(0, 6), warns: rep.warns.slice(0, 6), netFails: rep.netFails.slice(0, 6), httpBad: rep.httpBad.slice(0, 6) });
console.log(JSON.stringify(L, null, 1));
await T.close();
