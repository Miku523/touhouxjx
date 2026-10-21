/**
 * 用 Seedream（火山 Ark）生成妖梦的两张立绘并直接接进游戏。
 *
 *   ARK_API_KEY=ark-xxx node tools/youmu_gen_art.mjs
 *   # 或让脚本自己去 ~/.dsh/.credentials.yaml 里读 ARK_API_KEY
 *   node tools/youmu_gen_art.mjs
 *
 * 可选：
 *   --model doubao-seedream-5-0-pro-260628  指定模型/接入点（ep-xxxx 也行）
 *   --size 1024x1536                     单张尺寸（默认竖图，Seedream 5.0 实测可用）
 *   --base-url https://...               换成别的 OpenAI 兼容生图接口（硅基流动/智谱等）
 *   --key ark-xxx                        直接传 key（优先于环境变量/凭据文件）
 *   --only battle|dialog                 只出一张
 *   --no-prep                            只出原图，不抠图落盘
 *
 * 流程：POST /api/v3/images/generations → 下载 url → tools/youmu_art_prep.py 抠白底 →
 *       src/art/gen/boss/youmu.png（战斗，内容高 640）+ src/art/gen/youmu.png（对话，内容高 560）。
 * 缺权限时会把 Ark 的原始错误打出来，不会静默失败。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const BASE = flag('base-url', process.env.IMAGE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3');
const MODEL = flag('model', process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-pro-260628');
const SIZE = flag('size', '1024x1536');
const ONLY = flag('only', null);
const NO_PREP = argv.includes('--no-prep');

function readKey(explicit) {
  if (explicit) return explicit.trim();
  if (process.env.ARK_API_KEY) return process.env.ARK_API_KEY.trim();
  const candidates = [
    path.join(os.homedir(), '.dsh', '.credentials.yaml'),
    path.join(process.env.USERPROFILE || '', '.dsh', '.credentials.yaml'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/^\s*ARK_API_KEY:\s*(\S+)\s*$/m);
    if (m) return m[1];
  }
  return null;
}

/**
 * 两张图的提示词 —— 注意：提示词里**不能出现角色名/作品名**（东方Project、魂魄妖梦、楼观剑…），
 * Ark 的版权过滤会直接返回 OutputImageSensitiveContentDetected.PolicyViolation；只描述外形即可。
 * 也给 docs/YOUMU_ART_PROMPT.md 留了同样一份，改动请同步两处。
 */
// 品红纯色底（不能是白底/浅色底）：白袜 + 白衬衫会被抠穿，见 tools/_youmu_matting.py 注释
const STYLE = 'anime style, cel shaded, clean soft lineart, subtle watercolor texture, isolated on a flat solid chroma magenta #FF00FF background, no glow, no aura, no petals, no falling leaves, no shadow, no text, no border, no other characters or spirits, whole figure in frame, solo';
const JOBS = [
  {
    id: 'battle',
    file: 'tools/_youmu_battle_raw.png',
    prompt: 'full body character illustration of a young swordswoman in a dynamic leap, short dark green hair with a black ribbon bow, pale red eyes, serious sharp gaze, white high-collar long-sleeve shirt, dark green buttoned vest with gold buttons, dark green pleated skirt, white knee socks, black and white shoes, a long slender katana in her right hand and a short dagger reversed in her left hand, faint mint green aura, falling petals, body turned facing right' + ', ' + STYLE,
  },
  {
    id: 'dialog',
    file: 'tools/_youmu_dialog_raw.png',
    prompt: 'character illustration of a young swordswoman standing calmly, front view slightly turned, short dark green hair with a black ribbon bow, pale red eyes, quiet serious expression, white high-collar long-sleeve shirt, dark green buttoned vest, dark green pleated skirt, white knee socks, black and white shoes, one hand resting on a long katana held upright at her side, the other hand holding a short dagger, composed upright posture, feet together' + ', ' + STYLE,
  },
];

async function generate(job, key) {
  const body = {
    model: MODEL,
    prompt: job.prompt,
    size: SIZE,
    response_format: 'url',
    watermark: false,
  };
  const res = await fetch(`${BASE.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.error) {
    const err = json?.error || { code: `HTTP ${res.status}`, message: text.slice(0, 300) };
    return { ok: false, code: err.code, message: err.message, requestId: err.request_id || '' };
  }
  const url = json.data?.[0]?.url;
  const b64 = json.data?.[0]?.b64_json;
  if (!url && !b64) return { ok: false, code: 'EMPTY', message: JSON.stringify(json).slice(0, 300) };
  const out = path.join(ROOT, job.file);
  if (url) {
    const img = await fetch(url);
    if (!img.ok) return { ok: false, code: `HTTP ${img.status}`, message: '下载图片失败' };
    fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));
  } else {
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  }
  return { ok: true, file: out };
}

function prep(job) {
  const mode = job.id; // battle / dialog，正好对应 youmu_art_prep.py 的两个模式
  const r = spawnSync('python', [path.join(ROOT, 'tools/youmu_art_prep.py'), path.join(ROOT, job.file), mode], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { ok: r.status === 0, out };
}

const key = readKey(flag('key', null));
if (!key) {
  console.error('找不到 key：用 --key 传入，或设置 ARK_API_KEY，或在 ~/.dsh/.credentials.yaml 写入 ARK_API_KEY。');
  process.exit(2);
}

const jobs = ONLY ? JOBS.filter((j) => j.id === ONLY) : JOBS;
if (!jobs.length) {
  console.error(`--only 只能是 ${JOBS.map((j) => j.id).join(' / ')}`);
  process.exit(2);
}

console.log(`接口 ${BASE}
模型 ${MODEL}  尺寸 ${SIZE}  目标 ${jobs.map((j) => j.id).join(' + ')}`);
let failed = 0;
for (const job of jobs) {
  process.stdout.write(`\n[${job.id}] 生成中… `);
  let r;
  try {
    r = await generate(job, key);
  } catch (e) {
    r = { ok: false, code: 'NETWORK', message: e.message };
  }
  if (!r.ok) {
    failed++;
    console.log('失败');
    console.log(`  code   : ${r.code}`);
    console.log(`  message: ${r.message}`);
    if (r.requestId) console.log(`  request: ${r.requestId}`);
    if (String(r.code).includes('NotFound') || /does not exist|no access/i.test(r.message)) {
      console.log('  → 这把 ARK key 对该模型没有权限：去火山方舟控制台确认模型已开通，或换成可用的模型名 / 接入点 ep-xxxx。');
    }
    continue;
  }
  console.log(`原图 ${path.relative(ROOT, r.file)}`);
  if (NO_PREP) continue;
  const p = prep(job);
  console.log(`  ${p.ok ? '抠图完成' : '抠图失败'}\n  ${p.out.split('\n').join('\n  ')}`);
  if (!p.ok) failed++;
}

console.log(failed ? `\n完成但有 ${failed} 项失败。` : '\n全部完成，刷新页面即可看到立绘。');
process.exit(failed ? 1 : 0);
