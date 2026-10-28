/**
 * 验证：标题页 EXTRA 未解锁时，点击后的反馈只剩「尚未解锁」状态句，
 * 不再写任何解锁方式（N / H / L 不续命通关即可开启）。
 *
 * 覆盖：
 *  - 真实鼠标点灰显的「门内的祭典」：不导航、仍留在标题页；
 *  - #hint 底部提示行与平台 toast 都只有「EXTRA 尚未解锁」；
 *  - 两处文案都不含「续命 / 难度 / 通关 / 开启 / N / H / L」；
 *  - en / ja / zh-hant 三个语言包都有新 key 且已无旧长句；
 *  - 控制台零报错，截图存 _extra_locked_after.png。
 *
 * 用法：node tools/_verify_extra_locked_hint.mjs（需本地 8138 静态服务）
 */
import { launch, sleep } from './_pt_core.mjs';
import { bootFresh, pageInfo, shot } from './_pt_flow_menu_util.mjs';
import en from '../src/i18n/packs/en.js';
import ja from '../src/i18n/packs/ja.js';
import zhHant from '../src/i18n/packs/zh-hant.js';

const KEY = 'EXTRA 尚未解锁';
const OLD_KEY = 'EXTRA 尚未解锁：用 N / H / L 难度不续命通关即可开启';
const BANNED = ['续命', '难度', '通关', '开启', 'N / H / L', 'H / L'];
// 关浏览器时会有一条「连接已断开」的待办请求被 reject，属于收尾噪音，不影响判定
process.on('unhandledRejection', (e) => {
  if (!/浏览器连接已断开/.test(String(e))) throw e;
});

const rows = [];
const chk = (ok, name, detail) => {
  rows.push({ ok: !!ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`);
};

const T = await launch({ port: 9412, width: 1280, height: 720 });
try {
  await bootFresh(T, { query: '?seed=20261028' });

  // 等开屏动画彻底结束：入场期间整屏在吃指针事件（点一下只是跳过动画），
  // 且按钮在入场中会被平移到屏外，此时点击等于「跳过开场」而不是点菜单。
  const settled = await T.waitFor(
    '(() => { const g = window.__game; return !!g && g._bootDone === true && !g._titleIntroOn && g._titleIntroProgress() >= 1; })()',
    12000, 120
  );
  chk(settled, '开屏动画结束、标题可点', settled);
  await sleep(400);

  const title = await pageInfo(T);
  chk(title.state === 'menu' && title.page === 'title', '启动到标题页', { state: title.state, page: title.page });

  // 找到灰显的 EXTRA 项（不依赖固定下标：按标签文本定位）
  const idx = title.buttons.findIndex((b) => /门内的祭典|EXTRA/.test(`${b.label} ${b.text}`));
  chk(idx >= 0, '标题页存在 EXTRA 项', title.buttons.map((b) => b.label || b.text));

  const clickInfo = await T.eval(`(() => {
    const el = document.querySelectorAll('#buttons .btn')[${idx}];
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, cls: el.className, text: (el.textContent || '').replace(/\\s+/g, ' ').trim() };
  })()`);
  chk(clickInfo.found && /locked/.test(clickInfo.cls || ''), 'EXTRA 处于 locked 视觉态', clickInfo);

  await T.mouse(clickInfo.x, clickInfo.y);
  await sleep(220);

  const readSnap = `(() => {
    const q = (s) => document.querySelector(s);
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const h = q('#hint');
    const t = q('.hks-toast');
    return {
      page: window.__game._page, state: window.__game.state,
      menuIndex: window.__game.menuIndex,
      introOn: !!window.__game._titleIntroOn,
      overlayHidden: q('#overlay').classList.contains('hidden'),
      hintShown: h ? !h.hidden : false,
      hint: h && !h.hidden ? norm(h.textContent) : '',
      toastShown: t ? t.classList.contains('show') : false,
      toast: t ? norm(t.textContent) : '',
    };
  })()`;
  let snap = await T.eval(readSnap);
  // 开屏 / 重绘竞态兜底：第一次点空就再点一次（真实玩家也不会只点一下就走）
  if (!snap.hintShown && !snap.toastShown) {
    await sleep(400);
    await T.mouse(clickInfo.x, clickInfo.y);
    await sleep(260);
    snap = await T.eval(readSnap);
  }

  const shotPath = await shot(T, '_extra_locked_after.png');
  chk(!!shotPath, '截图已保存', shotPath);
  console.log('[verify] snap', JSON.stringify(snap));

  chk(snap.state === 'menu' && !snap.overlayHidden, '点击锁定 EXTRA 不导航、仍留在标题', snap);
  chk(snap.hintShown, '底部提示行有显示', snap);
  chk(snap.hint === KEY, `提示行只剩「${KEY}」`, snap.hint);
  chk(snap.toastShown, 'toast 可见', snap);
  chk(snap.toast === KEY, `toast 只剩「${KEY}」`, snap.toast);

  const text = `${snap.hint} ${snap.toast}`;
  chk(!BANNED.some((w) => text.includes(w)), '提示与 toast 不含解锁方式字样', text);
  chk(!text.includes(OLD_KEY) && !text.includes('不续命'), '旧长句彻底消失', text);

  // 键盘路径：标题页按 E 也只给状态句（走 showExtraCharSelect → _extraLockedFeedback）
  await sleep(500);
  await T.key('KeyE');
  await sleep(420);
  const kb = await T.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const h = q('#hint');
    return {
      state: window.__game.state, page: window.__game._page,
      hint: h && !h.hidden ? norm(h.textContent) : '',
    };
  })()`);
  chk(kb.state === 'menu' && kb.page === 'title', '按 E 未解锁也不进入 EXTRA', kb);
  chk(kb.hint === KEY, `按 E 提示行只剩「${KEY}」`, kb.hint);
  chk(!BANNED.some((w) => kb.hint.includes(w)), '按 E 提示不含解锁方式字样', kb.hint);

  for (const [lang, pack] of [['en', en], ['ja', ja], ['zh-hant', zhHant]]) {
    chk(Object.prototype.hasOwnProperty.call(pack, KEY), `${lang} 包有「${KEY}」`, pack[KEY]);
    chk(!Object.prototype.hasOwnProperty.call(pack, OLD_KEY), `${lang} 包已删旧长句`, pack[OLD_KEY]);
  }

  const rep = await T.report();
  chk(rep.errors.filter((e) => !/favicon|preload/i.test(String(e))).length === 0, '控制台零报错', rep.errors.slice(0, 3));
} catch (e) {
  chk(false, '脚本执行未抛错', String(e && e.stack || e).slice(0, 400));
} finally {
  try { await T.close(); } catch {}
}

const fail = rows.filter((r) => !r.ok).length;
console.log(`\n[verify] ${rows.length - fail}/${rows.length} pass, ${fail} fail → ${fail ? 'FAILED' : 'OK'}`);
process.exit(fail ? 1 : 0);
