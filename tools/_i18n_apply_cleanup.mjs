#!/usr/bin/env node
/**
 * 把 cleanup 子任务产出的「含假名原文 → 纯简中 / 纯日文」映射写回源文件。
 *
 *   node tools/_i18n_apply_cleanup.mjs            # 预演：只报告会改多少处
 *   node tools/_i18n_apply_cleanup.mjs --apply    # 真正写文件
 *
 * 映射格式：{ "原文": { "zh": "纯简中", "ja": "日本語" } }
 *
 * 关键点：
 *  - 只替换「完整字符串字面量」（'...' / "..."），不做裸子串替换，避免误伤；
 *  - 一次性正则替换所有旧原文，避免 A→B 之后 B 又被二次替换；
 *  - 长的原文优先匹配，避免短句抢先吃掉长句的一部分；
 *  - 改完重跑 collector，检查「含假名」归零。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WORK = join(ROOT, '_i18n_work');
const CLEAN = join(WORK, 'cleanup');
const apply = process.argv.includes('--apply');

/** @type {Record<string, {zh:string, ja:string}>} */
const map = {};
if (!existsSync(CLEAN)) {
  console.error('没有 _i18n_work/cleanup/，先跑 cleanup 子任务');
  process.exit(1);
}
for (const f of readdirSync(CLEAN)) {
  if (!f.endsWith('.json')) continue;
  const obj = JSON.parse(readFileSync(join(CLEAN, f), 'utf8'));
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v.zh !== 'string' || !v.zh.trim()) continue;
    map[k] = { zh: v.zh, ja: typeof v.ja === 'string' ? v.ja : '' };
  }
}
console.log(`cleanup 映射：${Object.keys(map).length} 条`);

const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const oldKeys = Object.keys(map).filter((k) => KANA.test(k) && k.length > 0);
console.log(`含假名旧原文：${oldKeys.length} 条`);

// 源文件里所有可能承载文案的文件（只改 .js / .html，不动 md / 资源）
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
// tools 里的数据脚本不参与运行，但避免把旧句留在源里：也扫一遍
if (existsSync(join(ROOT, 'tools'))) {
  for (const ent of readdirSync(join(ROOT, 'tools'))) {
    if (/\.(js|mjs)$/.test(ent)) files.push(join(ROOT, 'tools', ent));
  }
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lit = (q, s) => q + s.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q) + q;

// 同时匹配单/双引号里的旧原文；按长度降序
const alts = oldKeys
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escRe)
  .join('|');
const re = new RegExp(`(['"])(${alts})\\1`, 'g');

let total = 0;
const perFile = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let n = 0;
  const out = src.replace(re, (m, q, old) => {
    const rec = map[old];
    if (!rec) return m;
    n++;
    return lit(q, rec.zh);
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

// 未覆盖检查：source.json 里仍含假名的条目
if (apply) {
  console.log('\n重跑 collector…');
  execFileSync(process.execPath, [join(ROOT, 'tools/_i18n_collect.mjs')], { stdio: 'inherit' });
  const source = JSON.parse(readFileSync(join(WORK, 'source.json'), 'utf8'));
  const left = source.entries.filter((e) => KANA.test(e.k));
  console.log(`\nsource.json 剩余含假名：${left.length} 条`);
  for (const e of left.slice(0, 20)) console.log('  ', JSON.stringify(e.k));
  if (left.length) process.exitCode = 2;
}
