#!/usr/bin/env node
/**
 * P2 剧情冒烟：从标题一路进关，检查剧情对白（intro）是否按语言本地化。
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_pt_story_ui.mjs
 *
 * 取样用 __game.dialogue.fullText（整句），而不是 #dlgText（逐字打字的快照）。
 */
import { launch, sleep, makeChecks } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/p2story';
mkdirSync(OUT, { recursive: true });
const T = await launch();
const checks = makeChecks();
const CJK = /[\u3400-\u9fff]/;
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
// 只在繁体里出现的常用字（简中/日文都不该出现这些字形）
const HANT_ONLY = /[個裡這說來時後夢聲門風髮覺讓開關們發邊東結終對實應與為樓園]/;

async function enterStage(lang) {
  await T.boot({ query: `?lang=${lang}` });
  // 启动幕没退场前按键会被故意吞掉（防盲选），必须先等 _bootDone
  const booted = await T.waitFor('window.__game._bootDone === true', 15000);
  if (!booted) return { ok: false, text: '', speaker: '' };
  await sleep(200);
  await T.key('Enter');
  await T.waitFor(`!!document.querySelector('.diff-card') && !document.getElementById('overlay').classList.contains('hidden')`, 8000);
  await T.key('Enter');
  await T.waitFor(`!!document.querySelector('.cc-card')`, 8000);
  await T.key('Enter');
  const ok = await T.waitFor(`!document.getElementById('dialogue').classList.contains('hidden') && !!window.__game.dialogue?.fullText`, 25000, 150);
  // 等一帧让打字机开始，然后取整句与 DOM 上的说话人
  await sleep(300);
  const text = await T.eval(`(window.__game.dialogue?.fullText || '').trim()`);
  const domText = await T.eval(`(document.getElementById('dlgText')?.textContent || '').trim()`);
  const speaker = await T.eval(`(document.getElementById('speaker')?.textContent || '').trim()`);
  return { ok: ok && text.length > 0, text, domText, speaker };
}

try {
  const en = await enterStage('en');
  await T.shot(`${OUT}/01-intro-en.png`);
  checks.chk(en.ok, 'EN 剧情对白出现', (en.text || '').slice(0, 60));
  checks.chk(en.ok && !CJK.test(en.text), 'EN 对白无中文', (en.text || '').slice(0, 80));
  checks.chk(!CJK.test(en.speaker), 'EN 说话人已英化', en.speaker);

  const ja = await enterStage('ja');
  await T.shot(`${OUT}/02-intro-ja.png`);
  checks.chk(ja.ok, 'JA 剧情对白出现', (ja.text || '').slice(0, 60));
  checks.chk(ja.ok && KANA.test(ja.text), 'JA 对白为日文（含假名）', (ja.text || '').slice(0, 80));
  checks.chk(ja.ok && !HANT_ONLY.test(ja.text), 'JA 对白无繁体专用字形', (ja.text || '').slice(0, 80));

  const hant = await enterStage('zh-Hant');
  await T.shot(`${OUT}/03-intro-hant.png`);
  checks.chk(hant.ok, '繁中 剧情对白出现', (hant.text || '').slice(0, 60));
  checks.chk(hant.ok && HANT_ONLY.test(hant.text), '繁中 对白含繁体字形', (hant.text || '').slice(0, 80));
  checks.chk(hant.ok && !KANA.test(hant.text), '繁中 对白无假名', (hant.text || '').slice(0, 80));

  const rep = await T.report();
  checks.chk(rep.errors.length === 0, '无 JS 报错', rep.errors.slice(0, 2).join(' | '));
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks: checks.rows, report: rep, samples: { en, ja, hant } }, null, 2));
} finally {
  const s = checks.sum();
  console.log(`\n${s.pass}/${s.pass + s.fail} passed  →  ${OUT}/report.json`);
  for (const r of s.rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  await T.close();
}
