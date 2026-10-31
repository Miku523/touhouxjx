#!/usr/bin/env node
/**
 * 发布构建：把仓库目录原样复制成 dist/，其中所有 .js / .css 用 esbuild 压缩。
 *
 * 源码仓库保持零构建（直接可读、可直接开），线上产物走 dist/。
 * 路径与文件名完全不变，因此 index.html 的 ?v=、sw.js 的 PRECACHE、
 * import.meta.url 相对资源、动态 import() 路径全部无需改动。
 *
 * 用法：
 *   npm i --no-save esbuild@0.24.0     # 只装构建期依赖，不进运行时
 *   node tools/minify_build.mjs        # 生成 dist/
 *   node tools/minify_build.mjs --stats  # 额外打印每个文件的前后体积
 *
 * 不做的事：
 *   - 不 bundle（保持 ESM 模块图，浏览器按原样请求）
 *   - 不改 target（只删空白/注释、缩短标识符，不做语法降级）
 *   - 不碰图片、音频、html
 */
import { readdirSync, mkdirSync, copyFileSync, linkSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const STATS = process.argv.includes('--stats');

/** 不进入 dist 的顶层目录（开发/工具/产物） */
const SKIP_TOP = new Set([
  'node_modules', 'dist', '.git', '.github', '_perf', '_gate', '_shots_danmaku',
  'tools', 'docs', '_deploy', '_pt', '_q',
]);

const MINIFY_EXT = new Set(['.js', '.mjs', '.css']);
/** 需要压缩的顶层文件（根目录只有一个 sw.js） */
const MINIFY_TOP_FILES = new Set(['sw.js']);

const stats = [];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (dir === ROOT && SKIP_TOP.has(name)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push({ full, rel, size: st.size });
  }
}

async function main() {
  if (!existsSync(join(ROOT, 'node_modules', 'esbuild'))) {
    console.error('[minify] 缺少 esbuild，请先运行：npm i --no-save esbuild@0.24.0');
    process.exit(1);
  }
  const esbuild = await import('esbuild');

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const files = [];
  walk(ROOT, files);

  const minifyList = files.filter(f => {
    const ext = extname(f.rel).toLowerCase();
    if (MINIFY_TOP_FILES.has(f.rel)) return true;
    return MINIFY_EXT.has(ext) && f.rel.startsWith('src' + require_sep());
  });
  const copyList = files.filter(f => !minifyList.includes(f));

  // 1) 复制不压缩的资源（大文件用硬链接，避免每次构建搬 50MB 图片音频）
  let copied = 0, linked = 0;
  for (const f of copyList) {
    const dst = join(DIST, f.rel);
    mkdirSync(dirname(dst), { recursive: true });
    try {
      if (f.size > 256 * 1024) { linkSync(f.full, dst); linked++; }
      else { copyFileSync(f.full, dst); copied++; }
    } catch {
      copyFileSync(f.full, dst); copied++;
    }
  }

  // 2) 压缩 JS / CSS（保留模块结构，不 bundle）
  await esbuild.build({
    entryPoints: minifyList.map(f => f.full),
    outdir: DIST,
    outbase: ROOT,
    bundle: false,
    minify: true,
    legalComments: 'none',
    target: 'esnext',
    // 保留中文/日文字面量原样，不要转成 \uXXXX（否则含大量文案的文件反而变大）
    charset: 'utf8',
    logLevel: 'warning',
  });

  let rawJs = 0, minJs = 0, rawCss = 0, minCss = 0;
  for (const f of minifyList) {
    const dst = join(DIST, f.rel);
    let out = 0;
    try { out = statSync(dst).size; } catch { /* ignore */ }
    const isCss = extname(f.rel).toLowerCase() === '.css';
    if (isCss) { rawCss += f.size; minCss += out; } else { rawJs += f.size; minJs += out; }
    stats.push({ file: f.rel, before: f.size, after: out });
  }

  const pct = (a, b) => b ? `${(100 - a / b * 100).toFixed(1)}%` : '-';
  console.log(`[minify] JS  ${minifyList.filter(f => extname(f.rel) !== '.css').length} 个  ${(rawJs / 1024).toFixed(1)}KB -> ${(minJs / 1024).toFixed(1)}KB  (-${pct(minJs, rawJs)})`);
  console.log(`[minify] CSS ${minifyList.filter(f => extname(f.rel) === '.css').length} 个  ${(rawCss / 1024).toFixed(1)}KB -> ${(minCss / 1024).toFixed(1)}KB  (-${pct(minCss, rawCss)})`);
  console.log(`[minify] 复制 ${copied} 个 / 硬链接 ${linked} 个 / 压缩 ${minifyList.length} 个`);
  console.log(`[minify] 输出 ${DIST}`);

  if (STATS) {
    for (const s of stats.filter(s => s.before > 8000).sort((a, b) => b.before - a.before)) {
      console.log(`  ${s.file.padEnd(42)} ${(s.before / 1024).toFixed(1).padStart(8)}KB -> ${(s.after / 1024).toFixed(1).padStart(8)}KB  (-${pct(s.after, s.before)})`);
    }
  }
}

function require_sep() { return process.platform === 'win32' ? '\\' : '/'; }

main().catch(err => { console.error(err); process.exit(1); });
