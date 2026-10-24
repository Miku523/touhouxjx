/**
 * 连续真人流程：标题 → 设置(快照) → 按键设置(改键冲突 + Del 恢复) → 返回
 *              → 音乐回忆室(未遭遇曲确认弹窗/取消/播放/试听30秒) → 返回标题 → 启动游戏
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9614, headless: true });
const log = (...a) => console.log(...a);
const shot = (n) => T.shot('_pt/human/' + n);
const press = async (code, hold = 90) => { await T.key(code, hold); await sleep(110 + Math.random() * 120); };
const overlayText = () => T.eval(`document.getElementById('overlay')?.innerText.slice(0,900) || ''`);
const kb = () => T.eval(`JSON.parse(localStorage.getItem('hks.keybinds.v1')||'null')`);

await T.boot(); await sleep(800);

/* ========== A. 设置 → 按键设置 ========== */
await T.key('KeyS', 100); await sleep(800);
for (let i = 0; i < 9; i++) await press('ArrowDown');
log('SETTINGS_SEL', JSON.stringify(await T.eval(`document.querySelector('#overlay .btn.sel')?.innerText`)));
await press('Enter'); await sleep(900);
await shot('17_keybinds_page.png');
log('KB0', JSON.stringify(await kb()));

// 选中第 7 项「射击」(index 6)
for (let i = 0; i < 6; i++) await press('ArrowDown');
log('KB_SEL', JSON.stringify(await T.eval(`document.querySelector('#overlay .btn.sel')?.innerText`)));
await press('Enter'); await sleep(500);
log('KB_WAIT_TEXT', JSON.stringify((await overlayText()).slice(0, 300)));
await shot('18_keybind_awaiting.png');

// 冲突改键：把「射击」改成已被「左移」占用的 ←（应自动互换）
await press('ArrowLeft'); await sleep(500);
log('KB_AFTER_CONFLICT', JSON.stringify(await kb()));
await shot('19_keybind_conflict.png');
log('KB_ROWS', JSON.stringify(await T.eval(`Array.from(document.querySelectorAll('#overlay .btn')).slice(0,10).map(b=>b.innerText.replace(/\\s+/g,' '))`)));

// Del 恢复默认
await T.key('Delete', 90); await sleep(600);
log('KB_AFTER_DEL', JSON.stringify(await kb()));
await shot('20_keybind_del_default.png');

// Esc 回设置（光标应在「按键设置」行）
await T.key('Escape', 100); await sleep(700);
log('BACK_IN_SETTINGS', JSON.stringify(await T.eval(`({ sel: document.querySelector('#overlay .btn.sel')?.innerText, hasKeybindRow: document.getElementById('overlay').innerText.includes('按键设置') })`)));
await shot('21_settings_back_from_kb.png');
// Esc 回标题
await T.key('Escape', 100); await sleep(700);
log('BACK_TITLE_STATE', await T.eval(`window.__game.state`), '|', JSON.stringify(await T.eval(`(document.querySelector('#overlay .btn.sel')||{}).innerText`)));

/* ========== B. 音乐回忆室 ========== */
await T.key('KeyM', 100); await sleep(1400);
await shot('22_musicroom.png');
const mr0 = await T.eval(`(() => {
  const rows = Array.from(document.querySelectorAll('.mr-row'));
  const sel = document.querySelector('.mr-row.is-sel');
  const detail = document.querySelector('.mr-detail') || document.querySelector('.mr-pane') || document.querySelector('.mr-right');
  return { count: document.querySelector('.mr-count')?.innerText, rows: rows.slice(0,6).map(r=>({cls:r.className, t:r.innerText.replace(/\\s+/g,' ')})),
    sel: sel?.innerText.replace(/\\s+/g,' '), right: detail?.innerText.slice(0,600) };
})()`);
log('MR0', JSON.stringify(mr0, null, 1));

// 下移到第 02 号（未遭遇）
await press('ArrowDown'); await sleep(400);
await shot('23_mr_locked_selected.png');
log('MR_LOCKED_RIGHT', JSON.stringify(await T.eval(`(document.querySelector('.mr-right')||document.querySelector('.mr-detail')||document.querySelector('.mr-pane')||document.body).innerText.slice(0,500)`)));
log('MR_LOCKED_ROWSEL', JSON.stringify(await T.eval(`document.querySelector('.mr-row.is-sel')?.innerText.replace(/\\s+/g,' ')`)));

// Enter 弹确认
await press('Enter'); await sleep(700);
await shot('24_mr_confirm_dialog.png');
log('MR_MODAL_TEXT', JSON.stringify(await overlayText()));
log('MR_MODAL_BTNS', JSON.stringify(await T.eval(`Array.from(document.querySelectorAll('#overlay .btn')).map(b=>({t:b.innerText.replace(/\\s+/g,' '),sel:b.classList.contains('sel')}))`)));

// 取消（Esc）
await T.key('Escape', 100); await sleep(700);
await shot('25_mr_after_cancel.png');
log('MR_AFTER_CANCEL', JSON.stringify(await T.eval(`({ count: document.querySelector('.mr-count')?.innerText, sel: document.querySelector('.mr-row.is-sel')?.innerText.replace(/\\s+/g,' ') })`)));

// 再次 Enter → 播放（Enter 为确认热键）
await press('Enter'); await sleep(700);
await shot('26_mr_confirm_again.png');
await press('Enter'); await sleep(2600);
await shot('27_mr_playing_unlocked.png');
log('MR_PLAYING', JSON.stringify(await T.eval(`({ count: document.querySelector('.mr-count')?.innerText, sel: document.querySelector('.mr-row.is-sel')?.innerText.replace(/\\s+/g,' '), toast: document.querySelector('.mr-toast')?.innerText, music: JSON.parse(localStorage.getItem('hks.music.v1')||'null') })`)));

// T 试听 30 秒
await press('KeyT'); await sleep(1800);
await shot('28_mr_preview30.png');
log('MR_PREVIEW', JSON.stringify(await T.eval(`({ text: document.querySelector('.mr-bar')?.innerText, foot: document.querySelector('.mr-foot')?.innerText, toast: document.querySelector('.mr-toast')?.innerText, hint: Array.from(document.querySelectorAll('.mr-hint,.mr-status,.mr-timer')).map(e=>e.innerText) })`)));

// Esc 回标题
await T.key('Escape', 100); await sleep(900);
await shot('29_back_title.png');
log('TITLE_BACK', await T.eval(`window.__game.state`), '|', JSON.stringify(await T.eval(`(document.querySelector('#overlay .btn.sel')||{}).innerText`)));
log('REPORT', JSON.stringify(await T.report()));
await T.close();
