#!/usr/bin/env node
/**
 * 校验译者输出的映射文件。
 *
 *   node tools/_i18n_check_map.mjs cleanup _i18n_work/chunks/cleanup-1.json _i18n_work/cleanup/clean-1.json
 *   node tools/_i18n_check_map.mjs en      _i18n_work/chunks/en-story-1.json _i18n_work/pack-en/en-story-1.json
 *   node tools/_i18n_check_map.mjs ja      _i18n_work/chunks/ja-story-1.json _i18n_work/pack-ja/ja-story-1.json
 *
 * 检查：JSON 合法、键完全一致、值非空、占位符一致、简中/繁中无假名、
 *      英文无 CJK、日文无「简体中文专用字」、长度异常告警。
 */
import { readFileSync } from 'node:fs';

const [mode, chunkFile, mapFile] = process.argv.slice(2);
if (!mode || !chunkFile || !mapFile) {
  console.error('usage: node tools/_i18n_check_map.mjs <cleanup|en|ja|zh-hant> <chunk.json> <map.json>');
  process.exit(2);
}
const chunk = JSON.parse(readFileSync(chunkFile, 'utf8'));
const raw = readFileSync(mapFile, 'utf8').replace(/^\uFEFF/, '').trim();
let map;
try {
  map = JSON.parse(raw);
} catch (e) {
  console.error('JSON 解析失败：' + e.message + '\n（不要包 json 代码围栏，不要注释尾逗号）');
  process.exit(1);
}
if (Array.isArray(map)) {
  // 也接受 [{k, t}] 形式
  const obj = {};
  for (const it of map) {
    if (!it || typeof it.k !== 'string') { console.error('数组项缺少 k'); process.exit(1); }
    obj[it.k] = it.t ?? it.v ?? it.zh ?? '';
  }
  map = obj;
}
if (!map || typeof map !== 'object') { console.error('映射必须是对象'); process.exit(1); }

const keys = chunk.entries.map((e) => e.k);
const missing = keys.filter((k) => map[k] === undefined);
const extra = Object.keys(map).filter((k) => !keys.includes(k));
const errors = [];
const warns = [];

const PLACE = /\{(\w+)\}/g;
const placeholders = (s) => [...String(s).matchAll(PLACE)].map((m) => m[1]).sort().join(',');
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const CJK = /[\u3400-\u9fff\u3040-\u30ff\u3000-\u303f\uff00-\uffef]/;
// 只列几乎不会出现在正常日文里的简体字；「与」「就」日语也用，不能误伤
const SIMPLIFIED_ONLY = /[们这说门边见现实现发关开无为乐书车马鸟鱼龙龟贝页风飞个吗还进过对从么]/;

const getText = (v, field) => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v[field] ?? '';
  return '';
};

for (const k of keys) {
  if (map[k] === undefined) continue;
  const v = map[k];
  let texts;
  if (mode === 'cleanup') {
    const zh = getText(v, 'zh');
    const ja = getText(v, 'ja');
    if (!zh || !ja) { errors.push(`[${k}] cleanup 需要 zh 与 ja 两个非空字段`); continue; }
    texts = [['zh', zh], ['ja', ja]];
  } else {
    texts = [[mode, getText(v, mode)]];
  }
  for (const [label, text] of texts) {
    if (!text || !text.trim()) { errors.push(`[${k}] ${label} 为空`); continue; }
    if (placeholders(text) !== placeholders(k)) {
      errors.push(`[${k}] ${label} 占位符不一致：原文 {${placeholders(k)}} / 译文 {${placeholders(text)}}`);
    }
    if ((label === 'zh' || label === 'zh-Hant') && KANA.test(text)) {
      errors.push(`[${k}] ${label} 仍含假名：${text.slice(0, 40)}`);
    }
    if (label === 'en' && CJK.test(text)) {
      errors.push(`[${k}] en 仍含中日文字符：${text.slice(0, 40)}`);
    }
    if (label === 'ja' && SIMPLIFIED_ONLY.test(text)) {
      errors.push(`[${k}] ja 含简体中文专用字：${text.slice(0, 40)}`);
    }
    if (k.length >= 8 && text.length > k.length * 4 + 20) {
      warns.push(`[${k}] ${label} 长度 ${text.length}，原文 ${k.length}`);
    }
  }
}

if (missing.length) errors.unshift(`缺 ${missing.length} 条：${missing.slice(0, 5).map((k) => k.slice(0, 30)).join(' / ')}`);
if (extra.length) errors.unshift(`多 ${extra.length} 条（键对不上）：${extra.slice(0, 5).map((k) => k.slice(0, 30)).join(' / ')}`);

if (warns.length) {
  console.log(`⚠ ${warns.length} 条长度告警（可接受，人工抽查）：`);
  for (const w of warns.slice(0, 8)) console.log('  ' + w);
}
if (errors.length) {
  console.error(`\n✗ ${mode} 校验失败，${errors.length} 个问题：`);
  for (const e of errors.slice(0, 30)) console.error('  - ' + e);
  if (errors.length > 30) console.error(`  … 另有 ${errors.length - 30} 个`);
  process.exit(1);
}
console.log(`✓ ${mode} 校验通过：${keys.length} 条，键完全一致`);
