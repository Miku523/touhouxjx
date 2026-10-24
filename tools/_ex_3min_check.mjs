// 一次性质检：EXTRA 新时间轴（2:00 雷米莉亚 / 3:00 芙兰）+ 道中加密后的波次表
// 用法: node tools/_ex_3min_check.mjs [cdpPort] [httpPort]
// 需要先起静态服务器：python tools/serve_nocache.py 8138
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9503);
const HTTP = Number(process.argv[3] ?? 8138);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = `http://127.0.0.1:${HTTP}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-ex3-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const errors = [];
async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 3).join(' | ')); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300));
  return r.result?.result?.value;
};

let pass = 0, fail = 0;
const chk = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.navigate', { url: URL0 });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(900);

// 假输入 + 页面内驱动（跑帧 / 条件推进 / 逐卡扣血），全部走真实 loop.update
await ev(`(() => {
  const g = window.__game, inp = g.input;
  const S = { want: { shoot: true }, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true });

  window.__stat = () => {
    const st = g.stage, s = st && st.stg;
    if (!s) return null;
    const kinds = {}, forms = {};
    let total = 0;
    for (const w of s.waves) {
      kinds[w.kind] = (kinds[w.kind] || 0) + 1;
      forms[w.form || 'line'] = (forms[w.form || 'line'] || 0) + 1;
      total += w.count;
    }
    return {
      w: st.level.w, trigger: s.bossTriggerScroll, speed: s.speed,
      waves: s.waves.length, total, kinds, forms,
      lastAt: s.waves.length ? s.waves[s.waves.length - 1].at : null,
      usable: st.level.w - 1480,
    };
  };

  window.__run = (condSrc, maxFrames, dps) => {
    const src = condSrc ? new Function('g', 'st', 'return (' + condSrc + ');') : () => true;
    let n = 0;
    for (; n < maxFrames; n++) {
      if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) g.dialogue.advance();
      const b = g.stage && g.stage.boss;
      if (dps && b && !b.dead && b.state === 'battle') b.damage(dps);
      window.__S.ax = (Math.floor(n / 40) % 2) ? 1 : -1;
      g.loop.update(1 / 60);
      if (condSrc && src(g, g.stage)) { n++; break; }
    }
    const st = g.stage, s = st && st.stg, b = st && st.boss;
    return {
      n, hit: condSrc ? src(g, st) : null,
      state: g.state,
      extraT: st ? +(+st.extraT).toFixed(2) : null,
      timer: (document.getElementById('timer') || {}).textContent,
      pending: !!(st && st.bossPending), started: !!(st && st.bossStarted),
      midbossDone: !!(st && st.midbossDone),
      scroll: s ? Math.round(s.scroll) : null, trigger: s ? s.bossTriggerScroll : null,
      spawnPaused: !!(s && s.spawnPaused),
      enemies: s ? s.enemies.length : null,
      boss: b ? { key: b.key, x: Math.round(b.x), hp: Math.round(b.hp), maxHp: b.maxHp, state: b.state, spells: b.spellCount } : null,
      power: st && st.player ? +(+st.player.power).toFixed(1) : null,
    };
  };

  window.__fastKill = () => {
    const b = g.stage && g.stage.boss;
    if (!b) return null;
    b.spellLock = 0;
    b.defeatT = 2.25;
    return { key: b.key, spells: b.spellCount };
  };
  return 'OK';
})()`);

// ---- 1) 起关：波次表 / 关卡长度 ----
const boot = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.lives = 50; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
  g.carryPower = 0; g.continues = 0;
  g._startExtraStage({ skipIntro: true });
  g.loop.update(1 / 60);
  return JSON.stringify({ state: g.state, ...window.__stat() });
})()`));
console.log('\n== 起关 ==', JSON.stringify({ state: boot.state, w: boot.w, trigger: boot.trigger }));
chk('关卡长度 990 列 = 31,680px', boot.w === 31680, `w=${boot.w}`);
chk('滚动上限 30,280 > 终盘 29,900', boot.trigger === 30280, `trigger=${boot.trigger}`);
chk('波次表铺满整条道中', boot.lastAt >= 29900 && boot.lastAt <= boot.usable + 100, `lastAt=${boot.lastAt} usable=${boot.usable}`);
chk('波次表有 sniper/spinner/bomber/turret 特殊兵种',
  ['sniper', 'spinner', 'bomber', 'turret'].every((k) => (boot.kinds[k] || 0) > 0), JSON.stringify(boot.kinds));
chk('编队含新样式 arc / wall',
  (boot.forms.arc || 0) > 0 && (boot.forms.wall || 0) > 0, JSON.stringify(boot.forms));
chk('敌机密度 ≥ 3.0 架/秒（旧 6:00 版 2.56）', boot.total / 180 >= 3.0, (boot.total / 180).toFixed(2));
console.log('   波次数 =', boot.waves, ' 敌人总数 =', boot.total,
  ' 敌人/秒 =', (boot.total / 180).toFixed(2),
  ' 波次/秒 =', (boot.waves / 180).toFixed(2));

// ---- 2) 2:00 中途 Boss 触发 ----
await ev(`(() => { const st = window.__game.stage; st.extraT = 119.4; st.stg.scroll = 165 * 119.4; return 1; })()`);
const mid = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage && g.stage.bossPending', 300, 0))`));
console.log('\n== 2:00 中途 Boss ==', JSON.stringify(mid));
chk('119.4s 时尚未触发', mid.extraT < 120.1 && mid.extraT >= 119.4);
chk('extraT 到 2:00 触发中途 Boss', mid.pending || mid.started, `extraT=${mid.extraT}`);
chk('HUD 计时停在 2:00', mid.timer === '2:00', `timer=${mid.timer}`);
const midBoss = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage && g.stage.boss', 600, 0))`));
console.log('   中途 Boss =', JSON.stringify(midBoss.boss), ' scroll=', midBoss.scroll);
chk('中途 Boss 是雷米莉亚', midBoss.boss && midBoss.boss.key === 'remilia', midBoss.boss?.key);
chk('Boss 战期间停止刷怪', midBoss.spawnPaused === true);
chk('中途 Boss 入场滚动 ≈ 20,000', Math.abs(midBoss.scroll - 20000) <= 400, `scroll=${midBoss.scroll}`);

// ---- 3) 击破中途 Boss → 回到 2:00，计时恢复 ----
await ev('window.__fastKill()');
const midClear = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage && g.stage.midbossDone && g.state === "play"', 40000, 5000))`));
console.log('\n== 击破中途 Boss ==', JSON.stringify(midClear));
chk('中途 Boss 击破后 midbossDone', midClear.midbossDone);
chk('击破后 state 回到 play', midClear.state === 'play', midClear.state);
chk('中途 Boss 战期间计时冻结（仍 ≈ 2:00）', Math.abs(midClear.extraT - 120) <= 1.5, `extraT=${midClear.extraT}`);
chk('击破后滚动继续推进（≈ 20,000 起）', midClear.scroll >= 19900 && midClear.scroll <= 20600, `scroll=${midClear.scroll}`);
const resumePlay = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage.extraT > 121.5', 600, 0))`));
chk('1:00 收束段计时继续走', resumePlay.extraT > 121.5, `extraT=${resumePlay.extraT}`);

// ---- 4) 3:00 终盘 Boss 触发 ----
await ev(`(() => { const st = window.__game.stage; st.extraT = 179.4; st.stg.scroll = 165 * 179.4; return 1; })()`);
const fin = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage && g.stage.bossPending', 300, 0))`));
console.log('\n== 3:00 终盘 Boss ==', JSON.stringify(fin));
chk('extraT 到 3:00 触发终盘 Boss', fin.pending || fin.started, `extraT=${fin.extraT}`);
chk('HUD 计时停在 3:00', fin.timer === '3:00', `timer=${fin.timer}`);
const finBoss = JSON.parse(await ev(`JSON.stringify(window.__run('g.stage && g.stage.boss', 600, 0))`));
console.log('   终盘 Boss =', JSON.stringify(finBoss.boss), ' scroll=', finBoss.scroll);
chk('终盘 Boss 是芙兰朵露', finBoss.boss && finBoss.boss.key === 'flandre', finBoss.boss?.key);
chk('芙兰入场位置不越界（boss.x ≤ w-200）', finBoss.boss && finBoss.boss.x <= 31680 - 200, `x=${finBoss.boss?.x}`);
chk('锁定镜头后 scroll 未顶到上限', finBoss.scroll <= finBoss.trigger, `scroll=${finBoss.scroll}/${finBoss.trigger}`);

// ---- 5) 击破芙兰 → EXTRA 结局 ----
await ev('window.__fastKill()');
const clear = JSON.parse(await ev(`JSON.stringify(window.__run('g.state === "ending" || g.state === "clear" || g.state === "menu"', 120000, 5000))`));
console.log('\n== 击破芙兰 ==', JSON.stringify({ state: clear.state, extraT: clear.extraT, n: clear.n }));
chk('芙兰击破后进入结局', clear.state === 'ending' || clear.state === 'clear', clear.state);

// ---- 6) 再战检查点 ----
const rFinal = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.state = 'play'; g.inExtra = true;
  g._startExtraStage({ resumeFrom: 'final', skipIntro: true });
  g.loop.update(1 / 60);
  const st = g.stage;
  const before = { extraT: st.extraT, scroll: Math.round(st.stg.scroll), midbossDone: !!st.midbossDone, pending: !!st.bossPending };
  const r = window.__run('g.stage && g.stage.boss', 600, 0);
  return JSON.stringify({ before, after: { key: r.boss && r.boss.key, x: r.boss && r.boss.x, scroll: r.scroll, timer: r.timer } });
})()`));
console.log('\n== 再战：从芙兰战继续 ==', JSON.stringify(rFinal));
chk('final 检查点 extraT = 3:00', Math.abs(rFinal.before.extraT - 180) < 1, `extraT=${rFinal.before.extraT}`);
chk('final 检查点 midbossDone = true', rFinal.before.midbossDone === true);
chk('final 检查点直接进芙兰战', rFinal.after.key === 'flandre', rFinal.after.key);
chk('final 检查点 scroll 在界内（≤ 30,280）', rFinal.after.scroll <= 30280, `scroll=${rFinal.after.scroll}`);
chk('final 检查点 HUD 3:00', rFinal.after.timer === '3:00', rFinal.after.timer);

const rMid = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.state = 'play'; g.inExtra = true; g.carryPower = 0;
  g._startExtraStage({ resumeFrom: 'midboss', skipIntro: true });
  g.loop.update(1 / 60);
  const st = g.stage;
  const before = { extraT: st.extraT, scroll: Math.round(st.stg.scroll), midbossDone: !!st.midbossDone, power: +(+st.player.power).toFixed(1) };
  const r = window.__run('g.stage && g.stage.boss', 600, 0);
  return JSON.stringify({ before, after: { key: r.boss && r.boss.key, scroll: r.scroll, timer: r.timer } });
})()`));
console.log('\n== 再战：从雷米莉亚战继续 ==', JSON.stringify(rMid));
chk('midboss 检查点 extraT = 2:00', Math.abs(rMid.before.extraT - 120) < 1, `extraT=${rMid.before.extraT}`);
chk('midboss 检查点 midbossDone = false', rMid.before.midbossDone === false);
chk('midboss 检查点直接进雷米莉亚战', rMid.after.key === 'remilia', rMid.after.key);
chk('midboss 检查点 scroll ≈ 19,800', Math.abs(rMid.after.scroll - 19800) <= 400, `scroll=${rMid.after.scroll}`);
chk('再战起手火力 48', Math.abs(rMid.before.power - 48) < 0.6, `power=${rMid.before.power}`);

console.log(`\n控制台：${errors.length ? errors.slice(0, 5).join('\n') : '无错误'}`);
console.log(`\n结果：${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
ws.close();
process.exit(fail ? 1 : 0);
