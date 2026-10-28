#!/usr/bin/env node
// tools/_firstvisit_bytes.mjs —— 首访字节预算（静态求和，不开浏览器）
//
// 口径：把 index.html 里「首访必然会请求」的资源按 GitHub Pages 的传输形态估算——
//   文本类（html/js/css/webmanifest）取 gzip -9 后字节，图片取原始字节。
// 这不是「线上实测」，而是改动前后的同口径对比，用来守住首访预算不被悄悄推高。
//
// 用法：
//   node tools/_firstvisit_bytes.mjs             # 打印分桶与总计
//   node tools/_firstvisit_bytes.mjs --json      # 只输出 JSON（便于脚本对比）
//   node tools/_firstvisit_bytes.mjs --baseline  # 与 git HEAD 的 index.html 对比
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const asJson = args.includes('--json');

const html = readFileSync('index.html', 'utf8');
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

function hrefs(re) {
  const out = [];
  for (const m of html.matchAll(re)) out.push(m[1]);
  return out;
}
const unq = (s) => s.split('?')[0].split('#')[0];

const modules = hrefs(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/g).map(unq);
const styles = hrefs(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g).map(unq);
const preloadImgs = hrefs(/<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]*href=["']([^"']+)["']/g).map(unq);
const icons = [...new Set([...hrefs(/<link[^>]+rel=["'](?:apple-touch-icon|icon|mask-icon)["'][^>]+href=["']([^"']+)["']/g), './manifest.webmanifest'])].map(unq);

const rows = [];
function bucket(name, list, compress) {
  let total = 0, missing = [];
  const detail = [];
  for (const rel of [...new Set(list)]) {
    const p = rel.replace(/^\.\//, '');
    if (!existsSync(p)) { missing.push(p); continue; }
    const buf = readFileSync(p);
    const n = compress ? gz(buf) : buf.length;
    total += n;
    detail.push({ path: p, bytes: n });
  }
  rows.push({ name, count: detail.length, bytes: total, missing, detail });
  return total;
}

const bHtml = gz(Buffer.from(html, 'utf8'));
rows.push({ name: 'index.html', count: 1, bytes: bHtml, missing: [], detail: [] });
const bJs = bucket('js(modulepreload)', modules, true);
const bCss = bucket('css', styles, true);
const bImg = bucket('image(preload)', preloadImgs, false);
const bIcon = bucket('icon/manifest', icons, true);

const total = bHtml + bJs + bCss + bImg + bIcon;
const out = {
  generatedAt: new Date().toISOString(),
  totalBytes: total,
  totalKiB: +(total / 1024).toFixed(1),
  buckets: rows.map(({ name, count, bytes, missing }) => ({ name, count, bytes, KiB: +(bytes / 1024).toFixed(1), missing })),
};
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('首访字节预算（gzip -9 文本 / 原图 图片）');
  console.log('  index.html            ' + (bHtml / 1024).toFixed(1) + ' KiB');
  for (const r of out.buckets.slice(1)) {
    console.log('  ' + r.name.padEnd(21) + String(r.count).padStart(3) + ' 项  ' + r.KiB.toFixed(1) + ' KiB' + (r.missing.length ? '  [缺失 ' + r.missing.length + ']' : ''));
  }
  console.log('  ' + '-'.repeat(40));
  console.log('  合计                  ' + out.totalKiB + ' KiB');
  const miss = out.buckets.flatMap((b) => b.missing);
  if (miss.length) console.log('  ⚠ 缺失文件: ' + miss.join(', '));
}
