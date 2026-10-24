#!/usr/bin/env node
/**
 * 修正简中源里最后的日文残留（t2s 无法处理的日文新字体 / 和制汉字），
 * 并把已翻译文件与语言包的旧键 remap 到修正后的新键。
 *
 *   node tools/_i18n_fix_zh.mjs            # 预演
 *   node tools/_i18n_fix_zh.mjs --apply    # 写源 + remap 译文
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WORK = join(ROOT, '_i18n_work');
const apply = process.argv.includes('--apply');

/** 整句 old -> new（必须逐字匹配，避免子串误伤） */
const MAP = new Map([
  ['头版还是那句「例大祭、明日開催」——印不出来，也不肯删。', '头版还是那句「例大祭，明日举办」——印不出来，也不肯删。'],
  ['头条是「例大祭、明日開催」。', '头条是「例大祭，明日举办」。'],
  ['「例大祭、明日開催」。', '「例大祭，明日举办」。'],
  ['原曲「広有射怪鳥事 ～ Till When?」/ 作曲：ZUN / 编曲：Miku523', '原曲「广有射怪鸟事 ～ Till When?」/ 作曲：ZUN / 编曲：Miku523'],
  ['灵梦把信放在那张椅子上。信封上写着「博麗先代様」。', '灵梦把信放在那张椅子上。信封上写着「博丽先代大人」。'],
  ['主桌旁有一张空椅子，名牌上写着「博麗先代様」。', '主桌旁有一张空椅子，名牌上写着「博丽先代大人」。'],
  ['信封很厚。收信人写着「博麗先代様」。', '信封很厚。收信人写着「博丽先代大人」。'],
  ['信很厚。收信人写着「博麗先代様」。', '信很厚。收信人写着「博丽先代大人」。'],
  ['信来了。信封上写着「博麗先代様」。', '信来了。信封上写着「博丽先代大人」。'],
  ['……博麗先代様。', '……博丽先代大人。'],
  ['（先代様。今年的名字，还是她。）', '（先代大人。今年的名字，还是她。）'],
  ['把那个亡霊收回来。', '把那个亡灵收回来。'],
  ['亡霊，你收不收。', '亡灵，你收不收。'],
  ['把亡霊收回去。', '把亡灵收回去。'],
  ['……毎年？', '……每年？'],
  ['毎年。', '每年。'],
  ['……誰。', '……谁。'],
  ['霊夢。', '灵梦。'],
]);

// 安全自检：每条 old 必须真的包含日文残留，new 不得再含
const JAPANESE_RESIDUE = /[様霊広毎開催誰]/;
for (const [oldK, newK] of MAP) {
  if (!JAPANESE_RESIDUE.test(oldK)) throw new Error(`旧键不含残留字符：${oldK}`);
  if (JAPANESE_RESIDUE.test(newK)) throw new Error(`新键仍含残留字符：${newK}`);
}

const files = [];
const walk = (dir) => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['_i18n_work', '_pt', 'art', 'assets'].includes(ent.name)) continue;
      walk(p);
    } else if (/\.(js|mjs|html)$/.test(ent.name)) {
      files.push(p);
    }
  }
};
walk(join(ROOT, 'src'));
for (const f of ['index.html']) {
  const p = join(ROOT, f);
  if (existsSync(p)) files.push(p);
}
for (const ent of readdirSync(join(ROOT, 'tools'))) {
  if (/\.(js|mjs)$/.test(ent.name)) files.push(join(ROOT, 'tools', ent.name));
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lit = (q, s) => q + s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q) + q;
const alts = [...MAP.keys()].sort((a, b) => b.length - a.length).map(escRe).join('|');
const re = new RegExp(`(['"])(${alts})\\1`, 'g');

let total = 0;
const perFile = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let n = 0;
  const out = src.replace(re, (m, q, old) => {
    const nk = MAP.get(old);
    if (!nk) return m;
    n++;
    return lit(q, nk);
  });
  if (n) {
    total += n;
    perFile.push([relative(ROOT, file), n]);
    if (apply) writeFileSync(file, out);
  }
}
perFile.sort((a, b) => b[1] - a[1]);
for (const [f, n] of perFile) console.log(`  ${f}: ${n}`);
console.log(`${apply ? '已写回' : '将写回'} ${total} 处，涉及 ${perFile.length} 个文件`);

// remap 译文 JSON：旧键 -> 新键；若新旧同时存在，保留新键已有值
const remapJson = (dir) => {
  if (!existsSync(dir)) return 0;
  let changed = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const p = join(dir, f);
    const obj = JSON.parse(readFileSync(p, 'utf8'));
    const out = {};
    let hit = 0;
    // 先放新键原值（如果已经有人直接用了新键，以它为准）
    for (const [k, v] of Object.entries(obj)) {
      if (!MAP.has(k)) out[k] = v;
    }
    // 再补旧键 remap；新键已存在时不覆盖
    for (const [k, v] of Object.entries(obj)) {
      if (!MAP.has(k)) continue;
      const nk = MAP.get(k);
      hit++;
      if (!(nk in out)) out[nk] = v;
    }
    if (hit) {
      changed += hit;
      console.log(`  remap ${relative(ROOT, p)}: ${hit} 键`);
      if (apply) writeFileSync(p, JSON.stringify(out, null, 1) + '\n');
    }
  }
  return changed;
};
console.log('\n译文 remap：');
const nEn = remapJson(join(WORK, 'translated/en'));
const nJa = remapJson(join(WORK, 'translated/ja'));

// 旧 zh_hant_auto 必须重生成，避免把旧键带进繁中包
if (apply && existsSync(join(WORK, 'zh_hant_auto.json'))) {
  console.log('\n删除旧 zh_hant_auto.json，下次 build 重新 OpenCC');
  writeFileSync(join(WORK, 'zh_hant_auto.json.bak'), readFileSync(join(WORK, 'zh_hant_auto.json')));
  // 留一个空对象，强制 build 重新生成
  writeFileSync(join(WORK, 'zh_hant_auto.json'), '{}');
}
if (apply && total) {
  console.log('\n重跑 collector…');
  execFileSync(process.execPath, [join(ROOT, 'tools/_i18n_collect.mjs')], { stdio: 'inherit' });
}
console.log(`\n完成：源 ${total} 处；译文 en ${nEn} / ja ${nJa} 键${apply ? '（已写）' : '（预演）'}`);
