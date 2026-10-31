/**
 * 门禁 v2 附加项冒烟：启动幕状态行 + 揭幕后全曲库空闲预热。
 *
 * 用法：node tools/_gate_v2_check.mjs [--base http://127.0.0.1:8138]
 * 依赖：被测树必须在 serverRoot 下（默认 8138 的 serve_nocache.py）。
 */
import { launch, BASE } from './_pt_core.mjs';

const argBase = process.argv.indexOf('--base');
const base = argBase > 0 ? process.argv[argBase + 1] : (process.env.PT_BASE || BASE);
const CDP_PORT = Number(process.env.GATE_V2_CDP || 9427);

const T = await launch({ port: CDP_PORT, width: 1280, height: 800 });
const fails = [];
const notes = {};
const check = (cond, msg, extra) => {
  if (cond) { console.log('PASS ' + msg + (extra ? '  ' + JSON.stringify(extra) : '')); }
  else { fails.push(msg + (extra ? '  ' + JSON.stringify(extra) : '')); console.log('FAIL ' + msg + (extra ? '  ' + JSON.stringify(extra) : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await T.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__statusLog = [];
      (function () {
        const iv = setInterval(function () {
          const el = document.querySelector('#boot .boot-status');
          if (el) {
            const t = el.textContent || '';
            const log = window.__statusLog;
            if (!log.length || log[log.length - 1].t !== t) log.push({ t: t, at: Math.round(performance.now()) });
          }
          const done = !!(window.__boot && window.__boot.done);
          if (done || (window.__statusLog.length > 30)) clearInterval(iv);
        }, 40);
      })();
    `,
  });

  await T.nav(base + '/index.html');
  const revealed = await T.waitFor('!!(window.__boot && window.__boot.done)', 25000);
  check(revealed, '启动幕在 25s 内揭幕');

  const log = await T.eval('window.__statusLog || []');
  notes.statusLog = log;
  const texts = log.map((x) => x.t);
  check(texts.length >= 2, '状态行至少播报过两段文案', texts);
  check(texts.some((t) => t.indexOf('正在绘制标题') >= 0), '出现「正在绘制标题…」', texts);
  check(texts.some((t) => /正在准备(游戏资源|游戏资源与音乐|音乐)/.test(t)), '出现准备资源/音乐的阶段文案', texts);
  check(texts.some((t) => t.indexOf('准备完成') >= 0), '揭幕前播报「准备完成」', texts);

  const gate = await T.eval('window.__hksBootGate ? JSON.parse(JSON.stringify(window.__hksBootGate)) : null');
  notes.gate = gate;
  check(gate && gate.art === true && gate.kit === true && gate.music === true && gate.done === true, '揭幕时门禁三路全绿', gate);
  check(gate && Array.isArray(gate.failed) && gate.failed.length === 0, 'failed 为空', gate && gate.failed);

  const layout = await T.eval(`(() => {
    const el = document.querySelector('#boot .boot-status');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const sub = document.querySelector('#boot .boot-sub');
    const sr = sub ? sub.getBoundingClientRect() : null;
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), subBottom: sr ? Math.round(sr.bottom) : null, text: el.textContent };
  })()`);
  notes.layout = layout;
  check(layout && layout.h > 0 && layout.w > 0, '状态行有实际尺寸（没有挤成 0 宽）', layout);
  check(layout && layout.subBottom !== null && layout.top >= layout.subBottom, '状态行位于副标下方', layout);

  // 揭幕后等空闲预热：全曲库模块应陆续出现在 ResourceTiming 里
  await sleep(9000);
  const songs = await T.eval(`Array.from(new Set(performance.getEntriesByType('resource')
    .map(function (e) { return (e.name || '').split('/').pop(); })
    .filter(function (n) { return /\\.js$/.test(n); })))
    .filter(function (n) { return /pre[0-9]|stage[0-9]|original|ending|extra|flandre|sakuya|septette|kaguya|voyage|yuuga|aya|till|fall|merge|ateam|youma|yuuhei|honou|eurobeat/i.test(n); })`);
  notes.songModules = songs;
  check(songs.length >= 10, '揭幕后曲库模块被空闲预热（>=10 个）', { count: songs.length });

  const rep = T.report ? T.report() : null;
  notes.report = rep;
  const errs = (rep && rep.errors) || [];
  check(errs.length === 0, '无 console error', errs.slice(0, 4));
} catch (e) {
  fails.push('异常：' + (e && e.message ? e.message : String(e)));
  console.log('EXCEPTION', e);
} finally {
  try { await T.close(); } catch (e) { /* ignore */ }
}

console.log('---');
console.log(JSON.stringify({ ok: fails.length === 0, fails, notes }, null, 2));
process.exit(fails.length ? 1 : 0);
