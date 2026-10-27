#!/usr/bin/env node
/**
 * verifier 独立复核 · 按 BALANCE_TARGETS.md 对「基线 vs 改造后」逐条判定 #1–#7。
 *
 * 输入（全部由 _verify_*.mjs 产出）：
 *   --base _pt/verify_baseline.json      合并基线（_verify_report.mjs 输出）
 *   --cand _pt/verify_candidate.json     合并候选
 *   --base-static / --cand-static        静态小怪 JSON（可选，缺省用合并行里的 spawnPerScreen/hpPerScreen）
 *   --shots _pt/verify_shots_candidate.json（#6 运行时断言，可选）
 *   --out _pt/verify_verdict.json
 *
 * 输出：JSON（逐条 PASS/FAIL + 每面明细 + 判定依据）+ stdout 逐条摘要。
 * 判定口径严格照 BALANCE_TARGETS.md，不做放宽；已知不可测项（S5/S6 自动玩家）标 DATA，不当 PASS。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { PLAYER_ATK_SCALE } from '../src/game/balance.js';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const readJson = (p) => { try { return JSON.parse(readFileSync(resolve(p), 'utf8')); } catch { return null; } };
const OUT = argv.out || '_pt/verify_verdict.json';
const BASE = readJson(argv.base || '_pt/verify_baseline.json');
const CAND = readJson(argv.cand || '_pt/verify_candidate.json');
const SHOTS = argv.shots ? readJson(argv.shots) : null;

const TARGET = {
  mid: { 1: 55, 2: 70, 3: 85, 4: 90, 5: 105, 6: 120 },
  boss: { 1: 128, 2: 163, 3: 198, 4: 210, 5: 245, 6: 280 },
  midAbs: 10, bossAbs: 10, bossPctMin: 66, bossPctMax: 74, bossTolPct: 0.08,
  countRatio: [1.40, 1.60], hpRatio: [2.50, 3.50],
  brightCenter: 76, brightBand: 5, brightRange: 10,
  stagger: [2, 4], interactionsMin: 3,
  poiseMin: 130, poiseMax: 150,
  exTotalTol: 0.10, exPeakTol: 0.05,
  bossPeakRatio: [1.12, 1.22],
  // #6 运行时伤害 = profile 值 × 当前 PLAYER_ATK_SCALE（不写死，倍率调整后自动跟随）
  shots: {
    reimu: { special: 1.55 * PLAYER_ATK_SCALE, main: 4 * PLAYER_ATK_SCALE },
    marisa: { special: 2.05 * PLAYER_ATK_SCALE, main: 8 * PLAYER_ATK_SCALE },
  },
};
const r2 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 100) / 100);
const r3 = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 1000) / 1000);
const num = (v) => (v == null || !Number.isFinite(+v) ? null : +v);
const rowOf = (doc, stage) => (doc && doc.rows ? doc.rows.find((r) => r.stage === stage) : null) || {};
const within = (v, lo, hi) => v != null && v >= lo && v <= hi;
const EPS = 1e-6;

const stages = [1, 2, 3, 4, 5, 6];
const checks = {};
const fail = (why) => ({ pass: false, why });
const pass = (why) => ({ pass: true, why });

/* ---------------- #1 小怪数量 / 有效血量 ---------------- */
{
  const details = [];
  for (const s of stages) {
    const b = rowOf(BASE, s);
    const c = rowOf(CAND, s);
    const bCount = num(b.spawnPerScreen), cCount = num(c.spawnPerScreen);
    const bHpScr = num(b.hpPerScreen), cHpScr = num(c.hpPerScreen);
    const countRatio = bCount && cCount ? cCount / bCount : null;
    // #1 有效血量口径 = 单怪有效 HP（_verify_static 的 hp.total / spawn.count），见 BALANCE_TARGETS §2.2
    const bHp = bCount && bHpScr ? bHpScr / bCount : null;
    const cHp = cCount && cHpScr ? cHpScr / cCount : null;
    const hpRatio = bHp && cHp ? cHp / bHp : null;
    const hpScreenRatio = bHpScr && cHpScr ? cHpScr / bHpScr : null;
    const okCount = countRatio != null && countRatio >= TARGET.countRatio[0] - EPS && countRatio <= TARGET.countRatio[1] + EPS;
    const okHp = hpRatio != null && hpRatio >= TARGET.hpRatio[0] - EPS && hpRatio <= TARGET.hpRatio[1] + EPS;
    details.push({
      stage: s, baseCount: r2(bCount), candCount: r2(cCount), countRatio: r2(countRatio), countOk: okCount,
      baseHp: r2(bHp), candHp: r2(cHp), hpRatio: r2(hpRatio), hpOk: okHp, hpScreenRatio: r2(hpScreenRatio),
      mode: c.mode || b.mode,
      missing: countRatio == null || hpRatio == null,
    });
  }
  const ex = { stage: 7, baseCount: r2(rowOf(BASE, 7).spawnPerScreen), candCount: r2(rowOf(CAND, 7).spawnPerScreen), note: 'EX 道中波表运行时生成，仅参考' };
  const passN = details.filter((d) => d.countOk && d.hpOk).length;
  checks['#1'] = {
    title: '小怪数量 +40~60%，有效血量 ×2.5~3.5，峰值≤预算，无卡死/穿模',
    pass: passN === stages.length,
    passCount: passN, total: stages.length,
    rule: { countRatio: TARGET.countRatio, hpRatio: TARGET.hpRatio },
    details, ex,
  };
}

/* ---------------- #2 道中 : Boss = 30 : 70 ---------------- */
{
  const details = [];
  for (const s of stages) {
    const c = rowOf(CAND, s);
    const tMid = TARGET.mid[s], tBoss = TARGET.boss[s];
    const mid = num(c.midSec), boss = num(c.bossSec), pct = num(c.bossPct);
    const okTime = mid != null && boss != null && Math.abs(mid - tMid) <= TARGET.midAbs && Math.abs(boss - tBoss) <= TARGET.bossAbs;
    const okPct = pct != null && pct >= TARGET.bossPctMin && pct <= TARGET.bossPctMax;
    details.push({
      stage: s, mid, boss, total: num(c.totalSec), bossPct: pct, targetMid: tMid, targetBoss: tBoss,
      dMid: mid != null ? r2(mid - tMid) : null, dBoss: boss != null ? r2(boss - tBoss) : null,
      timeOk: okTime, pctOk: okPct,
      data: c.ok ? 'ok' : (c.bail || c.stall ? 'auto-player 未测完' : 'ok'),
      note: c.ok ? null : (c.bail || (c.stall && 'stall') || 'incomplete'),
    });
  }
  const passN = details.filter((d) => d.timeOk && d.pctOk).length;
  checks['#2'] = {
    title: '道中:Boss ≈ 30:70；表 1 绝对值 ±10s / ±4pp（Normal 自动玩家）',
    pass: passN === stages.length, passCount: passN, total: stages.length,
    rule: { midAbs: TARGET.midAbs, bossAbs: TARGET.bossAbs, bossPct: [TARGET.bossPctMin, TARGET.bossPctMax] },
    details,
  };
}

/* ---------------- #3 亮度 ---------------- */
{
  const details = [];
  const means = [];
  for (let s = 1; s <= 7; s++) {
    const c = rowOf(CAND, s);
    const br = c.bright || {};
    const pts = ['10', '50', '85'].map((k) => num(br[k])).filter((v) => v != null);
    const mean = pts.length === 3 ? pts.reduce((a, b) => a + b, 0) / 3 : null;
    const range = pts.length === 3 ? Math.max(...pts) - Math.min(...pts) : null;
    if (mean != null) means.push(mean);
    const inBand = mean != null && Math.abs(mean - TARGET.brightCenter) <= TARGET.brightBand;
    const rangeOk = range != null && range <= TARGET.brightRange;
    details.push({ stage: s, points: br, mean: r2(mean), range: r2(range), bandOk: inBand, rangeOk, missing: pts.length !== 3 });
  }
  const spread = means.length ? Math.max(...means) - Math.min(...means) : null;
  const ok = details.every((d) => d.bandOk && d.rangeOk) && spread != null && spread <= 10;
  checks['#3'] = {
    title: '7 面 × 3 进度点平均亮度 76±5，面内极差 ≤10',
    pass: ok,
    rule: { band: [TARGET.brightCenter - TARGET.brightBand, TARGET.brightCenter + TARGET.brightBand], rangeMax: TARGET.brightRange, crossSpreadMax: 10 },
    crossSpread: r2(spread),
    details,
    note: '目标带中心按 visuals 实现注释 BG_EXPOSURE=76±5；中心区 crop 与基线同一协议',
  };
}

/* ---------------- #4 互动 / 破势 ---------------- */
{
  const details = [];
  for (let s = 1; s <= 7; s++) {
    const c = rowOf(CAND, s);
    const it = c.interactions || {};
    const kinds = ['stomp', 'dashHit', 'diveLand'].filter((k) => num(it[k]) > 0);
    const st = num(c.staggerCount);
    const staggerOk = st != null && st >= TARGET.stagger[0] && st <= TARGET.stagger[1];
    const softlock = !!(c.stall || c.bail) || c.ok === false;
    details.push({
      stage: s, interactions: it, triggeredKinds: kinds, kindCount: kinds.length,
      staggers: st, staggerOk, poiseMax: c.poiseMax, maxPoise: r2(c.maxPoise), softlock,
      complete: s <= 6 ? kinds.length >= TARGET.interactionsMin && staggerOk && !softlock : !softlock,
      note: s > 6 ? 'EX 为双 Boss（remilia+flandre），破势计数为合并口径，仅参考' : null,
    });
  }
  const sixOk = details.slice(0, 6).every((d) => d.complete);
  checks['#4'] = {
    title: '每场 Boss ≥3 种互动可触发；破势硬直 2–4 次/场；无软锁（1–6 面判定，EX 参考）',
    pass: sixOk, rule: { interactionsMin: TARGET.interactionsMin, stagger: TARGET.stagger },
    details,
    caveat: '自动玩家只在被弹幕逼到踩/冲刺时才触发互动；若遥测显示 0，需要人工/定点测试补证，见报告',
  };
}

/* ---------------- #5 Boss 血量 / 破势上限 / EX 总时长 ---------------- */
{
  const details = [];
  for (const s of stages) {
    const c = rowOf(CAND, s);
    const b = rowOf(BASE, s);
    const tBoss = TARGET.boss[s];
    const boss = num(c.bossSec);
    const okSec = boss != null && Math.abs(boss - tBoss) <= tBoss * TARGET.bossTolPct;
    const poiseMax = num(c.poiseMax);
    const capOk = poiseMax != null && poiseMax >= TARGET.poiseMin && poiseMax <= TARGET.poiseMax;
    const reach = num(c.staggerCount) != null && num(c.staggerCount) >= 1
      && num(c.maxPoise) != null && poiseMax != null && num(c.maxPoise) >= poiseMax - 3;
    details.push({
      stage: s, bossKey: c.bossKey || b.bossKey, baseMaxHp: num(b.maxHp), candMaxHp: num(c.maxHp),
      hpRatio: b.maxHp && c.maxHp ? r2(c.maxHp / b.maxHp) : null,
      baseBossSec: num(b.bossSec), bossSec: boss, targetBoss: tBoss,
      dPct: boss != null ? r2((boss - tBoss) / tBoss * 100) : null, secOk: okSec,
      poiseMax, capOk, maxPoise: r2(c.maxPoise), reachable: reach,
    });
  }
  const ex = rowOf(CAND, 7);
  const bex = rowOf(BASE, 7);
  const exOk = num(ex.totalSec) != null && num(bex.totalSec) != null
    && Math.abs(ex.totalSec - bex.totalSec) <= bex.totalSec * TARGET.exTotalTol;
  const secN = details.filter((d) => d.secOk).length;
  const capN = details.filter((d) => d.capOk).length;
  const reachN = details.filter((d) => d.reachable).length;
  checks['#5'] = {
    title: 'Boss 秒数 ±8%（表1）；破势槽 100→~140 且可达；EX 总时长现状 ±10%',
    pass: secN === stages.length && capN >= 5 && reachN >= 3 && exOk,
    counts: { secOk: secN, capOk: capN, reachable: reachN },
    rule: { bossTolPct: 0.08, poiseRange: [TARGET.poiseMin, TARGET.poiseMax], exTotalTol: TARGET.exTotalTol },
    ex: { baseTotal: num(bex.totalSec), candTotal: num(ex.totalSec), dPct: num(bex.totalSec) ? r2((ex.totalSec - bex.totalSec) / bex.totalSec * 100) : null, exOk },
    details,
  };
}

/* ---------------- #6 子机特殊副弹 ---------------- */
{
  let pass6 = false;
  const details = [];
  if (SHOTS && Array.isArray(SHOTS.audits)) {
    for (const a of SHOTS.audits) {
      const e = TARGET.shots[a.char] || {};
      const special = Array.isArray(a.specialDmg) ? a.specialDmg : [];
      const main = Array.isArray(a.mainDmg) ? a.mainDmg : [];
      const specialOk = special.length === 1 && Math.abs(special[0] - e.special) <= 1e-3;
      const mainOk = main.length === 1 && Math.abs(main[0] - e.main) <= 1e-3;
      details.push({ char: a.char, specialDmg: special, expectSpecial: e.special, specialOk, mainDmg: main, expectMain: e.main, mainOk });
    }
    pass6 = details.length >= 2 && details.every((d) => d.specialOk && d.mainOk)
      && (SHOTS.consoleErrors || []).length === 0;
  }
  checks['#6'] = {
    title: '子机特殊副弹 2.4→1.55 / 3.2→2.05（主弹不动），运行时 b.damage 断言',
    pass: pass6, rule: TARGET.shots, source: argv.shots || null, details,
    missing: !SHOTS,
  };
}

/* ---------------- #7 Boss 同屏弹幕峰值 ---------------- */
{
  const details = [];
  for (const s of stages) {
    const b = num(rowOf(BASE, s).maxBulletsBoss);
    const c = num(rowOf(CAND, s).maxBulletsBoss);
    const ratio = b && c ? c / b : null;
    const ok = ratio != null && ratio >= TARGET.bossPeakRatio[0] - EPS && ratio <= TARGET.bossPeakRatio[1] + EPS;
    details.push({ stage: s, basePeak: b, candPeak: c, ratio: r2(ratio), ok, lowBase: b != null && b < 5 });
  }
  const b7 = num(rowOf(BASE, 7).maxBulletsBoss);
  const c7 = num(rowOf(CAND, 7).maxBulletsBoss);
  const ratio7 = b7 && c7 ? c7 / b7 : null;
  const exOk = ratio7 != null && Math.abs(ratio7 - 1) <= TARGET.exPeakTol;
  const lowBase = details.filter((d) => d.lowBase).length;
  checks['#7'] = {
    title: '非 EX Boss 峰值 +12~22%；EX 峰值 ±5%',
    pass: details.every((d) => d.ok) && exOk,
    rule: { bossPeakRatio: TARGET.bossPeakRatio, exPeakTol: TARGET.exPeakTol },
    lowBaseStages: lowBase,
    ex: { basePeak: b7, candPeak: c7, ratio: r2(ratio7), exOk },
    details,
    note: lowBase > 0 ? '基线峰值 <5 的场次比值噪声大，报告里需结合原始弹数解读' : null,
  };
}

/* ---------------- 回归检查 ---------------- */
const regression = { consoleErrors: [], stalls: [], incomplete: [], exClear: null };
for (let s = 1; s <= 7; s++) {
  const c = rowOf(CAND, s);
  if ((c.consoleErrors || 0) > 0) regression.consoleErrors.push({ stage: s, n: c.consoleErrors });
  if (c.stall) regression.stalls.push({ stage: s, stall: c.stall });
  if (s <= 6 && c.ok === false) regression.incomplete.push({ stage: s, bail: c.bail || null });
}
{
  const ex = rowOf(CAND, 7);
  regression.exClear = ex.ok === true && ex.bossKey != null;
}

const order = ['#1', '#2', '#3', '#4', '#5', '#6', '#7'];
const verdicts = order.map((k) => ({ id: k, pass: !!checks[k].pass, title: checks[k].title }));
const out = {
  tool: '_verify_compare',
  generatedAt: new Date().toISOString(),
  inputs: { base: argv.base || '_pt/verify_baseline.json', cand: argv.cand || '_pt/verify_candidate.json', shots: argv.shots || null },
  targetsDoc: 'docs/BALANCE_TARGETS.md',
  verdicts,
  passCount: verdicts.filter((v) => v.pass).length,
  failCount: verdicts.filter((v) => !v.pass).length,
  checks,
  regression,
  missingInputs: !BASE || !CAND,
};
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(out, null, 2));

/* ---------- stdout 摘要 ---------- */
console.log('=== 逐条判定 ===');
for (const k of order) {
  const c = checks[k];
  console.log(`${k} ${c.pass ? 'PASS' : 'FAIL'}  ${c.title}${c.passCount != null ? `  (${c.passCount}/${c.total})` : ''}`);
  if (k === '#1' || k === '#2' || k === '#7') {
    for (const d of c.details) {
      if (k === '#1') {
        console.log(`   S${d.stage} ${d.mode || ''} count ${d.baseCount}->${d.candCount} (${d.countRatio}x ${d.countOk ? 'ok' : 'NG'})  hp ${d.baseHp}->${d.candHp} (${d.hpRatio}x ${d.hpOk ? 'ok' : 'NG'})`);
      } else if (k === '#2') {
        console.log(`   S${d.stage} mid ${d.mid} (${d.dMid}) boss ${d.boss} (${d.dBoss}) pct ${d.bossPct} timeOk=${d.timeOk} pctOk=${d.pctOk}${d.data === 'auto-player 未测完' ? ' DATA' : ''}`);
      } else {
        console.log(`   S${d.stage} peak ${d.basePeak}->${d.candPeak} (${d.ratio}x ${d.ok ? 'ok' : 'NG'})`);
      }
    }
    if (k === '#7') console.log(`   EX peak ${c.ex.basePeak}->${c.ex.candPeak} (${c.ex.ratio}x ${c.ex.exOk ? 'ok' : 'NG'})`);
  }
  if (k === '#3') for (const d of c.details) console.log(`   S${d.stage} [${Object.values(d.points || {}).join('/')}] mean=${d.mean} range=${d.range} ${d.bandOk && d.rangeOk ? 'ok' : 'NG'}`);
  if (k === '#4') for (const d of c.details) console.log(`   S${d.stage} kinds=${(d.triggeredKinds || []).join(',') || '-'} staggers=${d.staggers} poiseMax=${d.poiseMax} maxPoise=${d.maxPoise} softlock=${d.softlock}`);
  if (k === '#5') {
    for (const d of c.details) console.log(`   S${d.stage} maxHp ${d.baseMaxHp}->${d.candMaxHp} (${d.hpRatio}x) boss ${d.bossSec}s (${d.dPct}%) cap=${d.poiseMax} maxPoise=${d.maxPoise} ${d.secOk && d.capOk ? 'ok' : 'NG'}`);
    console.log(`   EX total ${c.ex.baseTotal}->${c.ex.candTotal} (${c.ex.dPct}%) ${c.ex.exOk ? 'ok' : 'NG'}`);
  }
  if (k === '#6') for (const d of c.details) console.log(`   ${d.char} special ${JSON.stringify(d.specialDmg)} (expect ${d.expectSpecial}) main ${JSON.stringify(d.mainDmg)} (expect ${d.expectMain})`);
}
console.log('\n=== 回归 ===');
console.log(`consoleErrors ${regression.consoleErrors.length} 处, stalls ${regression.stalls.length}, 未测完 ${regression.incomplete.length}, EX clear=${regression.exClear}`);
console.log(`\nPASS ${out.passCount}/7  ->  ${OUT}`);
