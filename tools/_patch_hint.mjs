// 一次性补丁：把页脚提示的两条规则合并成带描边的版本（可重复执行，兼容 CRLF/LF）
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/style.css';
const css = readFileSync(p, 'utf8');
const eol = css.includes('\r\n') ? '\r\n' : '\n';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fromLines = [
  '.overlay.wide-mode .hint {',
  '  color: rgba(242, 233, 216, .76);',
  '  opacity: 1;',
  '  text-shadow:',
  '    0 1px 2px rgba(0, 0, 0, .95),',
  '    0 0 calc(var(--s) * 8px) rgba(0, 0, 0, .95),',
  '    0 0 calc(var(--s) * 18px) rgba(0, 0, 0, .70);',
  '}',
  '/* 屏幕式选择页的页脚提示：再加一圈扩散暗雾，落在水面 / 瀑布上也能读清 */',
  '.overlay.screen-mode .panel .hint {',
  '  /* 底色 .hint 自带 opacity: .85，会再把字压暗一层，这里还原成不透明 */',
  '  opacity: 1;',
  '  text-shadow:',
  '    0 1px 2px rgba(0, 0, 0, .95),',
  '    0 0 calc(var(--s) * 8px) rgba(0, 0, 0, .95),',
  '    0 0 calc(var(--s) * 18px) rgba(0, 0, 0, .70);',
  '}',
];

const toLines = [
  '.overlay.wide-mode .hint,',
  '.overlay.screen-mode .panel .hint {',
  '  /* 底色 .hint 自带 opacity: .85，会再把字压暗一层，这里还原成不透明；',
  '     小字号压在亮景（水面 / 瀑布 / 灯笼）上时，一圈实心描边比单向投影更稳 */',
  '  opacity: 1;',
  '  color: rgba(242, 233, 216, .84);',
  '  text-shadow:',
  '    -1px 0 0 rgba(0, 0, 0, .85), 1px 0 0 rgba(0, 0, 0, .85),',
  '    0 -1px 0 rgba(0, 0, 0, .85), 0 1px 0 rgba(0, 0, 0, .85),',
  '    0 0 calc(var(--s) * 6px) rgba(0, 0, 0, .95),',
  '    0 0 calc(var(--s) * 16px) rgba(0, 0, 0, .75);',
  '}',
];

const to = toLines.join(eol);
if (css.includes(to)) {
  console.log('already patched');
} else {
  const re = new RegExp(fromLines.map(esc).join('\\r?\\n'));
  if (!re.test(css)) {
    console.log('PATTERN NOT FOUND — CSS changed underneath');
    process.exitCode = 2;
  } else {
    writeFileSync(p, css.replace(re, to), 'utf8');
    console.log('patched');
  }
}
