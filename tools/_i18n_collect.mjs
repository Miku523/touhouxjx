#!/usr/bin/env node
/**
 * 收集所有需要本地化的「游戏内文本」→ _i18n_work/source.json
 *
 * 口径（只收会显示给玩家的文案，不收注释 / 调试日志）：
 *   - 剧情 STORY：每一条 text（含 who，供译者判断语气）
 *   - 结局 ENDINGS：每条 text，以及结局卡 title / titleCn / quote / charName
 *   - Boss：名字、称号、符卡名
 *   - 关卡：title（HUD 横幅）、hint（开局提示）
 *   - 音乐室：曲名 / 副标题 / 分类 / 地点 / 原曲信息 / 解说
 *   - 角色名（CHAR_NAMES，对话名牌）
 *   - 少量散落在 hud.js / ending.js / spellCutin.js 里的固定文案
 *
 * 以「原文」去重：同一个原文只出现一次，运行时 tr() 也是按原文查表。
 * 输出给译者的是 _i18n_work/source.json + source.txt，不含中文注释。
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORY } from '../src/game/story.js';
import { ENDINGS } from '../src/game/endings.js';
import { BOSS_DEFS } from '../src/game/boss.js';
import { LEVELS } from '../src/assets/levels.js';
import { MUSIC_TRACKS } from '../src/game/musicTracks.js';

// dialogue.js 顶层会 new Image()（浏览器 API），Node 里不能直接 import。
// CHAR_NAMES 只是纯数据对象，直接从源码里读，避免把浏览器依赖带进审计脚本。
const CHAR_NAMES = (() => {
  const src = readFileSync(join(process.cwd(), 'src/game/dialogue.js'), 'utf8');
  const block = src.slice(src.indexOf('export const CHAR_NAMES = {'));
  const body = block.slice(0, block.indexOf('};') + 2);
  const out = {};
  for (const m of body.matchAll(/([A-Za-z0-9_]+):\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
})();

const ROOT = process.cwd();
const OUT = join(ROOT, '_i18n_work');
mkdirSync(OUT, { recursive: true });

/** @type {Map<string, {k:string, mods:Set<string>, who?:string, note?:string}>} */
const map = new Map();
const add = (k, mod, path, extra = {}) => {
  if (typeof k !== 'string' || !k) return;
  if (!/[\u3400-\u9fff\u3040-\u30ff]/.test(k)) return; // 纯英文 / 符号不收
  let rec = map.get(k);
  if (!rec) {
    rec = { k, mods: new Set(), ...extra };
    map.set(k, rec);
  }
  rec.mods.add(`${mod}:${path}`);
  if (!rec.who && extra.who) rec.who = extra.who;
  if (!rec.note && extra.note) rec.note = extra.note;
};

// ---------- 剧情 ----------
const walkLines = (node, mod, path) => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkLines(v, mod, `${path}[${i}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (typeof node.text === 'string') {
    add(node.text, mod, path, { who: node.who });
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'text') continue;
    if (v && typeof v === 'object') walkLines(v, mod, `${path}.${k}`);
  }
};
walkLines(STORY, 'story', 'STORY');

// ---------- 结局 ----------
walkLines(ENDINGS, 'ending', 'ENDINGS');
for (const [id, spec] of Object.entries(ENDINGS)) {
  for (const f of ['title', 'titleCn', 'quote', 'charName']) {
    add(spec[f], 'ending-card', `${id}.${f}`);
  }
}

// ---------- Boss ----------
for (const [key, def] of Object.entries(BOSS_DEFS)) {
  add(def.name, 'boss', `${key}.name`);
  add(def.title, 'boss', `${key}.title`);
  for (let i = 0; i < (def.phases || []).length; i++) {
    add(def.phases[i].name, 'boss', `${key}.phases[${i}].name`);
  }
}

// ---------- 关卡 ----------
for (const lv of LEVELS) {
  add(lv.title, 'level', `${lv.id}.title`);
  add(lv.hint, 'level', `${lv.id}.hint`);
}

// ---------- 音乐室 ----------
for (const tr of MUSIC_TRACKS) {
  for (const f of ['title', 'sub', 'cat', 'place', 'orig', 'note']) {
    add(tr[f], 'music', `${tr.key}.${f}`);
  }
}

// ---------- 角色名 ----------
for (const [key, name] of Object.entries(CHAR_NAMES)) {
  add(name, 'charname', key);
}

// ---------- 散落固定文案 ----------
const UI = [
  ['hud', '坚持 {n}s'],
  ['hud', '超时 · 击破 +10 点'],
  ['hud', '限时 剩余 {n}s'],
  ['hud', '火力 Lv.{lv} ↑'],
  ['ending', 'ENTER / 点击继续'],
  ['ending', 'ENTER / 点击返回'],
  ['dialogue', '灵梦'],
  ['dialogue', '魔理沙'],
  ['spellcutin', '梦想封印'],
  ['spellcutin', '灵符「梦想封印」'],
  ['spellcutin', '二重结界'],
  ['spellcutin', '梦符「二重结界」'],
  ['spellcutin', '极限火花'],
  ['spellcutin', '恋符「Master Spark」'],
  ['spellcutin', '星尘幻想'],
  ['spellcutin', '魔符「Stardust Reverie」'],
];
for (const [mod, k] of UI) add(k, mod, 'static');

// ---------- 输出 ----------
const entries = [...map.values()].map((r, i) => ({
  id: i,
  k: r.k,
  who: r.who || '',
  mods: [...r.mods],
  chars: r.k.length,
}));
entries.sort((a, b) => b.chars - a.chars || a.k.localeCompare(b.k, 'zh'));
entries.forEach((e, i) => { e.id = i; });

const kana = entries.filter((e) => /[\u3040-\u309f\u30a0-\u30ff]/.test(e.k));
const byMod = {};
for (const e of entries) {
  const m = e.mods[0].split(':')[0];
  byMod[m] = (byMod[m] || 0) + 1;
}
const totalChars = entries.reduce((a, e) => a + e.chars, 0);
const payload = {
  generatedAt: new Date().toISOString(),
  total: entries.length,
  totalChars,
  kana: kana.length,
  byMod,
  entries,
};
writeFileSync(join(OUT, 'source.json'), JSON.stringify(payload, null, 1) + '\n');

// 给译者看的人读版：一行一条，带 id / who / 出处
const lines = entries.map((e) => {
  const loc = e.mods[0].replace(/^([^:]+):/, '$1 ');
  return `#${String(e.id).padStart(4, '0')}${e.who ? ` <${e.who}>` : ''}  ${e.k}    // ${loc}`;
});
writeFileSync(join(OUT, 'source.txt'), lines.join('\n') + '\n');

console.log(`唯一原文：${entries.length} 条 / ${totalChars} 字`);
console.log(`其中含假名：${kana.length} 条`);
console.log('按模块：', byMod);
console.log(`已写 ${join(OUT, 'source.json')} 与 source.txt`);
