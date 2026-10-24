#!/usr/bin/env node
/**
 * 合并语言包：
 *   - 已有包（105 条手写 UI，人工润色，优先级最高）
 *   - _i18n_work/translated/{en,ja}/*.json（译者产出，格式 { 原文: 译文 }）
 *   - cleanup 阶段产出的日语（旧原文 → {zh, ja}，这里按清理后的中文重新挂键）
 *   - zh-Hant：OpenCC s2twp 从最终简中原文自动转换
 *
 *   node tools/_i18n_build_packs.mjs            # 只报告覆盖率，不写文件
 *   node tools/_i18n_build_packs.mjs --write    # 写 src/i18n/packs/*.js
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WORK = join(ROOT, '_i18n_work');
const PACKS = join(ROOT, 'src/i18n/packs');
const write = process.argv.includes('--write');

const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HAN = /[\u3400-\u9fff]/;
const SIMP_ONLY = /[们这说门边见现实现发关开无为乐书车马鸟鱼龙龟贝页风飞个吗还进过对从么]/;

const source = JSON.parse(readFileSync(join(WORK, 'source.json'), 'utf8'));
const sourceKeys = source.entries.map((e) => e.k);

// 静态界面文案：不在剧情/曲目源里，但 localizeDom / 手写 UI 会用到。
// 结构 { 原文: { en, ja, 'zh-Hant'? } }，缺 zh-Hant 时交给 OpenCC。
const extraPath = ['ui-extra-local.json', 'ui-extra-2.json', 'ui-extra.json']
  .map((f) => join(WORK, f))
  .find((p) => existsSync(p));
const extra = extraPath ? JSON.parse(readFileSync(extraPath, 'utf8')) : {};
const extraKeys = Object.keys(extra);
const keys = [...new Set([...sourceKeys, ...extraKeys])];
console.log(`source：${sourceKeys.length} 条；静态 UI：${extraKeys.length} 条；合计 ${keys.length} 条`);

const loadJsonDir = (dir) => {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const obj = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
  }
  return out;
};

const translatedEn = loadJsonDir(join(WORK, 'translated/en'));
const translatedJa = loadJsonDir(join(WORK, 'translated/ja'));
// 人工审校后的最终定稿层（优先级最高，避免被 cleanup 自动规则回退）
const reviewedJa = existsSync(join(WORK, 'reviewed', 'ja.json'))
  ? JSON.parse(readFileSync(join(WORK, 'reviewed', 'ja.json'), 'utf8'))
  : {};
console.log(`译者 en：${Object.keys(translatedEn).length} 条`);
console.log(`译者 ja：${Object.keys(translatedJa).length} 条；审校定稿：${Object.keys(reviewedJa).length} 条`);

const extraEn = {};
const extraJa = {};
const extraHant = {};
for (const [k, v] of Object.entries(extra)) {
  if (v && typeof v.en === 'string' && v.en.trim()) extraEn[k] = v.en;
  if (v && typeof v.ja === 'string' && v.ja.trim()) extraJa[k] = v.ja;
  if (v && typeof v['zh-Hant'] === 'string' && v['zh-Hant'].trim()) extraHant[k] = v['zh-Hant'];
}

const jaAuto = {};
const cleanDir = join(WORK, 'cleanup');
if (existsSync(cleanDir)) {
  for (const f of readdirSync(cleanDir)) {
    if (!f.endsWith('.json')) continue;
    const obj = JSON.parse(readFileSync(join(cleanDir, f), 'utf8'));
    for (const v of Object.values(obj)) {
      if (v && typeof v.zh === 'string' && typeof v.ja === 'string' && v.ja.trim()) {
        if (jaAuto[v.zh] && jaAuto[v.zh] !== v.ja) {
          console.warn(`  [cleanup ja 冲突] ${JSON.stringify(v.zh)}`);
        }
        jaAuto[v.zh] = v.ja;
      }
    }
  }
}
console.log(`cleanup ja：${Object.keys(jaAuto).length} 条（按清理后中文挂键）`);

const importPack = async (path) => {
  if (!existsSync(path)) return {};
  const mod = await import(pathToFileURL(path).href + `?t=${Date.now()}`);
  return (mod && mod.default) || {};
};

// 手写 UI 的权威副本（当前 packs 可能已被上一次增量 build 污染）
const BACKUP = join(ROOT, '_pt/i18n_backup_20261024');
const existing = {
  en: await importPack(join(BACKUP, 'en.js')),
  ja: await importPack(join(BACKUP, 'ja.js')),
  'zh-Hant': await importPack(join(BACKUP, 'zh-hant.js')),
};
console.log(`已有包：en ${Object.keys(existing.en).length} / ja ${Object.keys(existing.ja).length} / zh-Hant ${Object.keys(existing['zh-Hant']).length}`);

// zh-Hant：OpenCC 自动转换所有 source 原文
let zhAuto = {};
const zhAutoPath = join(WORK, 'zh_hant_auto.json');
if (existsSync(zhAutoPath)) {
  zhAuto = JSON.parse(readFileSync(zhAutoPath, 'utf8'));
}
const convertHant = (list) => {
  const py = join(ROOT, 'tools/_opencc_convert.py');
  const out = execFileSync('python', [py, 's2twp'], {
    input: JSON.stringify(list),
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 1024 * 1024 * 32,
  });
  return JSON.parse(out);
};
if (!Object.keys(zhAuto).length) {
  console.log('生成 OpenCC 繁中…');
  zhAuto = convertHant(keys);
  writeFileSync(join(WORK, 'zh_hant_auto.json'), JSON.stringify(zhAuto, null, 1) + '\n');
} else {
  const missingHant = keys.filter((k) => !(k in zhAuto));
  if (missingHant.length) {
    console.log(`补齐 OpenCC 繁中：${missingHant.length} 条…`);
    Object.assign(zhAuto, convertHant(missingHant));
    writeFileSync(join(WORK, 'zh_hant_auto.json'), JSON.stringify(zhAuto, null, 1) + '\n');
  }
}

// 合并优先级：译者/自动转换 > 手写 UI。
// 当前 packs 里可能残留上一次增量 build 的旧 story 译文，所以手写 UI 只取备份；
// 备份中不在 source 里的键才是真正的手写 UI/静态文案。
const sourceKeySet = new Set(keys);
const uiOnly = (dict) => Object.fromEntries(Object.entries(dict).filter(([k]) => !sourceKeySet.has(k)));
const packs = {
  en: { ...uiOnly(existing.en), ...extraEn, ...translatedEn },
  ja: { ...uiOnly(existing.ja), ...extraJa, ...translatedJa, ...jaAuto, ...reviewedJa },
  'zh-Hant': { ...uiOnly(existing['zh-Hant']), ...extraHant, ...zhAuto },
};
// 兜底：译者和自动转换都没覆盖到的 source 键，才回退到手写包
for (const [k, v] of Object.entries(existing.en)) if (!(k in packs.en)) packs.en[k] = v;
for (const [k, v] of Object.entries(existing.ja)) if (!(k in packs.ja)) packs.ja[k] = v;
for (const [k, v] of Object.entries(existing['zh-Hant'])) if (!(k in packs['zh-Hant'])) packs['zh-Hant'][k] = v;

const report = (tag, dict, needAll) => {
  const missing = keys.filter((k) => !(k in dict));
  console.log(`\n[${tag}] 覆盖 ${keys.length - missing.length}/${keys.length}，缺 ${missing.length}`);
  if (missing.length) {
    mkdirSync(join(WORK, 'missing'), { recursive: true });
    writeFileSync(join(WORK, `missing/${tag}.json`), JSON.stringify(missing, null, 1) + '\n');
    for (const k of missing.slice(0, 8)) console.log('   缺：', JSON.stringify(k));
  }
  const bad = [];
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (tag === 'zh-Hant' && (KANA.test(v) || SIMP_ONLY.test(v))) bad.push([k, v, KANA.test(v) ? 'kana' : 'simplified']);
    if (tag === 'en' && HAN.test(v)) bad.push([k, v, 'CJK']);
    if (tag === 'ja' && KANA.test(k)) bad.push([k, v, 'kana-key']);
  }
  if (bad.length) {
    console.log(`  污染告警 ${bad.length} 条：`);
    for (const b of bad.slice(0, 10)) console.log('   ', b[2], JSON.stringify(b[0]), '→', JSON.stringify(b[1]));
  }
  if (needAll && missing.length) process.exitCode = 2;
};

report('en', packs.en, false);
report('ja', packs.ja, false);
report('zh-Hant', packs['zh-Hant'], true);

if (!write) {
  console.log('\n（预演）加 --write 写回 src/i18n/packs/*.js');
  process.exit(process.exitCode || 0);
}

const header = (title, note) => `/**\n * ${title}\n * ${note}\n * 由 tools/_i18n_build_packs.mjs 生成；手写的 105 条 UI 译文保留在文件末尾。\n */\nexport default `;

const render = (dict) => {
  // 源顺序：source 里出现过的键按 source 顺序，其余（旧 UI 键）按字母序
  const srcOrder = new Map(keys.map((k, i) => [k, i]));
  const all = Object.keys(dict);
  all.sort((a, b) => {
    const ia = srcOrder.has(a) ? srcOrder.get(a) : Infinity;
    const ib = srcOrder.has(b) ? srcOrder.get(b) : Infinity;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, 'zh');
  });
  const lines = all.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`);
  return `{\n${lines.join('\n')}\n};\n`;
};

writeFileSync(
  join(PACKS, 'en.js'),
  header('English pack.', 'Key = simplified-Chinese source string (the `tr(...)` key in src); value = English.') + render(packs.en)
);
writeFileSync(
  join(PACKS, 'ja.js'),
  header('日本語パック。', 'キー = 簡体字中国語の原文、値 = 日本語訳。') + render(packs.ja)
);
writeFileSync(
  join(PACKS, 'zh-hant.js'),
  header('繁體中文語言包。', '鍵 = 簡體中文原文、值 = 繁中譯文（OpenCC s2twp 自動轉換，手寫 UI 保留）。') + render(packs['zh-Hant'])
);
console.log('已写 src/i18n/packs/en.js / ja.js / zh-hant.js');
