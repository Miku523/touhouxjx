#!/usr/bin/env node
/**
 * P2 结局冒烟：直接进 good ending 演出，检查字幕是否按语言本地化。
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_ending_ui.mjs
 */
import { launch, sleep, makeChecks } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/p2ending';
mkdirSync(OUT, { recursive: true });
const T = await launch();
const checks = makeChecks();
const CJK = /[\u3400-\u9fff]/;
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HANT_ONLY = /[個裡這說來時後夢聲門風髮覺讓開關們發邊東結終對實應與為樓園]/;

async function openEnding(lang) {
  await T.boot({ query: `?lang=${lang}` });
  const booted = await T.waitFor('window.__game._bootDone === true', 15000);
  if (!booted) return { ok: false, text: '', speaker: '' };
  await T.eval(`(() => { const g = window.__game; g.char = 'reimu'; g._playEnding('good'); return g.state; })()`);
  const ok = await T.waitFor(`!document.getElementById('ending').classList.contains('hidden') && !!window.__game.ending?.fullText`, 20000, 150);
  // 等字幕真的画到 DOM 上（入场约 0.8s），截图才有字
  await T.waitFor(`(document.getElementById('edText')?.textContent || '').trim().length > 2`, 8000, 120);
  const text = await T.eval(`(window.__game.ending?.fullText || '').trim()`);
  const speaker = await T.eval(`(window.__game.ending?.speakerEl?.textContent || '').trim()`);
  return { ok: ok && text.length > 0, text, speaker };
}

try {
  const en = await openEnding('en');
  await T.shot(`${OUT}/01-ending-en.png`);
  checks.chk(en.ok, 'EN 结局字幕出现', (en.text || '').slice(0, 60));
  checks.chk(en.ok && !CJK.test(en.text), 'EN 字幕无中文', (en.text || '').slice(0, 80));

  const ja = await openEnding('ja');
  await T.shot(`${OUT}/02-ending-ja.png`);
  checks.chk(ja.ok, 'JA 结局字幕出现', (ja.text || '').slice(0, 60));
  checks.chk(ja.ok && KANA.test(ja.text), 'JA 字幕为日文', (ja.text || '').slice(0, 80));

  const hant = await openEnding('zh-Hant');
  await T.shot(`${OUT}/03-ending-hant.png`);
  checks.chk(hant.ok, '繁中 结局字幕出现', (hant.text || '').slice(0, 60));
  checks.chk(hant.ok && HANT_ONLY.test(hant.text), '繁中 字幕含繁体字形', (hant.text || '').slice(0, 80));

  const rep = await T.report();
  checks.chk(rep.errors.length === 0, '无 JS 报错', rep.errors.slice(0, 2).join(' | '));
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks: checks.rows, report: rep, samples: { en, ja, hant } }, null, 2));
} finally {
  const s = checks.sum();
  console.log(`\n${s.pass}/${s.pass + s.fail} passed  →  ${OUT}/report.json`);
  for (const r of s.rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  await T.close();
}
