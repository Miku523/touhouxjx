#!/usr/bin/env node
/**
 * i18n 抽取 / 覆盖率审计（零依赖，直接 node 跑）。
 *
 *   node tools/i18n_extract.mjs                 # 汇总：被 tr() 包住的文案、已翻译覆盖率、缺失清单
 *   node tools/i18n_extract.mjs --lang en,ja    # 只看某几门语言的缺口
 *   node tools/i18n_extract.mjs --template en   # 输出 en 的「待翻译模板」JSON（键=原文，值=空）
 *   node tools/i18n_extract.mjs --strict        # 有缺译就以退出码 1 结束（CI / 发版前用）
 *   node tools/i18n_extract.mjs --json _pt/i18n.json
 *
 * 两种统计口径：
 *   A. 键：源码里 `tr('…')` 包住的字符串 —— 必须进语言包才算翻到（这是硬指标）。
 *   B. 裸中文：没包 tr() 的中文字面量 —— 提示还有哪些地方没接线（P1/P2 的待办来源）。
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const LANGS = { 'zh-Hant': 'zh-hant.js', en: 'en.js', ja: 'ja.js' };
const CJK = /[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/;

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(name);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}

const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');

// A. tr('…') / tr("…") 里的键
const TR_RE = /\b(?:tr|i18n|t)\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
// B. 任意引号里的中文（用于找漏网）
const LIT_RE = /(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g;

const keyed = new Map(); // key -> [{file,line}]
const bare = new Map(); // text -> [{file,line}]
const addKey = (key, file, line) => {
  if (!key || !CJK.test(key)) return;
  if (!keyed.has(key)) keyed.set(key, []);
  keyed.get(key).push({ file, line });
};
const files = [...walk(SRC), join(ROOT, 'index.html')].filter((f) => !f.includes(`${join('src', 'i18n', 'packs')}`));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = text.split('\n');
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;
  for (const m of text.matchAll(TR_RE)) {
    const key = unescape(m[2]);
    addKey(key, rel, lineOf(m.index));
  }
  // index.html 里的静态钩子 data-i18n / data-i18n-title 也算键（运行时由 applyStaticTexts 填）
  for (const m of text.matchAll(/data-i18n(?:-title)?="([^"]*)"/g)) {
    addKey(m[1], rel, lineOf(m.index));
  }
  // 裸中文：跳过纯注释行，避免把说明文字算成待翻文案
  lines.forEach((ln, i) => {
    const trimmed = ln.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const m of ln.matchAll(LIT_RE)) {
      const s = unescape(m[2]);
      if (!CJK.test(s) || keyed.has(s)) continue;
      if (!bare.has(s)) bare.set(s, []);
      bare.get(s).push({ file: rel, line: i + 1 });
    }
  });
}

// input.js 的动作名 / 键名不是字面量 tr('…')，而是运行时 tr(ACTION_DEFS[..].label)、
// tr(KEY_NAMES[..])：把这两块的值也登记成键，否则它们会被误报成「多余键」。
{
  const file = join(SRC, 'engine', 'input.js');
  const src = readFileSync(file, 'utf8');
  const rel = 'src/engine/input.js';
  const lineAt = (idx) => src.slice(0, idx).split(String.fromCharCode(10)).length;
  const slice = (startMark, endMark) => {
    const i = src.indexOf(startMark);
    if (i < 0) return '';
    const j = src.indexOf(endMark, i + startMark.length);
    return src.slice(i, j < 0 ? undefined : j + endMark.length);
  };
  for (const m of slice('export const ACTION_DEFS = [', '];').matchAll(/label: +'([^']*)'/g)) {
    addKey(m[1], rel, lineAt(m.index));
  }
  for (const m of slice('const KEY_NAMES = {', '};').matchAll(/([A-Za-z0-9]+): +'([^']*)'/g)) {
    addKey(m[2], rel, lineAt(m.index));
  }
}

// 数据层动态键：这些文件里的中文字面量在运行时按需 tr()（曲目档案 / 难度短名 / 说话人名），
// 不是字面量 tr('…')，扫描规则不同，单独登记，避免被误报成「多余键」或「未接线」。
// 注意：曲目 note 在源码里是两段字符串拼接（正文 + 引语），字面量扫描会拆开、
// 与运行时真正的键对不上；这里直接 import 数据模块，按运行时对象递归收集字符串键。
const walkStrings = (node, visit) => {
  if (typeof node === 'string') return visit(node);
  if (Array.isArray(node)) return node.forEach((v) => walkStrings(v, visit));
  if (node && typeof node === 'object') return Object.values(node).forEach((v) => walkStrings(v, visit));
};
for (const relPath of ['src/game/musicTracks.js', 'src/game/difficulty.js']) {
  const mod = await import(pathToFileURL(join(ROOT, relPath)).href);
  for (const [name, val] of Object.entries(mod)) {
    if (name === 'default') continue;
    walkStrings(val, (str) => addKey(str, relPath, 1));
  }
}
{
  // boss.js 的符卡名 / Boss 名是运行时 tr(spell.name) 取用
  const rel = 'src/game/boss.js';
  const src = readFileSync(join(SRC, 'game', 'boss.js'), 'utf8');
  for (const m of src.matchAll(/name:\s*'([^']*)'/g)) addKey(m[1], rel, 1);
}
{
  // 剧情里的自称简称（tr(selfRaw)：灵梦 / 魔理沙）
  for (const s of ['灵梦', '魔理沙']) addKey(s, 'src/game/dialogue.js', 1);
}
{
  const rel = 'src/game/dialogue.js';
  const src = readFileSync(join(SRC, 'game', 'dialogue.js'), 'utf8');
  const a = src.indexOf('export const CHAR_NAMES');
  const b = src.indexOf('};', a);
  for (const m of src.slice(a, b).matchAll(/:\s*'([^']*)'/g)) addKey(m[1], rel, 1);
}

async function loadPack(lang) {
  const file = join(SRC, 'i18n', 'packs', LANGS[lang]);
  const mod = await import(pathToFileURL(file).href);
  return (mod && (mod.default || mod.dict)) || {};
}

const only = (opt('--lang', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const langs = only.length ? only : Object.keys(LANGS);
const packs = {};
for (const l of langs) packs[l] = await loadPack(l);

const allKeys = [...keyed.keys()];
console.log(`\n键（tr() 包住的中文）：${allKeys.length} 条`);
console.log(`裸中文（未接线）：${bare.size} 条\n`);
for (const l of langs) {
  const pack = packs[l];
  const missing = allKeys.filter((k) => pack[k] === undefined);
  const cover = allKeys.length - missing.length;
  const pct = allKeys.length ? ((cover / allKeys.length) * 100).toFixed(1) : '0.0';
  console.log(`[${l}] ${cover}/${allKeys.length} (${pct}%)` + (missing.length ? `  缺 ${missing.length}` : '  ✓ 全齐'));
  for (const k of missing.slice(0, 40)) {
    const where = keyed.get(k)[0];
    console.log(`    - ${k}    ← ${where.file}:${where.line}`);
  }
  if (missing.length > 40) console.log(`    … 另有 ${missing.length - 40} 条`);

  // 包里多余的键：源码已经改了字，翻译就失效了
  const extra = Object.keys(pack).filter((k) => !keyed.has(k));
  if (extra.length) console.log(`    多余键 ${extra.length}: ${extra.slice(0, 6).join(' / ')}${extra.length > 6 ? ' …' : ''}`);
  console.log('');
}

if (bare.size) {
  const byFile = new Map();
  for (const [, refs] of bare) for (const r of refs) byFile.set(r.file, (byFile.get(r.file) || 0) + 1);
  console.log('未接线的中文分布（P1/P2 待办）：');
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${f}`);
  console.log('');
}

if (flag('--template')) {
  const lang = opt('--template');
  const pack = packs[lang] || {};
  const tpl = {};
  for (const k of allKeys) if (pack[k] === undefined) tpl[k] = '';
  const out = `_pt/i18n-missing-${lang}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(tpl, null, 2) + '\n');
  console.log(`模板已写：${out}（${Object.keys(tpl).length} 条）`);
}

if (flag('--json')) {
  const out = opt('--json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({
    keys: allKeys,
    bare: [...bare.keys()],
    coverage: Object.fromEntries(langs.map((l) => {
      const miss = allKeys.filter((k) => packs[l][k] === undefined);
      return [l, { total: allKeys.length, translated: allKeys.length - miss.length, missing: miss }];
    })),
  }, null, 2) + '\n');
  console.log(`报告已写：${out}`);
}

if (flag('--strict')) {
  const bad = langs.filter((l) => allKeys.some((k) => packs[l][k] === undefined));
  if (bad.length) {
    console.error(`\n[strict] 仍有缺译：${bad.join(', ')}`);
    process.exit(1);
  }
}
