/**
 * 装配《东方新纪行》的新剧本：把 docs/RE_STORY/_build/ 下的片段拼成 src/game/story.js。
 *
 * 用法（在仓库根目录）：node tools/_build_story.mjs
 *
 * 片段约定：只写对象字面量，例如
 *   opening: { reimu: [...], marisa: [...] },
 *   stage1: { reimu: {...}, marisa: {...} },
 * 片段内部的缩进会被整体平移到目标层级，不改动片段的相对排版。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUILD = path.join(ROOT, 'docs/RE_STORY/_build');
const TARGET = path.join(ROOT, 'src/game/story.js');

const STAGES = [
  ['stage1', '第一夜 · 博丽神社 · 灯还没点'],
  ['stage2', '第二夜 · 魔法森林 · 萤火不睡'],
  ['stage3', '第三夜 · 雾之湖 · 东边的天被冻住了'],
  ['stage4', '第四夜 · 妖怪之山 · 明天的报纸印不出来'],
  ['stage5', '第五夜 · 白玉楼 · 死者没有回来'],
  ['stage6', '第六夜 · 月都 · 借出去的一夜'],
];

const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

function firstIndent(text) {
  for (const line of text.split('\n')) {
    if (line.trim()) return line.match(/^ */)[0].length;
  }
  return 0;
}

/** 整体平移缩进到目标列；空行保持空 */
function shift(text, target) {
  const d = target - firstIndent(text);
  if (d === 0) return text;
  return text
    .split('\n')
    .map((line) => (line.trim() ? ' '.repeat(Math.max(0, d)) + line : ''))
    .join('\n')
    .replace(/\s+$/, '');
}

function frag(name) {
  const p = path.join(BUILD, `${name}.js`);
  if (!fs.existsSync(p)) throw new Error(`缺少片段：${p}`);
  let t = read(p).trim();
  if (!t.endsWith(',')) t += ',';
  return t;
}

const header = read(path.join(BUILD, '_header.txt')).trim();

// 旧的 story.js 只复用底部的 tips 与取词辅助函数（从「操作提示」注释开始到文件末尾）
const oldStory = read(TARGET);
const tailMark = '/* ---------------- 简短的操作提示（关卡开局用） ---------------- */';
const tailIdx = oldStory.indexOf(tailMark);
if (tailIdx < 0) throw new Error('没在现有 story.js 里找到 tips 尾段，拒绝覆盖');
const tail = oldStory.slice(tailIdx).trim();

const bars = (label) =>
  `  /* ================================================================\n      ${label}\n     ================================================================ */`;

const parts = [];
parts.push(header);
parts.push('export const STORY = {');
parts.push(bars('开场'));
parts.push(shift(frag('opening'), 2));
parts.push('');
parts.push(bars('六面'));
parts.push('  stages: {');
for (const [key, label] of STAGES) {
  parts.push(`    /* ---------------- ${label} ---------------- */`);
  parts.push(shift(frag(key), 4));
  parts.push('');
}
// 去掉六面最后多出的空行
while (parts[parts.length - 1] === '') parts.pop();
parts.push('  },');
parts.push('');
parts.push(bars('EXTRA'));
parts.push(shift(frag('extra'), 2));
parts.push('');
parts.push(tail);
parts.push('');

const out = parts.join('\n');
fs.writeFileSync(TARGET, out, 'utf8');

const lines = out.split('\n').length;
console.log(`已写入 ${path.relative(ROOT, TARGET)}：${lines} 行，${out.length} 字符`);
