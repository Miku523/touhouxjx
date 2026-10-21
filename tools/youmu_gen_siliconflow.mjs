#!/usr/bin/env node
/**
 * 妖梦立绘出图（硅基流动 SiliconFlow 通道）。
 *
 * 用法：
 *   node tools/youmu_gen_siliconflow.mjs --key sk-xxx
 *   SILICONFLOW_API_KEY=sk-xxx node tools/youmu_gen_siliconflow.mjs
 *   node tools/youmu_gen_siliconflow.mjs --key sk-xxx --model Kwai-Kolors/Kolors --size 720x1440 --only battle
 *
 * 流程：出图（品红底）→ tools/youmu_art_prep.py 抠图缩放 → tools/youmu_silver.py 改银白发。
 * 与 Ark / Gemini 通道产物一致，三条通道可互换。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.siliconflow.cn/v1/images/generations';

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const KEY = arg('key') || process.env.SILICONFLOW_API_KEY || '';
const MODEL = arg('model', 'Kwai-Kolors/Kolors');
const SIZE = arg('size', '960x1280');
const ONLY = arg('only', 'both');
const NO_PREP = argv.includes('--no-prep');
const NEGATIVE = arg(
  'negative',
  '3d, realistic, photorealistic, render, cgi, depth of field, blur, watermark, signature, text, ' +
    'close-up, cropped, half body, petals, glow, background scenery, shadow, drop shadow, ' +
    'cast shadow, watermark, signature, text, logo',
);

// 品红底：抠图靠色相，白底会把白袜/白衬衫啃穿（见 tools/_youmu_matting.py 注释）
const STYLE =
  '2d anime illustration, flat cel shading, clean crisp lineart, official game art, ' +
  'touhou style, low saturation, ' +
  'isolated on a flat solid chroma magenta #FF00FF background, no glow, no aura, ' +
  'no falling petals, no shadow, no text, no border, no other characters or spirits, ' +
  'whole figure in frame, solo, full body';

const OUTFIT =
  'short silver white bob hair with a large black ribbon bow tied at the back of her head, ' +
  'pale red eyes, white high-collar long-sleeve shirt with a black bow tie at the collar, ' +
  'dark green sleeveless vest with black buttons, plain dark green knee-length skirt with a white ' +
  'frilled trim along the hem and no pattern on the clothes, ' +
  'a small translucent white ghost spirit floating beside her shoulder, soft wispy body with a ' +
  'wavy tail and a peaceful little face, ' +
  'white knee-high socks with fold over cuffs, black leather shoes, ' +
  'exactly two weapons: a long slender katana and a short dagger, no extra blades';

const JOBS = {
  battle:
    'full body character illustration of a young swordswoman in a dynamic leap, ' +
    OUTFIT +
    ', long katana in her right hand and short dagger reversed in her left hand, body turned facing right, ' +
    STYLE,
  dialog:
    'character illustration of a young swordswoman standing calmly, front view slightly turned, ' +
    OUTFIT +
    ', one hand resting on a long katana held upright at her side, the other hand holding the short dagger, ' +
    'quiet serious expression, composed upright posture, feet together, ' +
    'the magenta background fills the frame down to the bottom edge, her shoes are drawn ' + 'directly in front of the magenta background, no floor, no ground plane, no platform, ' + 'no shadow beneath her feet, no ground line, ' +
    STYLE,
};

const PREP = {
  battle: { mode: 'battle', dst: 'src/art/gen/boss/youmu.png', raw: 'tools/_youmu_battle_sf.png' },
  dialog: { mode: 'dialog', dst: 'src/art/gen/youmu.png', raw: 'tools/_youmu_dialog_sf.png' },
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function generate(prompt) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      negative_prompt: NEGATIVE,
      image_size: SIZE,
      batch_size: 1,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code) {
    const msg = json.message || json.error?.message || JSON.stringify(json).slice(0, 300);
    throw new Error(`${res.status} ${msg}`.slice(0, 400));
  }
  const url = json?.images?.[0]?.url || json?.data?.[0]?.url;
  if (!url) throw new Error(`响应里没有图片：${JSON.stringify(json).slice(0, 200)}`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`下载图片失败 ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} 失败（退出 ${r.status}）`);
}

if (!KEY) fail('缺少 key：用 --key sk-xxx 或设置 SILICONFLOW_API_KEY 环境变量');

const targets = ONLY === 'both' ? ['battle', 'dialog'] : [ONLY];
for (const name of targets) {
  if (!JOBS[name]) fail(`未知目标：${name}（可选 battle / dialog / both）`);
}

console.log(`接口 ${API}\n模型 ${MODEL}  尺寸 ${SIZE}\n`);

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
