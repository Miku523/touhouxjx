/**
 * 校验《东方新纪行》新剧本的数据完整性（不改任何文件，只读 + 打印报告）。
 *
 * 用法（仓库根目录）：node tools/_verify_story.mjs
 *
 * 覆盖：
 *   1. STORY 结构：opening / stages.stage1-6 / stage5 妖梦槽 / extra 四槽
 *   2. 每一句的 who / mood / 长度 / 禁用词 / 空段 / 重复句
 *   3. ENDINGS 六份：字段、3 shots、bg / cast / mote / glow 白名单、REGRET 与 TRUE 的出场规则
 *   4. MUSIC_TRACKS 19 首与 note 长度
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, '');
const load = (p, expr) => new Function(read(p).replace(/^export /gm, '') + `\nreturn ${expr};`)();

const errors = [];
const warns = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

const STORY = load('src/game/story.js', 'STORY');
const ENDINGS = load('src/game/endings.js', 'ENDINGS');
const MUSIC_TRACKS = load('src/game/musicTracks.js', 'MUSIC_TRACKS');

const STORY_WHO = [
  'player', 'partner', 'narrator', 'reimu', 'marisa',
  'rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya', 'flandre', 'remilia', 'youmu',
];
const MOODS = ['normal', 'smile', 'angry', 'sad', 'smug', 'panic'];
const BGS = [
  'shrine', 'shrine_2', 'forest', 'forest_2', 'lake', 'lake_2', 'mansion', 'mansion_2',
  'moon', 'moon_2', 'mountain', 'mountain_2', 'nether', 'nether_2',
];
const CAST = ['reimu', 'marisa', 'rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya', 'flandre', 'remilia', 'youmu'];
const MOTES = ['petals', 'ember', 'star'];
const BANNED = [
  '苹果糖', '蓝糖', '不落的春天', '第七十天', '禁忌的祭典',
  '名字都没问过', '许愿',
];

let lineCount = 0;
let charCount = 0;
const allTexts = new Map();

function checkLines(where, lines, expect) {
  if (!Array.isArray(lines) || !lines.length) {
    fail(`${where}: 不是非空数组`);
    return;
  }
  if (expect && (lines.length < expect[0] || lines.length > expect[1])) {
    warn(`${where}: ${lines.length} 句，期望 ${expect[0]}-${expect[1]}`);
  }
  let moods = 0;
  lines.forEach((ln, i) => {
    const at = `${where}[${i}]`;
    if (!ln || typeof ln !== 'object') return fail(`${at}: 不是对象`);
    if (!STORY_WHO.includes(ln.who)) fail(`${at}: who='${ln.who}' 不在白名单`);
    if (ln.mood !== undefined) {
      if (!MOODS.includes(ln.mood)) fail(`${at}: mood='${ln.mood}' 不在白名单`);
      moods++;
    }
    if (typeof ln.text !== 'string' || !ln.text.trim()) return fail(`${at}: text 为空`);
    const t = ln.text.trim();
    lineCount++;
    charCount += t.length;
    if (t.length > 44) fail(`${at}: ${t.length} 字超长 → ${t.slice(0, 20)}…`);
    else if (t.length > 42) warn(`${at}: ${t.length} 字略超（上限 42）`);
    for (const b of BANNED) if (t.includes(b)) fail(`${at}: 出现禁用词「${b}」`);
    if (/undefined|NaN|\[object/.test(t)) fail(`${at}: 文本含异常值 → ${t}`);
    const key = t.replace(/\s/g, '');
    allTexts.set(key, (allTexts.get(key) || 0) + 1);
  });
  if (moods > 3) warn(`${where}: mood 用了 ${moods} 处，建议 ≤3`);
}

/* ---------------- 1. 开场 ---------------- */
for (const r of ['reimu', 'marisa']) {
  checkLines(`opening.${r}`, STORY.opening?.[r], [16, 20]);
}

/* ---------------- 2. 六面 ---------------- */
const STAGE_KEYS = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'];
const stageKeys = Object.keys(STORY.stages || {});
if (stageKeys.join(',') !== STAGE_KEYS.join(',')) {
  fail(`stages 键应为 ${STAGE_KEYS.join(',')}，实际 ${stageKeys.join(',')}`);
}
for (const s of STAGE_KEYS) {
  const st = STORY.stages?.[s];
  if (!st) { fail(`stages.${s} 缺失`); continue; }
  for (const r of ['reimu', 'marisa']) {
    const route = st[r];
    if (!route) { fail(`stages.${s}.${r} 缺失`); continue; }
    checkLines(`stages.${s}.${r}.intro`, route.intro, [8, 14]);
    if (!Array.isArray(route.mid) || route.mid.length !== 3) {
      fail(`stages.${s}.${r}.mid 必须是 3 段（实际 ${route.mid?.length}）`);
    } else {
      route.mid.forEach((beat, i) => checkLines(`stages.${s}.${r}.mid[${i}]`, beat, [10, 16]));
    }
    checkLines(`stages.${s}.${r}.preBoss`, route.preBoss, [12, 18]);
    checkLines(`stages.${s}.${r}.postBoss`, route.postBoss, [12, 18]);
  }
  if (s === 'stage5') {
    checkLines(`stages.stage5.youmuPre`, st.youmuPre, [8, 12]);
    checkLines(`stages.stage5.youmuPost`, st.youmuPost, [8, 12]);
  }
}

/* ---------------- 3. EXTRA ---------------- */
const ex = STORY.extra || {};
const exKeys = Object.keys(ex).join(',');
if (exKeys !== 'intro,midBoss,midBossOut,preBoss,postBoss') {
  fail(`extra 键应为 intro,midBoss,midBossOut,preBoss,postBoss，实际 ${exKeys}`);
}
for (const r of ['reimu', 'marisa']) {
  checkLines(`extra.intro.${r}`, ex.intro?.[r], [12, 18]);
  checkLines(`extra.preBoss.${r}`, ex.preBoss?.[r], [20, 28]);
  checkLines(`extra.postBoss.${r}`, ex.postBoss?.[r], [12, 18]);
}
checkLines('extra.midBoss', ex.midBoss, [10, 16]);
checkLines('extra.midBossOut', ex.midBossOut, [14, 20]);

/* ---------------- 4. 重复句 ---------------- */
for (const [t, n] of allTexts) {
  if (n > 1) warn(`重复句 ×${n}：${t.slice(0, 28)}`);
}

/* ---------------- 5. ENDINGS ---------------- */
const ED_KEYS = ['ed1', 'ed2', 'ed3', 'ed4', 'edW1', 'edW2'];
const edKeys = Object.keys(ENDINGS || {});
if (edKeys.join(',') !== ED_KEYS.join(',')) fail(`ENDINGS 键应为 ${ED_KEYS.join(',')}，实际 ${edKeys.join(',')}`);

let edLines = 0;
for (const k of ED_KEYS) {
  const e = ENDINGS[k];
  if (!e) { fail(`ENDINGS.${k} 缺失`); continue; }
  for (const f of ['key', 'char', 'charName', 'code', 'noLabel', 'kindLabel', 'title', 'titleCn', 'en', 'quote', 'still', 'glow', 'mote']) {
    if (e[f] === undefined || e[f] === '') fail(`${k}.${f} 缺失`);
  }
  if (e.key !== k) fail(`${k}.key 应为 ${k}，实际 ${e.key}`);
  if (!BGS.includes(e.still)) fail(`${k}.still='${e.still}' 不在 bg 白名单`);
  if (!MOTES.includes(e.mote)) fail(`${k}.mote='${e.mote}' 不在白名单`);
  if (!/^\d{1,3},\s?\d{1,3},\s?\d{1,3}$/.test(String(e.glow))) fail(`${k}.glow='${e.glow}' 格式应为 "r,g,b"`);
  if (!Array.isArray(e.shots) || e.shots.length !== 3) {
    fail(`${k}.shots 必须是 3 段（实际 ${e.shots?.length}）`);
    continue;
  }
  const regret = k === 'ed1' || k === 'ed3';
  // 只有主线真结局才受「第一 shot 门未开」约束；W 结局是 Extra 之后在馆内办的祭典，门已经开了。
  const doorRule = regret || k === 'ed2' || k === 'ed4';
  e.shots.forEach((shot, si) => {
    const at = `${k}.shots[${si}]`;
    if (!BGS.includes(shot.bg)) fail(`${at}.bg='${shot.bg}' 不在白名单`);
    const cast = shot.cast || [];
    for (const c of cast) {
      if (!CAST.includes(c.key)) fail(`${at}.cast '${c.key}' 无立绘/不在白名单`);
      if (typeof c.x !== 'number' || typeof c.h !== 'number') fail(`${at}.cast '${c.key}' 缺 x/h`);
    }
    const castKeys = cast.map((c) => c.key);
    if (regret && castKeys.some((c) => c === 'flandre' || c === 'remilia')) {
      fail(`${at}: REGRET 结局门未开，cast 不能出现 flandre/remilia`);
    }
    if (!regret && doorRule && si === 0 && castKeys.some((c) => c === 'flandre' || c === 'remilia')) {
      fail(`${at}: 门未开前的第一 shot 不能有 flandre/remilia`);
    }
    checkLines(`${at}.lines`, shot.lines, [12, 30]);
    edLines += shot.lines?.length || 0;
  });
}

/* ---------------- 6. 音乐室 ---------------- */
if (!Array.isArray(MUSIC_TRACKS) || MUSIC_TRACKS.length !== 19) {
  fail(`MUSIC_TRACKS 应为 19 首，实际 ${MUSIC_TRACKS?.length}`);
} else {
  const keys = new Set();
  MUSIC_TRACKS.forEach((t, i) => {
    if (keys.has(t.key)) fail(`MUSIC_TRACKS[${i}] key 重复：${t.key}`);
    keys.add(t.key);
    if (!t.note || typeof t.note !== 'string') fail(`MUSIC_TRACKS[${i}](${t.key}) 缺 note`);
    else if (t.note.length < 100 || t.note.length > 260) {
      warn(`MUSIC_TRACKS[${i}](${t.key}) note ${t.note.length} 字，期望 100-260`);
    }
  });
}

/* ---------------- 7. 与引擎的接口 ---------------- */
for (const fn of ['routeOf', 'openingFor', 'stageStoryFor', 'extraIntroFor', 'extraPreFor', 'extraPostFor', 'midbossStoryFor', 'midbossPreFor', 'midbossPostFor']) {
  if (!read('src/game/story.js').includes(`export function ${fn}`)) fail(`story.js 缺少导出函数 ${fn}`);
}
if (!/this\._midShown = \[false, false, false\]/.test(read('src/main.js'))) {
  fail('main.js 的 _midShown 未扩成 3 位');
}
if (!/const thresholds = \[0\.22, 0\.48, 0\.72\]/.test(read('src/main.js'))) {
  fail('main.js 的三段道中阈值未生效');
}

/* ---------------- 报告 ---------------- */
console.log('== 体量 ==');
console.log(`主角台词行：${lineCount} 句，${charCount} 字`);
console.log(`结局台词行：${edLines} 句`);
const titles = Object.keys(ENDINGS || {}).map((k) => `${k}:${ENDINGS[k].title}`).join(' / ');
console.log(`结局：${titles}`);
console.log('== 逐关句数 ==');
for (const s of STAGE_KEYS) {
  const st = STORY.stages?.[s] || {};
  const row = ['reimu', 'marisa'].map((r) => {
    const t = st[r] || {};
    const mid = Array.isArray(t.mid) ? t.mid.map((b) => b.length).join('+') : '-';
    return `${r}: ${t.intro?.length ?? '-'} / ${mid} / ${t.preBoss?.length ?? '-'} / ${t.postBoss?.length ?? '-'}`;
  });
  const extra = s === 'stage5' ? ` | 妖梦 ${st.youmuPre?.length ?? '-'}+${st.youmuPost?.length ?? '-'}` : '';
  console.log(`  ${s}: ${row.join('  ||  ')}${extra}`);
}
console.log('');
if (warns.length) {
  console.log(`== 提醒 ${warns.length} 条 ==`);
  for (const w of warns.slice(0, 40)) console.log('  ~ ' + w);
  if (warns.length > 40) console.log(`  ……另有 ${warns.length - 40} 条`);
  console.log('');
}
if (errors.length) {
  console.log(`== ❌ 错误 ${errors.length} 条 ==`);
  for (const e of errors.slice(0, 60)) console.log('  x ' + e);
  if (errors.length > 60) console.log(`  ……另有 ${errors.length - 60} 条`);
  process.exitCode = 1;
} else {
  console.log('== ✅ 结构校验通过 ==');
}
