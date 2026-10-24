#!/usr/bin/env node
/**
 * 把 source.json 切成给译者/清理者的小块。
 *
 *   node tools/_i18n_chunks.mjs cleanup
 *   node tools/_i18n_chunks.mjs translate
 *
 * cleanup: 只取「含假名」的原文，按路径排序；story 300 条切 2 块，其余 64 条 1 块。
 * translate: 读取 source.json 与 _i18n_work/cleanup/*.json，按模块切块；
 *            已经被 cleanup 提供 ja 的条目不再进 ja 块。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORK = join(ROOT, '_i18n_work');
const CHUNKS = join(WORK, 'chunks');
mkdirSync(CHUNKS, { recursive: true });

const mode = process.argv[2] || 'cleanup';
const source = JSON.parse(readFileSync(join(WORK, 'source.json'), 'utf8'));
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;

const writeChunk = (name, entries) => {
  const file = join(CHUNKS, name + '.json');
  writeFileSync(file, JSON.stringify({
    note: 'k=原文；who=说话人；mods=出处（story/ending 可到 src 里看上下文）',
    count: entries.length,
    entries: entries.map((e) => ({ id: e.id, k: e.k, who: e.who || '', mods: e.mods })),
  }, null, 1) + '\n');
  console.log(`${name}: ${entries.length} 条  ${entries.reduce((a, e) => a + e.k.length, 0)} 字`);
};

/**
 * 把 `story:STORY.extra.intro.marisa[10]` 拆成可比较的段，
 * 让 [2] 排在 [10] 前面，译者能按剧情顺序读。
 */
const naturalKey = (path) => String(path || '').split(/([\[\]\.])/).filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
const sortByPath = (a, b) => {
  const aa = naturalKey(a.mods[0]);
  const bb = naturalKey(b.mods[0]);
  const n = Math.min(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (aa[i] === bb[i]) continue;
    if (typeof aa[i] === 'number' && typeof bb[i] === 'number') return aa[i] - bb[i];
    return String(aa[i]).localeCompare(String(bb[i]), 'en');
  }
  return aa.length - bb.length;
};

if (mode === 'cleanup') {
  const kana = source.entries.filter((e) => KANA.test(e.k)).sort(sortByPath);
  const story = kana.filter((e) => e.mods[0].startsWith('story:'));
  const rest = kana.filter((e) => !e.mods[0].startsWith('story:'));
  const half = Math.ceil(story.length / 2);
  writeChunk('cleanup-1', story.slice(0, half));
  writeChunk('cleanup-2', story.slice(half));
  writeChunk('cleanup-3', rest);
  console.log(`\n合计 ${kana.length} 条含假名原文`);
} else if (mode === 'translate') {
  const dir = join(WORK, 'cleanup');
  /** 清理后的中文原文 → 清理阶段已经给出的日语 */
  const jaDone = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const obj = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const v of Object.values(obj)) {
      if (v && typeof v.zh === 'string' && typeof v.ja === 'string' && v.ja.trim()) jaDone.add(v.zh);
    }
  }
  console.log(`cleanup 已给 ja：${jaDone.size} 条（按清理后中文）`);

  const all = source.entries.slice().sort(sortByPath);
  const story = all.filter((e) => e.mods[0].startsWith('story:'));
  const ending = all.filter((e) => e.mods[0].startsWith('ending:'));
  const other = all.filter((e) => !e.mods[0].startsWith('story:') && !e.mods[0].startsWith('ending:'));

  // en：全量
  const chunks = (arr, n, prefix) => {
    const per = Math.ceil(arr.length / n);
    for (let i = 0; i < n; i++) {
      const part = arr.slice(i * per, (i + 1) * per);
      if (part.length) writeChunk(`${prefix}-${i + 1}`, part);
    }
  };
  chunks(story, 4, 'en-story');
  writeChunk('en-ending', ending);
  writeChunk('en-other', other);

  // ja：cleanup 已给 ja 的跳过
  const needJa = (arr) => arr.filter((e) => !jaDone.has(e.k));
  const jaStory = needJa(story);
  chunks(jaStory, 3, 'ja-story');
  writeChunk('ja-ending', needJa(ending));
  writeChunk('ja-other', needJa(other));
  console.log('--- 已切块 ---');
}
