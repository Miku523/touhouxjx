#!/usr/bin/env node
/** 审计剧情/结局文本在四语包里的键覆盖与字形纯净度。 */
import { STORY } from '../src/game/story.js';
import { ENDINGS } from '../src/game/endings.js';
import en from '../src/i18n/packs/en.js';
import ja from '../src/i18n/packs/ja.js';
import hant from '../src/i18n/packs/zh-hant.js';

const texts = new Set();
const speakers = new Set();
function walk(v) {
  if (!v) return;
  if (Array.isArray(v)) { for (const x of v) walk(x); return; }
  if (typeof v === 'object') {
    if (typeof v.text === 'string') texts.add(v.text);
    if (typeof v.who === 'string') speakers.add(v.who);
    for (const x of Object.values(v)) walk(x);
  }
}
walk(STORY);
walk(ENDINGS);

const cjk = /[\u3400-\u9fff]/u;
const kana = /[\u3040-\u30ff]/u;
const simp = /[们这说门边见现实现发关开无与为乐书车马鸟鱼龙龟贝页风飞个吗还进过对从么]/u;
const checks = [
  ['en', en, (v) => cjk.test(v) || kana.test(v), 'CJK/kana'],
  ['ja', ja, (v) => simp.test(v), '简体专用字'],
  ['zh-Hant', hant, (v) => simp.test(v) || kana.test(v), '简体字/kana'],
];
console.log('剧情文本唯一键', texts.size, '；who 值', speakers.size);
for (const [name, pack, bad, label] of checks) {
  let miss = 0, dirty = 0;
  const badSamples = [];
  for (const k of texts) {
    if (typeof pack[k] !== 'string' || !pack[k]) { miss++; continue; }
    if (bad(pack[k])) { dirty++; if (badSamples.length < 8) badSamples.push([k.slice(0, 30), pack[k].slice(0, 60), label]); }
  }
  console.log(`[${name}] 缺 ${miss} / 脏 ${dirty}`);
  for (const s of badSamples) console.log('   ', s);
}
