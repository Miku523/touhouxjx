#!/usr/bin/env node
/**
 * P1a 界面层冒烟：选人页 / 难度页 / 操作说明 在 EN / JA / 繁中 下是否已翻译。
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_p1_ui.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/p1ui';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = (T, ms = 400) => T.eval(`new Promise((r) => setTimeout(r, ${ms}))`);

const T = await launch({ port: 9502 });
try {
  await T.boot({ query: '?lang=en' });
  await T.eval('new Promise((r) => { const t = setInterval(() => { if (window.__game?.state === "menu") { clearInterval(t); r(true); } }, 100); })');
  await settle(T, 600);

  /* ---------- 选人页 EN ---------- */
  await T.eval('window.__game.showCharSelect()');
  await settle(T, 500);
  const cs = await T.eval(`(() => ({
    title: document.querySelector('.panel-title')?.textContent || document.querySelector('.ov-title')?.textContent || document.title,
    labels: [...document.querySelectorAll('.cc-name, .set-label, .cc-note')].map((e) => e.textContent.trim()),
    hint: document.querySelector('.ov-hint')?.textContent || '',
    body: document.body.innerText,
  }))()`);
  check('选人页 EN 标题', cs.body.includes('Heroine') || cs.body.includes('protagonist') || cs.body.includes('Protagonist'), cs.title);
  check('选人页 EN 灵梦', cs.body.includes('Reimu Hakurei'));
  check('选人页 EN 魔理沙', cs.body.includes('Marisa Kirisame'));
  check('选人页 EN 符卡副名', cs.body.includes('Fantasy Seal'));
  await T.shot(`${OUT}/01-charselect-en.png`);

  /* ---------- 难度页 EN ---------- */
  await T.eval('window.__game.showDifficultySelect()');
  await settle(T, 450);
  const df = await T.eval('document.body.innerText');
  check('难度页 EN 标题', df.toLowerCase().includes('select difficulty'));
  check('难度页 EN 副名', df.includes('Easy') || df.includes('Normal') || df.includes('Hard') || df.includes('Lunatic'));
  await T.shot(`${OUT}/02-difficulty-en.png`);

  /* ---------- 操作说明 EN ---------- */
  await T.eval('window.__game.showHelp()');
  await settle(T, 450);
  const hp = await T.eval('document.body.innerText');
  check('操作说明 EN 标题', hp.includes('How to Play'));
  check('操作说明 EN 移动项', hp.includes('Move Left / Right') || hp.includes('Move left/right') || hp.includes('Move left / right'));
  check('操作说明 EN 判定点', hp.includes('Focus / Hitbox'));
  await T.shot(`${OUT}/03-help-en.png`);

  /* ---------- 切日文看选人页 ---------- */
  await T.eval(`window.__game._setLanguage('ja')`);
  await settle(T, 400);
  await T.eval('window.__game.showCharSelect()');
  await settle(T, 450);
  const csja = await T.eval('document.body.innerText');
  check('选人页 JA 标题', csja.includes('主人公') || csja.includes('キャラクター'));
  check('选人页 JA 灵梦', csja.includes('博麗霊夢'));
  await T.shot(`${OUT}/04-charselect-ja.png`);

  /* ---------- 切繁中 ---------- */
  await T.eval(`window.__game._setLanguage('zh-Hant')`);
  await settle(T, 400);
  await T.eval('window.__game.showCharSelect()');
  await settle(T, 450);
  const csh = await T.eval('document.body.innerText');
  check('选人页 繁中 標題', csh.includes('選擇主角'));
  check('选人页 繁中 靈夢', csh.includes('博麗靈夢'));
  await T.shot(`${OUT}/05-charselect-hant.png`);

  const jsErr = await T.eval('(window.__errs || []).length');
  check('无 JS 报错', !jsErr, String(jsErr));
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(checks, null, 1));
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await T.close?.();
  process.exit(failed ? 1 : 0);
}
