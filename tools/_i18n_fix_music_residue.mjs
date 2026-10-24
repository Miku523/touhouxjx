#!/usr/bin/env node
/** 修正音乐室三条残留：明日開催 / 竹取飛翔 / 風神少女，并 remap 译文键。 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WORK = join(ROOT, '_i18n_work');
const apply = process.argv.includes('--apply');
const subs = [
  ['例大祭、明日開催', '例大祭，明日举办'],
  ['竹取飛翔', '竹取飞翔'],
  ['風神少女', '风神少女'],
];

// 记录旧键（collector 的 source.json 是当前源）
const oldKeys = JSON.parse(readFileSync(join(WORK, 'source.json'), 'utf8')).entries.map((e) => e.k);
const changedKeys = [];
for (const k of oldKeys) {
  let n = k;
  for (const [a, b] of subs) n = n.split(a).join(b);
  if (n !== k) changedKeys.push([k, n]);
}
console.log('待 remap 键：', changedKeys.length);
for (const [a, b] of changedKeys) console.log('  ', JSON.stringify(a.slice(0, 40)), '→', JSON.stringify(b.slice(0, 40)));

if (apply) {
  const files = ['src/game/musicTracks.js'];
  for (const f of files) {
    let s = readFileSync(join(ROOT, f), 'utf8');
    let n = 0;
    for (const [a, b] of subs) {
      const c = s.split(a).length - 1;
      if (c) { s = s.split(a).join(b); n += c; }
    }
    writeFileSync(join(ROOT, f), s);
    console.log(`写回 ${f}: ${n} 处`);
  }
}

const remap = (dir) => {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const p = join(dir, f);
    const obj = JSON.parse(readFileSync(p, 'utf8'));
    let hit = 0;
    for (const [a, b] of changedKeys) {
      if (a in obj) { obj[b] = obj[a]; delete obj[a]; hit++; }
    }
    if (hit) { total += hit; if (apply) writeFileSync(p, JSON.stringify(obj, null, 1) + '\n'); console.log(`  remap ${p}: ${hit}`); }
  }
  return total;
};
console.log('remap en/ja：');
const n = remap(join(WORK, 'translated/en')) + remap(join(WORK, 'translated/ja'));
console.log('合计', n);

if (apply) {
  writeFileSync(join(WORK, 'zh_hant_auto.json'), '{}\n');
  execFileSync(process.execPath, [join(ROOT, 'tools/_i18n_collect.mjs')], { stdio: 'inherit' });
}
