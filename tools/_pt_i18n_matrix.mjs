#!/usr/bin/env node
/**
 * 四语言 × 全屏截图矩阵：每个页面在 zh-Hans / zh-Hant / en / ja 下各拍一张，
 * 之后用 python 生成 2×2 对照图（tools/_i18n_matrix_sheet.py）。
 *
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_i18n_matrix.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/i18n-matrix';
mkdirSync(OUT, { recursive: true });
const LANGS = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
const SCREENS = ['title', 'settings', 'keybinds', 'difficulty', 'charselect', 'help', 'music', 'story', 'ending'];

const T = await launch();
const report = { shots: [], errors: [] };

async function shoot(lang, screen) {
  const path = `${OUT}/${screen}-${lang}.png`;
  await T.shot(path);
  report.shots.push({ lang, screen, path });
  return path;
}

async function boot(lang) {
  await T.boot({ query: `?lang=${lang}` });
  const ok = await T.waitFor('window.__game._bootDone === true', 15000);
  await sleep(250);
  return ok;
}

try {
  for (const lang of LANGS) {
    const booted = await boot(lang);
    if (!booted) { report.errors.push(`${lang}: boot failed`); continue; }

    await T.eval(`window.__game.showTitle()`);
    await T.waitFor(`!document.getElementById('overlay').classList.contains('hidden')`, 5000);
    // 标题页有 2.4s 开屏入场：直接跳到结束姿态，等按钮动画全部停稳再拍
    await T.eval(`window.__game._skipTitleIntro?.()`);
    await T.waitFor(
      `document.getElementById('buttons')?.getAnimations({ subtree: true }).every(a => a.playState !== 'running')`,
      8000
    );
    await sleep(250);
    await shoot(lang, 'title');

    await T.eval(`window.__game._showSettings(0, 'title')`);
    await sleep(250);
    await shoot(lang, 'settings');

    await T.eval(`window.__game.showKeybinds(0)`);
    await sleep(250);
    await shoot(lang, 'keybinds');

    await T.eval(`window.__game.showDifficultySelect()`);
    await sleep(250);
    await shoot(lang, 'difficulty');

    await T.eval(`window.__game.showCharSelect()`);
    await sleep(250);
    await shoot(lang, 'charselect');

    await T.eval(`window.__game.showHelp()`);
    await sleep(300);
    await shoot(lang, 'help');

    await T.eval(`window.__game.showMusicRoom()`);
    await T.waitFor(`!!document.querySelector('.mr-list, .mr-heading')`, 6000);
    await sleep(400);
    await shoot(lang, 'music');

    // 音乐室是整屏页面，会吃掉按键：先点「返回标题」退出来
    await T.eval(`document.querySelector('.mr-back')?.click()`);
    await T.waitFor(`!document.querySelector('.overlay')?.classList.contains('hidden')`, 6000).catch(() => {});
    await sleep(400);

    // 剧情：走难度 → 选人两下 Enter 进关，等对白铺开
    await T.eval(`window.__game.showDifficultySelect()`);
    await sleep(250);
    await T.key('Enter');
    await T.waitFor(`!!document.querySelector('.cc-card')`, 8000);
    await sleep(200);
    await T.key('Enter');
    const dlg = await T.waitFor(`!document.getElementById('dialogue').classList.contains('hidden')`, 20000);
    await sleep(1400);
    await shoot(lang, 'story');
    if (!dlg) report.errors.push(`${lang}: story dialogue timeout`);

    // 结局：直接播 good ending，等字幕上屏
    await T.eval(`(() => { const g = window.__game; g.dialogue?.stop?.(); g.char = 'reimu'; g._playEnding('good'); })()`);
    await T.waitFor(`(document.getElementById('edText')?.textContent || '').trim().length > 2`, 12000);
    await sleep(300);
    await shoot(lang, 'ending');
  }

  const rep = await T.report();
  report.errors.push(...rep.errors.map((e) => `js: ${e}`));
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(`shots=${report.shots.length} errors=${report.errors.length}`);
  if (report.errors.length) console.log(report.errors.slice(0, 5).join('\n'));
} finally {
  await T.close();
}
