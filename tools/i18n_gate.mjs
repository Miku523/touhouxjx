#!/usr/bin/env node
/**
 * i18n 发版门禁：两处覆盖率只要有一处缺口就以退出码 1 结束。
 *
 *   node tools/i18n_gate.mjs        # 本地 / CI 都能跑，无需浏览器
 *
 * 1) tools/i18n_extract.mjs --strict   —— 代码里 tr('…') 的键是否三语齐全；
 * 2) tools/i18n_data_coverage.mjs     —— 剧情 / 结局 / 曲目档案的数据是否三语入包。
 */
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => {
  const [file, ...args] = cmd.split(' ');
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'tools', file), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      maxBuffer: 1024 * 1024 * 32,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

const summarize = (label, out, ok) => {
  const lines = out.split('\n').filter((l) => /覆盖|全齐|缺\s|missing/.test(l));
  console.log(`\n== ${label} ==`);
  console.log(lines.length ? lines.slice(0, 8).join('\n') : out.slice(-400));
  console.log(ok ? 'OK' : 'FAILED');
};

let failed = false;

const ext = run('i18n_extract.mjs --strict');
summarize('tr() 键覆盖', ext.out, ext.ok);
failed = failed || !ext.ok;

const data = run('i18n_data_coverage.mjs');
summarize('剧情 / 结局 / 曲目数据', data.out, data.ok);
failed = failed || !data.ok;

if (failed) {
  console.error('\n[i18n gate] 有缺译，发版前必须补齐。');
  process.exit(1);
}
console.log('\n[i18n gate] 全部通过。');
