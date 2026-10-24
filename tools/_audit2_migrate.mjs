import { launch, sleep, makeChecks, saveJson } from './_pt_core.mjs';
const T = await launch({ port: 9729 });
const C = makeChecks();
const out = {};
try {
  await T.boot({ waitTitle: true });
  const cases = {
    oldBool: { 'hks.progress.v1': JSON.stringify({ extraUnlocked: true }) },
    oldChar: { 'hks.progress.v1': JSON.stringify({ extraUnlocked: true, extraChar: 'marisa' }) },
    newFormat: { 'hks.progress.v1': JSON.stringify({ extraUnlocked: true, extraChars: ['reimu'], extraChar: 'reimu' }) },
    emptyChars: { 'hks.progress.v1': JSON.stringify({ extraUnlocked: true, extraChars: [] }) },
    fastBind: { 'hks.keybinds.v1': JSON.stringify({ fast: 'KeyI', jump: 'KeyO' }) },
    collideBind: { 'hks.keybinds.v1': JSON.stringify({ left: 'KeyJ' }) },
  };
  for (const [name, kv] of Object.entries(cases)) {
    await T.eval(`(() => { localStorage.clear(); ${Object.entries(kv).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return 1; })()`);
    await T.reload();
    await sleep(2600);
    await T.waitFor('!!window.__game', 15000);
    const r = await T.eval(`(() => { const g = window.__game; return {
      unlockedExtra: g.unlockedExtra, extraChars: g.extraChars, extraChar: g.extraChar,
      slow: g.input.binds.get('slow').primary, jump: g.input.binds.get('jump').primary,
      left: g.input.binds.get('left').primary, shootAlt: g.input.binds.get('shoot').alt,
      saved: localStorage.getItem('hks.progress.v1'),
    }; })()`);
    out[name] = r;
  }
  C.chk(out.oldBool.unlockedExtra === true, 'M1 旧布尔档 extraUnlocked 迁移后解锁', JSON.stringify(out.oldBool));
  C.chk(out.oldChar.extraChar === 'marisa' && out.oldChar.extraChars.marisa === true, 'M2 旧单主角档只开那一位', JSON.stringify(out.oldChar));
  C.chk(out.newFormat.extraChars.reimu === true && out.newFormat.extraChars.marisa === false, 'M3 新格式数组正常读取', JSON.stringify(out.newFormat));
  C.chk(out.emptyChars.unlockedExtra === true && out.emptyChars.extraChars.reimu === true, 'M4 空 extraChars 但 extraUnlocked=true 时的回退', JSON.stringify(out.emptyChars));
  C.chk(out.fastBind.slow === 'KeyI' && out.fastBind.jump === 'KeyO', 'M5 旧键位 fast→slow 迁移', JSON.stringify(out.fastBind));
  C.chk(out.collideBind.left === 'KeyJ' && out.collideBind.shootAlt === null, 'M6 键位撞副键时清副键', JSON.stringify(out.collideBind));
  out.summary = C.sum();
  saveJson('_pt/audit2/migrate.json', out);
  console.log(JSON.stringify(out.summary, null, 1));
  for (const r of C.rows) if (!r.ok) console.log('FAIL', r.name, r.detail);
  const rep = await T.report();
  console.log('errors', JSON.stringify(rep.errors.slice(0, 5)));
} finally { await T.close(); }
