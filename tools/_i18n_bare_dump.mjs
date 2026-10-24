#!/usr/bin/env node
/** 列出所有「裸中文」字面量及其位置（不做去重），用于人工判断是否上屏。 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const CJK = /[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/;
const TR_RE = /\btr\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
const LIT_RE = /(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
};

const rows = [];
for (const file of [...walk(SRC), join(ROOT, 'index.html')]) {
  if (file.includes(join('src', 'i18n', 'packs'))) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const keyed = new Set([...text.matchAll(TR_RE)].map((m) => m[2]));
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    const trimmed = ln.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const m of ln.matchAll(LIT_RE)) {
      const s = m[2];
      if (!CJK.test(s) || keyed.has(s)) continue;
      rows.push({ file: rel, line: i + 1, s });
    }
  });
}
const by = {};
for (const r of rows) (by[r.file] ||= []).push(r);
for (const [f, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n### ${f} (${list.length})`);
  for (const r of list) console.log(`${r.line}\t${r.s}`);
}
