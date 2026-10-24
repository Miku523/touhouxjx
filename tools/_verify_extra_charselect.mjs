// 一次性验证：EXTRA 按主角各自解锁 + 标题「EXTRA 选择主角」选人页（2026-10-24）
// 用法：先起服务器，再 PT_BASE=http://127.0.0.1:8151 node tools/_verify_extra_charselect.mjs
import { launch, BASE } from './_pt_core.mjs';

const T = await launch({ port: 9471 });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const out = {};
const j = async (expr) => JSON.parse(await T.eval(`JSON.stringify(${expr})`));
const titleBtn = `[...document.querySelectorAll('#overlay:not(.hidden) .btn')]`;

async function toTitle() {
  await T.eval(`(() => { __game.inExtra = false; __game.dialogue?.stop?.(); __game.hudEl?.classList.add('hidden'); __game.showTitle(); })()`);
  await T.sleep(250);
}

try {
  await T.boot();

  // ---------- 1) 旧存档迁移：只有 extraChar（上一版格式） ----------
  await T.eval(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' }))`);
  await T.boot({ query: '?migrate=' + Date.now() });
  await T.sleep(400);
  out.migrateSingle = await j(`({
    unlocked: __game.unlockedExtra, chars: __game.extraChars, extraChar: __game.extraChar,
    saved: JSON.parse(localStorage.getItem('hks.progress.v1') || 'null'),
  })`);
  check('旧存档(extraChar=reimu)迁移：灵梦可用', out.migrateSingle.chars.reimu === true);
  check('旧存档迁移：魔理沙不自动解锁', out.migrateSingle.chars.marisa === false);
  check('迁移后立即写回新格式', JSON.stringify(out.migrateSingle.saved?.extraChars) === JSON.stringify(['reimu']));

  // ---------- 2) 更老存档：只有 extraUnlocked，没有角色 ----------
  await T.eval(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true }))`);
  await T.boot({ query: '?migrate=' + Date.now() });
  await T.sleep(400);
  out.migrateLegacy = await j(`({ chars: __game.extraChars, saved: JSON.parse(localStorage.getItem('hks.progress.v1') || 'null') })`);
  check('远古存档(无角色)迁移：两位都解锁', out.migrateLegacy.chars.reimu && out.migrateLegacy.chars.marisa);

  // ---------- 3) 只解锁灵梦：标题 → E → 选人页 ----------
  await T.eval(`localStorage.removeItem('hks.progress.v1')`);
  await T.eval(`(() => { __game.unlockedExtra = true; __game.extraChars = { reimu: true, marisa: false }; __game.extraChar = null; __game.showTitle(); })()`);
  await T.sleep(300);
  out.titleExtraBtn = await j(`${titleBtn}.filter(b => (b.textContent||'').includes('门内的祭典')).map(b => ({ cls: b.className, hotkey: b._spec?.hotkey || null }))`);
  await T.tap('KeyE');
  await T.sleep(400);
  out.pickerSingle = await j(`(() => {
    const ov = document.getElementById('overlay');
    const cards = [...ov.querySelectorAll('.cc-card')];
    return {
      overlayHidden: ov.classList.contains('hidden'),
      screenMode: ov.classList.contains('screen-mode'),
      state: __game.state, inExtra: !!__game.inExtra,
      title: (document.getElementById('title') || {}).textContent,
      subtitle: (document.getElementById('subtitle') || {}).textContent,
      hint: (document.getElementById('hint') || {}).textContent,
      names: cards.map(c => (c.querySelector('.cc-name') || {}).textContent),
      locked: cards.map(c => c.className.includes('locked')),
      lockBadges: [...ov.querySelectorAll('.cc-lock')].map(e => e.textContent.trim()),
      selected: (ov.querySelector('.cc-card.sel .cc-name') || {}).textContent || null,
      sceneCaption: (ov.querySelector('.ov-bg-caption') || {}).textContent || null,
    };
  })()`);
  check('标题 EXTRA 按钮解锁后仍带 KeyE 快捷键', out.titleExtraBtn.some(b => b.hotkey === 'KeyE'));
  check('按 E 打开的是选人页，不是直接进关', out.pickerSingle.state === 'menu' && !out.pickerSingle.inExtra && out.pickerSingle.screenMode);
  check('选人页标题/副标题', out.pickerSingle.title === 'EXTRA 选择主角' && out.pickerSingle.subtitle.includes('1 / 2'));
  check('两张主角卡都在', out.pickerSingle.names.length === 2 && out.pickerSingle.locked[0] === false && out.pickerSingle.locked[1] === true);
  check('魔理沙卡有「未解锁」徽标', out.pickerSingle.lockBadges.includes('未解锁'));
  check('默认选中已解锁的灵梦', out.pickerSingle.selected === '博丽灵梦');

  // ---------- 4) 点未解锁卡：留在选人页并给提示 ----------
  await T.eval(`document.querySelector('.cc-card.locked').click()`);
  await T.sleep(350);
  out.clickLocked = await j(`(() => {
    const ov = document.getElementById('overlay');
    return {
      state: __game.state, inExtra: !!__game.inExtra,
      hint: (document.getElementById('hint') || {}).textContent,
      lockedCount: ov.querySelectorAll('.cc-card.locked').length,
    };
  })()`);
  check('点未解锁卡不进门', out.clickLocked.state === 'menu' && !out.clickLocked.inExtra);
  check('点未解锁卡提示魔理沙的解锁条件', out.clickLocked.hint.includes('魔理沙') && out.clickLocked.hint.includes('续命'));

  // ---------- 5) 键盘：↓ 跳过锁定卡（落到「返回」），再打开后 Enter 用灵梦进 EXTRA ----------
  await T.tap('ArrowDown');
  await T.sleep(150);
  out.afterDown = await j(`({ selCard: (document.querySelector('.cc-card.sel .cc-name') || {}).textContent || null, selBtn: ((document.querySelector('.btn.sel') || {}).textContent || '').trim() })`);
  check('↓ 跳过锁定卡，落到「返回」', out.afterDown.selCard === null && out.afterDown.selBtn.startsWith('返回'));
  await T.tap('Enter');
  await T.sleep(250);
  out.backFromPicker = await j(`({ state: __game.state, inExtra: !!__game.inExtra })`);
  check('在「返回」上按 Enter 回到标题', out.backFromPicker.state === 'menu' && !out.backFromPicker.inExtra);
  await T.tap('KeyE');
  await T.sleep(350);
  await T.tap('Enter');
  await T.sleep(600);
  out.enterReimu = await j(`({ inExtra: !!__game.inExtra, char: __game.char, extraChar: __game.extraChar, state: __game.state, overlayHidden: document.getElementById('overlay').classList.contains('hidden') })`);
  check('Enter 用灵梦进入 EXTRA', out.enterReimu.inExtra && out.enterReimu.char === 'reimu' && out.enterReimu.extraChar === 'reimu');

  // ---------- 6) 两位都解锁：可以选魔理沙，结局按所选主角 ----------
  await toTitle();
  await T.eval(`(() => { __game.unlockedExtra = true; __game.extraChars = { reimu: true, marisa: true }; __game.extraChar = 'reimu'; __game.showTitle(); })()`);
  await T.sleep(250);
  await T.tap('KeyE');
  await T.sleep(400);
  out.pickerBoth = await j(`(() => {
    const ov = document.getElementById('overlay');
    return {
      locked: [...ov.querySelectorAll('.cc-card.locked')].length,
      lockBadges: [...ov.querySelectorAll('.cc-lock')].length,
      subtitle: (document.getElementById('subtitle') || {}).textContent,
      selected: (ov.querySelector('.cc-card.sel .cc-name') || {}).textContent || null,
    };
  })()`);
  check('两位都解锁后没有锁定卡', out.pickerBoth.locked === 0 && out.pickerBoth.subtitle.includes('2 / 2'));
  await T.tap('ArrowDown');
  await T.sleep(150);
  out.pickerBothSel = await j(`(document.querySelector('.cc-card.sel .cc-name') || {}).textContent || null`);
  await T.tap('Enter');
  await T.sleep(500);
  out.enterMarisa = await j(`({ inExtra: !!__game.inExtra, char: __game.char, extraChar: __game.extraChar })`);
  check('两位都解锁后 ↓ 能选魔理沙', out.pickerBothSel === '雾雨魔理沙');
  check('用魔理沙进入 EXTRA', out.enterMarisa.inExtra && out.enterMarisa.char === 'marisa' && out.enterMarisa.extraChar === 'marisa');
  // 结局路由（W1/W2）由 endingFor(char, 'extra') 决定，这里只断言主角已正确换成魔理沙；
  // W1/W2 的纯函数映射由命令行另跑一次 node 校验（结局演出要等整段台词，不适合在这里等）。

  // ---------- 6b) 只解锁魔理沙：默认选中她，真正开出来的关卡也是她 ----------
  await toTitle();
  await T.eval(`(() => { __game.unlockedExtra = true; __game.extraChars = { reimu: false, marisa: true }; __game.extraChar = null; __game.showTitle(); })()`);
  await T.sleep(250);
  await T.tap('KeyE');
  await T.sleep(400);
  out.pickerMarisaOnly = await j(`(() => {
    const ov = document.getElementById('overlay');
    return {
      selected: (ov.querySelector('.cc-card.sel .cc-name') || {}).textContent || null,
      lockedName: (ov.querySelector('.cc-card.locked .cc-name') || {}).textContent || null,
      subtitle: (document.getElementById('subtitle') || {}).textContent,
    };
  })()`);
  check('只解锁魔理沙时默认选中她', out.pickerMarisaOnly.selected === '雾雨魔理沙' && out.pickerMarisaOnly.lockedName === '博丽灵梦');
  await T.tap('Enter');
  await T.sleep(500);
  out.enterMarisaOnly = await j(`({ inExtra: !!__game.inExtra, char: __game.char, extraChar: __game.extraChar })`);
  check('只解锁魔理沙时 Enter 用她进 EXTRA', out.enterMarisaOnly.inExtra && out.enterMarisaOnly.char === 'marisa' && out.enterMarisaOnly.extraChar === 'marisa');
  // 真正建出来的关卡也得是选中的那位（_createStage 用 extraChar 覆盖 char）
  await T.eval(`__game._startExtraStage()`);
  await T.sleep(900);
  out.extraStageChar = await j(`({ stageChar: __game.stage && __game.stage.char, stageDiff: __game.stage && __game.stage.difficulty })`);
  check('EXTRA 关卡实际用选中的主角', out.extraStageChar.stageChar === 'marisa');
  await toTitle();

  // ---------- 7) 通关写档：只加自己那一位 ----------
  await toTitle();
  await T.eval(`(() => {
    localStorage.removeItem('hks.progress.v1');
    __game.unlockedExtra = true;
    __game.extraChars = { reimu: true, marisa: false };
    __game.extraChar = 'reimu';
    __game.inExtra = false;
    __game.difficulty = 'N';
    __game.continues = 0;
    __game.char = 'marisa';
    __game._onAllCleared();
  })()`);
  await T.sleep(600);
  out.clearAsMarisa = await j(`({
    chars: __game.extraChars, extraChar: __game.extraChar,
    saved: JSON.parse(localStorage.getItem('hks.progress.v1') || 'null'),
    state: __game.state,
  })`);
  check('魔理沙达成真结局后写档：两位都解锁', out.clearAsMarisa.chars.reimu && out.clearAsMarisa.chars.marisa);
  check('写档 extraChars 含 reimu+marisa', JSON.stringify(out.clearAsMarisa.saved?.extraChars) === JSON.stringify(['reimu', 'marisa']));
  check('extraChar 记录最近达成者=魔理沙', out.clearAsMarisa.saved?.extraChar === 'marisa');

  // ---------- 8) 重置进度：两位一起封闭 ----------
  await T.eval(`(() => { __game.inExtra = false; __game.showTitle(); __game._doResetProgress(); })()`);
  await T.sleep(300);
  out.reset = await j(`({
    unlocked: __game.unlockedExtra, chars: __game.extraChars, extraChar: __game.extraChar,
    saved: localStorage.getItem('hks.progress.v1'),
    hint: (document.getElementById('hint') || {}).textContent,
  })`);
  check('重置后两位都封闭', !out.reset.unlocked && !out.reset.chars.reimu && !out.reset.chars.marisa && out.reset.saved === null);
  check('重置提示已更新', out.reset.hint.includes('EXTRA'));

  // ---------- 9) 未解锁卡的视觉：比可选项暗、可点 ----------
  await T.eval(`(() => { __game.unlockedExtra = true; __game.extraChars = { reimu: true, marisa: false }; __game.showExtraCharSelect(); })()`);
  await T.sleep(400);
  out.styles = await j(`(() => {
    const on = document.querySelector('.cc-card:not(.locked)');
    const off = document.querySelector('.cc-card.locked');
    const lock = document.querySelector('.cc-lock');
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      onCursor: cs(on)?.cursor, offCursor: cs(off)?.cursor, offPointer: cs(off)?.pointerEvents,
      offFilter: cs(off.querySelector('.cc-portrait img'))?.filter,
      lockVisible: !!lock && cs(lock).display !== 'none',
      lockText: lock?.textContent?.trim(),
    };
  })()`);
  check('未解锁卡可点（cursor=pointer）', out.styles.offCursor === 'pointer' && out.styles.offPointer !== 'none');
  check('未解锁立绘去色', String(out.styles.offFilter).includes('grayscale'));
  check('「未解锁」徽标可见', out.styles.lockVisible && out.styles.lockText === '未解锁');

  await T.shot('_pt/extra_charselect.png');
  await T.eval(`localStorage.removeItem('hks.progress.v1')`);
  out.errors = T.errors.slice(0, 20);
  out.netFails = T.netFails.filter((f) => !f.canceled).slice(0, 20);
  out.httpBad = T.httpBad.slice(0, 20);
} catch (err) {
  out.fatal = String(err && err.stack || err);
} finally {
  await T.close();
}

const failed = checks.filter((c) => !c.ok);
console.log('RESULT', JSON.stringify({
  pass: checks.length - failed.length, total: checks.length,
  failed, checks, out,
}, null, 2));
process.exit(failed.length || out.fatal ? 1 : 0);
