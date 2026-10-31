# 部署：把压缩版发上线

线上原本由 **GitHub Pages 从 main 分支根目录**直接服务，只给 gzip、不支持 brotli。
`tools/minify_build.mjs` 会把 `src/**/*.js|css` + `sw.js` 用 esbuild 压成 `dist/`（路径文件名全不变）。

---

## 现状（2026-11-01 00:00）

| 路线 | 状态 | 说明 |
|---|---|---|
| **① GitHub Actions 发布 dist** | ✅ **已启用** | 线上 `src/main.js` 已是 87837B 压缩产物；版本 1.6.54 |
| **② Cloudflare Pages** | ⬜ 待做 | 额外拿到 brotli + anycast，TTFB 可从 0.6–1.7s 降到 0.1–0.4s |

---

## 方案一：GitHub Actions（已完成，留作参考）

`.github/workflows/pages.yml` 已入库：push 到 main 就自动
`npm i esbuild` → `node tools/minify_build.mjs` → `upload-pages-artifact(dist/)` → `deploy-pages`。

启用的那一步（**已经做过了**）：仓库 **Settings** → **Pages** → **Build and deployment** →
Source 从「Deploy from a branch」改成 **「GitHub Actions」**。

改动落地后每次 push 约 40s 部署完成。**不会再有任何东西坏**：`dist/` 在 `.gitignore` 里，
不污染仓库；万一 Actions 挂了，Pages 会保留上一次成功的产物。

---

## 方案二：Cloudflare Pages（照这个点）

目标是先拿到一个 `touhouxjx.pages.dev` 临时域名，**完全不碰你现有域名和 GitHub Pages**。

### 第 0 步：准备（约 2 分钟）

1. 打开 <https://dash.cloudflare.com/sign-up>，用邮箱注册（免费，不用信用卡）。
2. 邮箱验证完直接登录，会进到 Dashboard。

### 第 1 步：创建 Pages 项目（约 1 分钟）

1. 左侧栏 **Workers & Pages** → 右上 **Create**。
2. 选 **Pages** 标签页 → **Connect to Git**。
3. 点 **Connect GitHub** → 弹窗里授权 Cloudflare（可以只授权 `touhouxjx` 这一个仓库）。
4. 回到列表，选中 `Miku523/touhouxjx` → **Begin setup**。

### 第 2 步：填构建配置（照抄，一个字都别改）

| 字段 | 填什么 |
|---|---|
| Project name | `touhouxjx`（决定临时域名 `touhouxjx.pages.dev`，重名会报错，可加后缀） |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm install --no-save --no-audit --no-fund esbuild@0.24.0 && node tools/minify_build.mjs --stats` |
| Build output directory | `dist` |

再展开 **Environment variables (advanced)**，加一条：

| 变量名 | 值 |
|---|---|
| `NODE_VERSION` | `20` |

> 构建命令必须是一整行 `&&` 连起来的。仓库里没有 `package.json` 依赖声明，
> esbuild 是现场 `--no-save` 装的，split 成两条会失败。

### 第 3 步：首次构建（约 2–3 分钟）

点 **Save and Deploy**。构建日志里应该看到：

```
复制 ... / 硬链接 ... / 压缩 ...
JS  106 个 ... -> ...
CSS   4 个 ... -> ...
Built dist/ ...
```

状态变成 **Success** 后，页面顶部会给你 `https://touhouxjx.pages.dev`。

### 第 4 步：验收清单（逐条过一遍）

打开 `https://touhouxjx.pages.dev`，依次确认：

- [ ] 标题页正常出现（月亮 + 神社 + 灵梦立绘 + 左侧六个菜单项）
- [ ] 左下角版本号是 **ver 1.6.54**
- [ ] 点「开始游戏」→ 难度页 → 选人 → 能进第 1 面，弹幕和 Boss 正常
- [ ] **有 BGM 和音效**（这条最关键：1.6.54 把音频引擎改成首次点击才加载，要确认这条路径在别的域名下也通）
- [ ] 按 F12 → Console 没有红色报错；Application → Service Workers 里能看到注册成功
- [ ] 断网刷新能显示离线壳（可选，验证 SW 预缓存）

浏览器线上实测参考值（1.6.54 在 `mikuascendlog.com` 上）：到菜单 1.61–1.81s。
Cloudflare 应该更快，主要省在 TTFB（0.6s → 0.1–0.2s）。

### 第 5 步（可选）：绑自定义域名

**先别做**，等第 4 步全过、并且自己玩几天觉得稳。

两种做法：

- **保守（推荐）**：项目 → **Custom domains** → 添加 `game.mikuascendlog.com`，
  按提示加一条 CNAME。主域名保持现状，随时可回。
- **切主域**：添加 `mikuascendlog.com`。如果域名的 NS 还在别处，Cloudflare 会要求先迁 NS，
  迁的过程解析会有几分钟到几小时抖动。

> ⚠️ **存档会换**：游戏进度存在 `localStorage`，它按域名隔离。
> `mikuascendlog.com` → Cloudflare 只要域名不变、存档就在；换成 `game.` 子域或 `pages.dev`
> 则是**全新存档**。想带过去只能在旧页面用 F12 导出 `localStorage` 再在新域名写回去。

### 常见坑

| 现象 | 原因 |
|---|---|
| 构建报 `sh: esbuild: not found` | Build command 被拆成了两条，`npm install` 没在同一 shell 里生效 |
| 构建报 `Node version 14 is not supported` | 漏了 `NODE_VERSION=20` 环境变量 |
| 部署成功但页面 404 | Build output directory 写成了 `./dist` 或 `dist/`，只写 `dist` |
| 页面白屏、Console 报 MIME 错误 | `dist/` 里缺 `.nojekyll`（Actions 那条已处理），Pages 上正常不该出现；真遇到就查构建产物里有没有 `index.html` |

---

## 两个方案怎么选

| | GitHub Actions（已开） | Cloudflare Pages |
|---|---|---|
| 压缩 | ✔ | ✔ 同一套 `dist/` |
| brotli | ✘ 只有 gzip | ✔ 比 gzip 再省 15–20% |
| TTFB | 0.6–1.7s | 约 0.1–0.4s |
| 你要做的 | 无（已完成） | 第 0–4 步，约 10 分钟 |
| 存档影响 | 无 | 换域名才换存档，同域名不换 |

两个可以同时存在（GitHub Pages 留作兜底），实际访问走哪个域名由 DNS 决定。

---

## 本地怎么验证 dist 没问题

```bash
npm i --no-save esbuild@0.24.0
node tools/minify_build.mjs --stats                  # 生成 dist/

cd dist && python ../tools/serve_nocache.py 8139     # dist 版
cd ..   && python tools/serve_nocache.py 8138        # 源码版对照

PT_BASE=http://127.0.0.1:8139 node tools/_perf_smoke_kit.mjs      # 进关
PT_BASE=http://127.0.0.1:8139 node tools/_perf_smoke_ending.mjs   # 结局
PT_BASE=http://127.0.0.1:8139 node tools/_perf_smoke_ui.mjs       # 设置/回忆室
```

三个都 PASS 再发。压缩只做标识符缩短与空白压缩，不改语义；`import.meta.url`、
动态 `import()`、`?v=` 全部原样保留，所以路径不需要任何改动。

> 重建 `dist/` 前要先停掉占用它的服务进程，否则 esbuild 写盘会报
> `EPERM: Permission denied: '.../dist'`。
