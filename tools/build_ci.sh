#!/usr/bin/env bash
# CI 构建入口（GitHub Actions 与 Cloudflare Pages 共用）。
#
# 仓库里没有 package.json / 依赖声明，esbuild 是构建时现场装的，所以这条命令
# 必须是一整行、不能拆；写进脚本的好处是托管平台的 Build command 输入框只需要
# 填 `bash tools/build_ci.sh`，不会被输入框宽度截断。
#
# 产物：dist/（路径与文件名与源码一致，只做压缩，详见 tools/minify_build.mjs）
set -euo pipefail

npm i --no-save --no-audit --no-fund esbuild@0.24.0
node tools/minify_build.mjs --stats

# GitHub Pages / Cloudflare Pages 都不希望 Jekyll 插手
test -f dist/index.html
touch dist/.nojekyll
echo "[build_ci] dist/ 就绪：$(find dist -type f | wc -l) 个文件"
