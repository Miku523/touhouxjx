#!/usr/bin/env node
/**
 * 妖梦立绘出图（Google Gemini 图像模型通道）。
 *
 * 用法：
 *   node tools/youmu_gen_gemini.mjs --key <GEMINI_API_KEY>
 *   GEMINI_API_KEY=... node tools/youmu_gen_gemini.mjs
 *   node tools/youmu_gen_gemini.mjs --key ... --only battle --model gemini-2.5-flash-image
 *
 * 流程：出图（品红底）→ tools/youmu_art_prep.py 抠图缩放 → tools/youmu_silver.py 改银白发。
 * 与 Ark 通道（tools/youmu_gen_art.mjs）产物完全一致，两条通道可互换。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const KEY = arg('key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODEL = arg('model', 'gemini-2.5-flash-image');
const ONLY = arg('only', 'both');
const NO_PREP = argv.includes('--no-prep');

// 品红底：抠图靠色相，白底会把白袜/白衬衫啃穿（见 tools/_youmu_matting.py 注释）
const STYLE =
  'anime style, cel shaded, clean soft lineart, subtle watercolor texture, ' +
  'isolated on a flat solid chroma magenta #FF00FF background, no glow, no aura, ' +
  'no falling petals, no shadow, no text, no border, no other characters or spirits, ' +
  'whole figure in frame, solo, full body';

const OUTFIT =
  'short silver white bob hair with a large black ribbon bow tied at the back of her head, ' +
  'pale red eyes, white high-collar long-sleeve shirt with a black bow tie at the collar, ' +
  'dark green sleeveless vest with black buttons, dark green knee-length skirt printed with ' +
  'small white ghost shaped motifs and a white frilled trim along the hem, ' +
  'white knee-high socks with fold over cuffs, black leather shoes, ' +
  'a long slender katana and a short dagger';

const JOBS = {
  battle: [
    'full body character illustration of a young swordswoman in a dynamic leap, ',
    OUTFIT,
    ', long katana in her right hand and short dagger reversed in her left hand, body turned facing right',
    ', ',
    STYLE,
  ].join(''),
  dialog: [
    'character illustration of a young swordswoman standing calmly, front view slightly turned, ',
    OUTFIT,
    ', one hand resting on a long katana held upright at her side, the other hand holding the short dagger, ' +
      'quiet serious expression, composed upright posture, feet together',
    ', ',
    STYLE,
  ].join(''),
};

const PREP = {
  battle: { mode: 'battle', dst: 'src/art/gen/boss/youmu.png', raw: 'tools/_youmu_battle_gemini.png' },
  dialog: { mode: 'dialog', dst: 'src/art/gen/youmu.png', raw: 'tools/_youmu_dialog_gemini.png' },
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function generate(prompt) {
  const url = `${API}/${MODEL}:generateContent?key=${encodeURIComponent(KEY)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json.error || {};
    throw new Error(`${err.status || res.status} ${err.message || 'request failed'}`.slice(0, 400));
  }
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  const data = img?.inlineData?.data || img?.inline_data?.data;
  if (!data) {
    const txt = parts.map((p) => p.text).filter(Boolean).join(' / ').slice(0, 300);
    throw new Error(`响应里没有图片${txt ? `（模型回文本：${txt}）` : ''}`);
  }
  return Buffer.from(data, 'base64');
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} 失败（退出 ${r.status}）`);
}

if (!KEY) fail('缺少 key：用 --key <GEMINI_API_KEY> 或设置 GEMINI_API_KEY 环境变量');

const targets = ONLY === 'both' ? ['battle', 'dialog'] : [ONLY];
for (const name of targets) {
  if (!JOBS[name]) fail(`未知目标：${name}（可选 battle / dialog / both）`);
}

for (const name of targets) {
  const job = PREP[name];
  process.stdout.write(`[${name}] 生成中… `);
  let buf;
  try {
    buf = await generate(JOBS[name]);
  } catch (e) {
    console.log('失败');
    console.log(`  ${e.message}`);
    continue;
  }
  fs.writeFileSync(path.join(ROOT, job.raw), buf);
  console.log(`OK（${(buf.length / 1024).toFixed(0)} KB）`);
  if (NO_PREP) continue;
  run('python', ['tools/youmu_art_prep.py', job.raw, job.mode]);
  run('python', ['tools/youmu_silver.py', job.dst, job.dst]);
  console.log(`  → ${job.dst}`);
}
