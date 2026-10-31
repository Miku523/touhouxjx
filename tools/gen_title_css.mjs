// 从 src/style.css 里提取「标题页首屏用得到」的规则，生成 src/title.css。
// 做法：真实浏览器渲染标题页后用 CSSOM 遍历，按「选择器能否命中 #boot / #overlay 子树」筛选，
// 剥掉 :hover/:focus 之类状态伪类再判断；带 .title-mode 等标题页专属祖先的一律保留。
// 用法：node tools/gen_title_css.mjs [--port=8138] [--write]
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, BASE } from './_pt_core.mjs';

const arg = (k, d) => {
  const m = process.argv.find((s) => s.startsWith('--' + k + '='));
  return m ? m.slice(k.length + 3) : d;
};
const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src', 'title.css');

const EXTRACT = String.raw`
(() => {
  const roots = [document.getElementById('boot'), document.getElementById('overlay')].filter(Boolean);
  const STATE_RE = /:(hover|active|focus|focus-visible|focus-within|target|disabled|enabled|checked|visited|link|any-link|placeholder-shown|invalid|valid|open|closed)\b/g;
  const TITLEISH = /\.title-mode|\.title-intro|#overlay|\.overlay|#boot|\.boot-/;

  function keep(selectorText) {
    const parts = String(selectorText || '').split(',').map(s => s.trim()).filter(Boolean);
    return parts.some(p => {
      const clean = p.replace(STATE_RE, '');
      if (!clean) return false;
      if (/^(?:\*|:root|html|body|::selection|:focus-visible)$/.test(clean)) return true;
      if (TITLEISH.test(clean)) return true;
      try {
        return roots.some(r => r.matches(clean) || r.querySelector(clean));
      } catch (e) { return false; }
    });
  }

  const out = [];
  const anim = new Set();

  function walk(rules) {
    for (const r of rules) {
      if (r.type === 7) {                        // @keyframes 先跳过，最后按 animation 名回收
        const m = /@(-webkit-)?keyframes\s+([^\s{]+)/.exec(r.cssText || '');
        if (m) anim.add(m[2]);
        continue;
      }
      if (r.type === 1) {                        // style rule
        if (keep(r.selectorText)) { out.push({ k: 'style', css: r.cssText }); collectAnim(r.cssText); }
      } else if (r.type === 4 || r.type === 12) { // @media / @supports
        const inner = [];
        walk2(r.cssRules, inner);
        if (inner.length) {
          const head = r.type === 4 ? '@media ' + r.conditionText : '@supports ' + r.conditionText;
          out.push({ k: 'block', head, kids: inner });
        }
      }
    }
  }
  function walk2(rules, sink) {                  // 嵌套块里的递归：只留 style rule
    for (const r of rules) {
      if (r.type === 1) {
        if (keep(r.selectorText)) { sink.push(r.cssText); collectAnim(r.cssText); }
      } else if (r.type === 7) {
        const m = /@(-webkit-)?keyframes\s+([^\s{]+)/.exec(r.cssText || '');
        if (m) anim.add(m[2]);
      }
    }
  }
  function collectAnim(css) {
    const re = /animation(?:-name)?\s*:\s*([^;}]+)/g;
    let m;
    while ((m = re.exec(css))) {
      for (const tok of m[1].split(/\s+/)) {
        const t = tok.replace(/[^A-Za-z0-9_-]/g, '');
        if (t && !/^\d/.test(t) && !/^(infinite|none|linear|ease|ease-in|ease-out|ease-in-out|alternate|reverse|forwards|backwards|both|running|paused|normal)$/.test(t)) anim.add(t);
      }
    }
  }

  let sheets = 0;
  for (const sheet of document.styleSheets) {
    let href = '';
    try { href = sheet.href || ''; } catch (e) { continue; }
    if (!/\/src\/style\.css/.test(href)) continue;
    sheets++;
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    walk(rules);
  }

  // keyframes 回收
  const kf = [];
  for (const sheet of document.styleSheets) {
    let href = ''; try { href = sheet.href || ''; } catch (e) { continue; }
    if (!/\/src\/style\.css/.test(href)) continue;
    for (const r of sheet.cssRules) {
      if (r.type === 7) {
        const m = /@(-webkit-)?keyframes\s+([^\s{]+)/.exec(r.cssText || '');
        if (m && anim.has(m[2])) kf.push(r.cssText);
      }
    }
  }

  const text = [];
  for (const it of out) {
    if (it.k === 'style') text.push(it.css);
    else text.push(it.head + ' {\n  ' + it.kids.join('\n  ') + '\n}');
  }
  for (const k of kf) text.push(k);
  return { css: text.join('\n'), rules: out.length, keyframes: kf.length, sheets, bytes: text.join('\n').length };
})()
`;

(async () => {
  const port = Number(arg("port", "9601"));
  const T = await launch({ port, width: 1280, height: 720 });
  try {
    const base = process.env.PT_BASE || BASE;
    await T.boot(base + '/index.html');
    for (let i = 0; i < 120; i++) {
      const ok = await T.eval('!!(window.__game && window.__game._bootDone)');
      if (ok === true) break;
      await sleep(250);
    }
    await T.eval('window.__game._skipTitleIntro && window.__game._skipTitleIntro()');
    await sleep(900);
    const r = await T.eval(EXTRACT, { awaitPromise: false });
    const css = '# title.css —— 标题页首屏样式（由 tools/gen_title_css.mjs 从 src/style.css 提取，勿手改）\n'
      + '/* 完整样式表仍是 src/style.css：它会在揭幕之后异步补齐，游戏内以它为准。 */\n'
      + (r.css || '');
    console.log(JSON.stringify({ rules: r.rules, keyframes: r.keyframes, sheets: r.sheets, bytes: css.length }, null, 2));
    if (WRITE) { fs.writeFileSync(OUT, css, 'utf8'); console.log('已写入 ' + OUT); }
  } finally {
    await T.close?.();
  }
})().catch((e) => { console.error(e); process.exit(1); });
