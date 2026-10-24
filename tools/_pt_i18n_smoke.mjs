#!/usr/bin/env node
/**
 * i18n P0 冒烟：设置页语言行 + 四语热切换 + 持久化 + 无报错。
 * 标题页不再有快捷胶囊（主人 2026-10-24 取消），四语唯一入口 = 设置页「畫面」首行。
 *
 *   python tools/serve_nocache.py 8139      # 先起服务器（别和别的会话抢 8138）
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_i18n_smoke.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/i18n';
mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = (T, ms = 350) => T.eval(`new Promise((r) => setTimeout(r, ${ms}))`);
/** 轮询直到表达式为真（开屏动画 / 语言包加载都是异步的） */
const waitFor = async (T, expr, timeout = 15000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await T.eval(`!!(${expr})`)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  check(`waitFor: ${label}`, false, 'timeout');
  return false;
};
/** 等启动幕 + 标题入场（2.4s）都结束，截图才是静止姿态 */
/** 强制把标题入场收束到结束姿态（摘 .intro 会取消 CSS 动画 → 全部落到终态） */
const settleTitle = async (T, ms = 500) => {
  await T.eval(`(() => {
    const ov = document.querySelector('.overlay');
    if (ov) ov.classList.remove('intro');
    const g = window.__game;
    if (g) { g._titleIntroOn = false; clearTimeout(g._titleIntroTimer); }
    return true;
  })()`);
  await sleep(ms);
};

const bootReady = async (T) => {
  await waitFor(T, "window.__game && window.__game.state === 'menu'", 15000, 'game.state=menu');
  await waitFor(T, "document.querySelector('#boot')?.classList.contains('done')", 15000, '#boot.done');
  await sleep(1500); // 开屏淡出 → 标题交接（交接会重播一次入场）
  await settleTitle(T);
};

/** 并发开发时偶尔会撞上别人正在保存的半截源码：boot 失败重试，别把瞬时故障算成用例失败 */
const bootGame = async (T, query = '') => {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      await T.boot({ query });
      return;
    } catch (e) {
      last = e;
      console.log(`boot retry ${i + 1}: ${String(e).slice(0, 120)}`);
      await sleep(900);
    }
  }
  throw last;
};

const T = await launch({ port: 9501 });
try {
  /* ---------- 1. 首启：跟随浏览器语言（无存储 → 简中），标题页无胶囊 ---------- */
  await bootGame(T);
  await bootReady(T);
  const l0 = await T.eval('document.documentElement.lang');
  check('首启 lang = zh-CN（简中）', l0 === 'zh-CN', l0);

  const pill = await T.eval(`document.getElementById('langPill') ? 'present' : 'absent'`);
  check('标题页无快捷胶囊', pill === 'absent', pill);

  const titleBtns = await T.eval(`[...document.querySelectorAll('#buttons .btn .label')].map((e) => e.textContent).join('|')`);
  check('标题菜单按钮 = 简中原文', titleBtns.includes('开始游戏') && titleBtns.includes('设置'), titleBtns);
  await settleTitle(T);
  await settleTitle(T);
  await T.shot(`${OUT}/01-title-zh-Hans.png`);

  /* ---------- 2. 进设置页：语言行就位 ---------- */
  await T.key('KeyS');
  await settle(T, 400);
  const set0 = await T.eval(`(() => {
    const seg = document.querySelector('.seg-lang');
    return {
      page: window.__game._page,
      segN: seg ? seg.querySelectorAll('b').length : -1,
      on: seg ? seg.querySelector('b.on')?.dataset?.lang : null,
      labels: [...document.querySelectorAll('.set-label')].map((e) => e.textContent.trim()),
    };
  })()`);
  check('设置页 _page=settings', set0.page === 'settings', set0.page);
  check('语言行：4 个分段', set0.segN === 4, String(set0.segN));
  check('语言行：当前高亮简中', set0.on === 'zh-Hans', String(set0.on));
  check('语言行标签 = 语言', set0.labels.includes('语言'), set0.labels.slice(0, 8).join('|'));
  await T.shot(`${OUT}/02-settings-zh-Hans.png`);

  /* ---------- 3. 点分段切英文 ---------- */
  await T.eval(`document.querySelector('.seg-lang [data-lang="en"]').click()`);
  await settle(T, 500);
  const en = await T.eval(`(() => ({
    lang: document.documentElement.lang,
    page: window.__game._page,
    labels: [...document.querySelectorAll('.set-label')].map((e) => e.textContent.trim()),
    hudBtn: document.getElementById('settingsBtn').textContent,
    hudTitle: document.getElementById('settingsBtn').title,
    on: document.querySelector('.seg-lang b.on')?.dataset?.lang,
  }))()`);
  check('切英文：<html lang=en>', en.lang === 'en', en.lang);
  check('切英文：仍在设置页', en.page === 'settings', en.page);
  check('切英文：标签=Language', en.labels.includes('Language'), en.labels.slice(0, 8).join('|'));
  check('切英文：HUD 设置按钮英化', en.hudBtn === 'Settings' && en.hudTitle === 'Settings / Pause (Esc)', `${en.hudBtn} / ${en.hudTitle}`);
  check('切英文：分段高亮同步', en.on === 'en', String(en.on));
  await T.shot(`${OUT}/03-settings-en.png`);

  /* ---------- 4. 日文 ---------- */
  await T.eval(`document.querySelector('.seg-lang [data-lang="ja"]').click()`);
  await settle(T, 500);
  const ja = await T.eval(`(() => ({
    lang: document.documentElement.lang,
    page: window.__game._page,
    labels: [...document.querySelectorAll('.set-label')].map((e) => e.textContent.trim()),
  }))()`);
  check('切日文：<html lang=ja>', ja.lang === 'ja', ja.lang);
  check('切日文：仍在设置页', ja.page === 'settings', ja.page);
  check('切日文：标签=言語', ja.labels.includes('言語'), ja.labels.slice(0, 8).join('|'));
  await T.shot(`${OUT}/04-settings-ja.png`);

  /* ---------- 5. 繁中 + 字体栈跟随 ---------- */
  await T.eval(`document.querySelector('.seg-lang [data-lang="zh-Hant"]').click()`);
  await settle(T, 500);
  const hant = await T.eval(`(() => ({
    lang: document.documentElement.lang,
    labels: [...document.querySelectorAll('.set-label')].map((e) => e.textContent.trim()),
    serif: getComputedStyle(document.documentElement).getPropertyValue('--serif').trim(),
  }))()`);
  check('切繁中：<html lang=zh-Hant>', hant.lang === 'zh-Hant', hant.lang);
  check('切繁中：标签=語言', hant.labels.includes('語言'), hant.labels.slice(0, 8).join('|'));
  check('切繁中：字体栈切到 Songti TC 系', /Songti TC|PMingLiU|Noto Serif CJK TC/.test(hant.serif), hant.serif.slice(0, 40));
  await T.shot(`${OUT}/05-settings-zh-Hant.png`);

  /* ---------- 6. 键盘 → 从语言行循环 ---------- */
  const beforeCycle = await T.eval('document.querySelector(".seg-lang b.on")?.dataset.lang');
  await T.key('ArrowRight');
  await settle(T, 600);
  const afterCycle = await T.eval('document.querySelector(".seg-lang b.on")?.dataset.lang');
  check('键盘 → 从语言行循环切语言', !!afterCycle && afterCycle !== beforeCycle, `${beforeCycle} -> ${afterCycle}`);

  /* ---------- 7. 回标题：菜单跟着语言走 ---------- */
  await T.key('Escape');
  await settle(T, 400);
  const titleEn = await T.eval(`(() => ({
    page: window.__game._page,
    lang: document.documentElement.lang,
    labels: [...document.querySelectorAll('#buttons .btn .label')].map((e) => e.textContent).join('|'),
    pill: !!document.getElementById('langPill'),
  }))()`);
  check('Esc 回标题页', titleEn.page === 'title', titleEn.page);
  check('标题菜单已英化', /Start Game/.test(titleEn.labels) && /Settings/.test(titleEn.labels), titleEn.labels);
  check('标题页仍无胶囊', titleEn.pill === false, String(titleEn.pill));
  await settleTitle(T);
  await settleTitle(T);
  await T.shot(`${OUT}/06-title-en.png`);

  /* ---------- 8. 刷新后保持手动选择（持久化） ---------- */
  const saved = await T.eval(`JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').lang`);
  check('设置里已写入 lang 字段', saved === afterCycle, `${saved} vs ${afterCycle}`);
  await bootGame(T);
  await bootReady(T);
  const afterReload = await T.eval('document.documentElement.lang');
  check('刷新后语言保持', afterReload === (afterCycle === 'zh-Hans' ? 'zh-CN' : afterCycle), afterReload);

  /* ---------- 9. ?lang= 只预览、不落存储 ---------- */
  await T.eval(`window.__game._setLanguage('en')`);
  await settle(T, 500);
  const manualEn = await T.eval(`JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').lang`);
  check('手选 en 已持久化', manualEn === 'en', String(manualEn));
  await bootGame(T, '?lang=zh-Hant');
  await bootReady(T);
  const urlLang = await T.eval(`(() => ({
    lang: document.documentElement.lang,
    saved: JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').lang,
  }))()`);
  check('?lang=zh-Hant 生效', urlLang.lang === 'zh-Hant', urlLang.lang);
  check('?lang= 不写持久化（仍是手选 en）', urlLang.saved === 'en', String(urlLang.saved));
  await settleTitle(T);
  await settleTitle(T);
  await T.shot(`${OUT}/07-title-url-hant.png`);

  const rep = await T.report();
  check('无 JS 报错', rep.errors.length === 0, rep.errors.slice(0, 3).join(' | '));
  check('无 4xx/5xx', rep.httpBad.length === 0, JSON.stringify(rep.httpBad).slice(0, 200));
  check('无资源加载失败', rep.netFails.length === 0, JSON.stringify(rep.netFails).slice(0, 200));

  const fail = checks.filter((c) => !c.ok).length;
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks, errors: rep.errors, httpBad: rep.httpBad, netFails: rep.netFails }, null, 2));
  console.log(`\n${checks.length - fail}/${checks.length} passed  →  ${OUT}/report.json`);
  if (fail) process.exitCode = 1;
} finally {
  await T.close();
}
