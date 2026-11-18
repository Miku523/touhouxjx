# -*- coding: utf-8 -*-
"""1.6.76：修「style.css 没到货时 .hidden 无效 → 标题页 DOM 糊在关卡画面上」。

三处改动：
1. index.html 的 boot-fallback 内联样式里补一条 .hidden 兜底（它原本只写在 src/style.css）。
2. main.js 的 loadGameCss() 加两次缓存破坏重试（原来是失败即放弃）。
3. 版本号 1.6.75 -> 1.6.76。
"""
import io
import re
import sys

OLD_VER = '1.6.75'
NEW_VER = '1.6.76'


def patch_index_html():
    p = 'index.html'
    s = io.open(p, encoding='utf-8', newline='').read()
    anchor = '  </style>\n  <!-- 老浏览器不支持 ES Module'
    assert s.count(anchor) == 1, 'boot-fallback 结尾锚点不唯一'
    inject = (
        '    /* 1.6.76：.hidden 原本只写在 src/style.css 里，而 style.css 在 1.6.51 起改成延后加载。\n'
        '       样式表没到货的那几秒，.hidden 不生效，#overlay 里的标题/菜单/面板 DOM 会直接糊在\n'
        '       关卡画面上（实测「进第一关像卡住、界面一堆灰色块」就是这条）。这里内联一份保命规则，\n'
        '       只做 display:none，不改任何观感。 */\n'
        '    .hidden { display: none !important; }\n'
    )
    s = s.replace(anchor, inject + anchor)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('index.html: 已内联 .hidden 兜底')


OLD_FN = """let _gameCssPromise = null;
function loadGameCss() {
  if (_gameCssPromise) return _gameCssPromise;
  _gameCssPromise = new Promise((resolve) => {
    if (document.getElementById('hks-game-css')) { resolve(); return; }
    const l = document.createElement('link');
    l.id = 'hks-game-css';
    l.rel = 'stylesheet';
    l.fetchPriority = 'low';
    l.href = new URL('./style.css', import.meta.url).href;
    l.onload = () => resolve();
    l.onerror = () => {
      // 样式表挂了不影响开跑：游戏内会退回浏览器默认样式，比卡在载入界面好
      if (typeof console !== 'undefined') console.warn('[css] style.css 载入失败，游戏内样式可能不全');
      resolve();
    };
    document.head.appendChild(l);
  });
  return _gameCssPromise;
}"""

NEW_FN = """let _gameCssPromise = null;
function loadGameCss(attempt = 0) {
  if (_gameCssPromise) return _gameCssPromise;
  _gameCssPromise = new Promise((resolve) => {
    if (document.getElementById('hks-game-css')) { resolve(); return; }
    const l = document.createElement('link');
    l.id = 'hks-game-css';
    l.rel = 'stylesheet';
    l.fetchPriority = 'low';
    // 1.6.76：失败不再一次就放弃。弱网下 style.css（约 140KB）被 SW 掐成 504 的概率不低，
    // 而它是整个游戏内 UI 的唯一样式来源 —— 少它一个，对话框/面板/HUD 全部裸 DOM。
    // 重试带 ?r=<n> 破坏缓存键，绕过上一轮那条 504 的缓存/连接；两次都失败才认命（内联 .hidden 兜底）。
    const base = new URL('./style.css', import.meta.url);
    if (attempt > 0) base.searchParams.set('r', String(attempt));
    l.href = base.href;
    l.onload = () => resolve();
    l.onerror = () => {
      try { l.remove(); } catch (e) { /* ignore */ }
      _gameCssPromise = null;
      if (attempt < 2) {
        setTimeout(() => {
          loadGameCss(attempt + 1).then(resolve);
        }, 600 * (attempt + 1));
        return;
      }
      if (typeof console !== 'undefined') console.warn('[css] style.css 载入失败（已重试 2 次），游戏内样式可能不全');
      resolve();
    };
    document.head.appendChild(l);
  });
  return _gameCssPromise;
}"""


def patch_main_js():
    p = 'src/main.js'
    s = io.open(p, encoding='utf-8', newline='').read()
    assert s.count(OLD_FN) == 1, 'loadGameCss 原文不唯一，检查是否有并发改动'
    s = s.replace(OLD_FN, NEW_FN)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('src/main.js: loadGameCss 已加两次重试')


def bump_version():
    targets = ['index.html', 'src/ui/platform.js', 'sw.js']
    total = 0
    for p in targets:
        s = io.open(p, encoding='utf-8', newline='').read()
        n = s.count(OLD_VER)
        if not n:
            print('!! %s 里没有 %s' % (p, OLD_VER))
            continue
        s = s.replace(OLD_VER, NEW_VER)
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
        total += n
        print('%s: %d 处 %s -> %s' % (p, n, OLD_VER, NEW_VER))
    print('版本串共替换 %d 处' % total)


if __name__ == '__main__':
    patch_index_html()
    patch_main_js()
    bump_version()
