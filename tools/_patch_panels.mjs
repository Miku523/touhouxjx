// 补丁：给暂停 / 结算 / 游戏结束面板的说明行与页脚提示补对比度（可重复执行）
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/style.css';
const css = readFileSync(p, 'utf8');
const eol = css.includes('\r\n') ? '\r\n' : '\n';

const anchor = '.overlay.wide-mode .hint,';
const marker = '/* 非场景面板（暂停 / 结算 / 游戏结束）：说明行与页脚提示同样抬一档 */';

if (css.includes(marker)) {
  console.log('already patched');
} else if (!css.includes(anchor)) {
  console.log('ANCHOR NOT FOUND');
  process.exitCode = 2;
} else {
  const block = [
    marker,
    '#subtitle {',
    '  opacity: 1;',
    '  text-shadow: 0 1px 2px rgba(0, 0, 0, .90), 0 0 calc(var(--s) * 10px) rgba(0, 0, 0, .55);',
    '}',
    '.hint {',
    '  color: rgba(242, 233, 216, .66);',
    '  opacity: 1;',
    '  text-shadow: 0 1px 2px rgba(0, 0, 0, .90);',
    '}',
    '',
  ].join(eol);
  writeFileSync(p, css.replace(anchor, block + anchor), 'utf8');
  console.log('patched');
}
