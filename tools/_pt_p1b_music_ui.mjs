#!/usr/bin/env node
/**
 * P1b 音乐回忆室冒烟：EN / JA / 繁中 下静态标签与曲目档案是否已翻译。
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_p1b_music_ui.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/p1b';
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = (T, ms = 400) => T.eval(`new Promise((r) => setTimeout(r, ${ms}))`);

const openRoom = async (T) => {
  await T.eval('window.__game.showMusicRoom()');
  await settle(T, 500);
  // 解锁全部唱片，验证档案文案（真实游玩里由听过决定）
  await T.eval(`(() => {
    const mr = window.__game.musicRoom;
    mr.isHeard = () => true;
    mr._heard = new Set(mr.tracks.map((t) => t.key));
    mr._paintList();
    mr._paint();
  })()`);
  await settle(T, 400);
  return T.eval('document.body.innerText');
};

const T = await launch({ port: 9503 });
try {
  await T.boot({ query: '?lang=en' });
  await T.eval('new Promise((r) => { const t = setInterval(() => { if (window.__game?.state === "menu") { clearInterval(t); r(true); } }, 100); })');
  await settle(T, 600);

  const en = await openRoom(T);
  check('回忆室 EN 标题', en.includes('Music Room') || en.includes('Musical Recollections'), '');
  check('回忆室 EN 列表头', en.includes('Title') && en.includes('Length'));
  check('回忆室 EN 曲目名', en.includes('Apparitions Stalk the Night'));
  check('回忆室 EN 副题', en.includes('Theme') || en.includes('Rumia') || en.includes('Main'));
  check('回忆室 EN 地点', en.includes('Hakurei Shrine'));
  check('回忆室 EN 出处', en.includes('ZUN') && (en.includes('Composer') || en.includes('Composed') || en.includes('Arrangement')));
  check('回忆室 EN 底部操作', en.includes('Play / Stop') && en.includes('Preview 30s'));
  await T.shot(`${OUT}/01-music-en.png`);

  await T.eval(`window.__game._setLanguage('ja')`);
  await settle(T, 500);
  const ja = await openRoom(T);
  check('回忆室 JA 标题', ja.includes('音楽室') || ja.includes('音楽回想'));
  check('回忆室 JA 曲目名', ja.includes('妖魔夜行'));
  check('回忆室 JA 副题', ja.includes('テーマ曲') || ja.includes('ルーミア'));
  await T.shot(`${OUT}/02-music-ja.png`);

  await T.eval(`window.__game._setLanguage('zh-Hant')`);
  await settle(T, 500);
  const hant = await openRoom(T);
  check('回忆室 繁中 標題', hant.includes('音樂回憶室'));
  check('回忆室 繁中 曲目名', hant.includes('妖魔夜行'));
  check('回忆室 繁中 地點', hant.includes('博麗神社'));
  await T.shot(`${OUT}/03-music-hant.png`);

  const jsErr = await T.eval('(window.__errs || []).length');
  check('无 JS 报错', !jsErr, String(jsErr));
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(checks, null, 1));
  const fail = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - fail}/${checks.length} passed  →  ${OUT}/report.json`);
  await T.close();
  process.exit(fail ? 1 : 0);
}
