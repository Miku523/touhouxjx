/**
 * flow-menu：FM-5 修复回归——音乐回忆室「未遇曲目确认框」鼠标路径
 * 覆盖：鼠标点未听曲目行 → 弹框（播放）→ 点「播放」直接播放并写 heard / 行解锁；
 *       KeyT 试听未遇 → 弹框（试听 30 秒）→ 点按钮进入 30 秒试听且 preview 不丢；
 *       试听倒计时递减；键盘 Enter 路径不回退（仍先弹框）。
 * 端口 9411。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import { bootFresh, pageInfo, gameSnap, settingsSnap, DIR, shot } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows, sum } = makeChecks();
const log = (...a) => console.log('[fixes]', ...a);

async function clickSel(T, sel, nth = 0, scroll = true) {
  const info = await T.eval(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    const el = els[${nth}];
    if (!el) return { found: false, count: els.length };
    ${scroll ? 'el.scrollIntoView({ block: "nearest" });' : ''}
    const r = el.getBoundingClientRect();
    return { found: true, count: els.length, x: r.x + r.width / 2, y: r.y + r.height / 2,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) };
  })()`);
  if (info.found) await T.mouse(info.x, info.y);
  await sleep(220);
  return info;
}

const mrInfo = (T) => T.eval(`(() => {
  const m = window.__game.musicRoom;
  const idx = m.index;
  const tr = m.tracks[idx];
  return { index: idx, key: tr ? tr.key : null, preview: m._preview ? { ...m._preview } : null,
    warn: m._warn ? { ...m._warn } : null, visible: !!m.visible,
    isHeard: tr ? !!m.isHeard(tr.key) : null,
    warnPlayText: (document.querySelector('.mr-warn-btn[data-act="play"]')?.textContent || '').trim(),
    previewTag: (() => { const p = document.querySelector('.mr-preview-tag'); return p && !p.classList.contains('hidden') ? p.textContent.trim() : ''; })(),
    lockedIdx: [...document.querySelectorAll('.mr-row')].map((r, i) => (r.classList.contains('is-locked') ? i : -1)).filter((i) => i >= 0),
  };
})()`);

try {
  await bootFresh(T);
  await T.key('KeyM'); await sleep(600);
  const m0 = await pageInfo(T);
  const mi0 = await mrInfo(T);
  log('open:', JSON.stringify({ count: m0.mr?.count, state: m0.mr?.state, locked: mi0.lockedIdx.length }));
  chk(m0.musicVisible === true && mi0.lockedIdx.length > 0, 'M0 音乐室打开且有未遇曲目', { count: m0.mr?.count, lockedCount: mi0.lockedIdx.length });

  // ---- A. 鼠标点未遇曲目行 → 弹框 → 点「播放」应真正播放（FM-5 死循环修复） ----
  const target1 = mi0.lockedIdx[0];
  const key1 = await T.eval(`window.__game.musicRoom.tracks[${target1}].key`);
  const rowTxt1 = await clickSel(T, '.mr-row', target1);
  await sleep(320);
  const miA = await mrInfo(T);
  const pA = await pageInfo(T);
  await shot(T, '91-warn-mouse.png');
  log('A warn:', JSON.stringify({ row: target1, warn: miA.warn, playText: miA.warnPlayText, warnHidden: pA.mr?.warnHidden, warnSel: pA.mr?.warnSel }));
  chk(miA.warn && miA.warn.index === target1 && miA.warn.preview === false, 'M1 鼠标点未遇曲目行 → 出现确认框（非试听）', { target: target1, warn: miA.warn });
  chk(pA.mr?.warnHidden === false && String(pA.mr?.warnText || '').includes('薄雾'), 'M2 确认框可见且含「薄雾」提示', pA.mr?.warnText);
  chk(miA.warnPlayText === '播放' && pA.mr?.warnSel === 'play', 'M3 确认框按钮为「播放」且默认选中', { playText: miA.warnPlayText, sel: pA.mr?.warnSel });

  const clickPlay = await clickSel(T, '.mr-warn-btn[data-act="play"]', 0, false);
  await sleep(500);
  const miA2 = await mrInfo(T);
  const pA2 = await pageInfo(T);
  const sA2 = await settingsSnap(T);
  const gA2 = await gameSnap(T);
  const heard1 = await T.eval(`window.__game.musicRoom.isHeard(${JSON.stringify(key1)})`);
  await shot(T, '92-music-played.png');
  log('A after play:', JSON.stringify({ warn: miA2.warn, preview: miA2.preview, heard1, key1, state: pA2.mr?.state, song: gA2.song, musicOn: gA2.musicOn, count: pA2.mr?.count }));
  chk(miA2.warn === null && pA2.mr?.warnHidden === true, 'M4 点「播放」后确认框关闭（不再循环重开）', { warn: miA2.warn });
  chk(heard1 === true && gA2.musicOn === true && gA2.song === key1, 'M5 点「播放」后真正开始播放所点的曲目', { key1, song: gA2.song, musicOn: gA2.musicOn, heard1 });
  chk((sA2.music?.heard || []).includes(key1), 'M6 播放后写入 hks.music.v1（heard 含该曲）', { key1, heard: sA2.music?.heard });
  chk(pA2.mr?.rows?.[target1] && !String(pA2.mr.rows[target1].cls).includes('is-locked'), 'M7 该曲目行解锁（不再 is-locked）', pA2.mr?.rows?.[target1]);
  chk(pA2.mr?.count === '2/11', 'M8 已回想计数变为 2/11', pA2.mr?.count);

  // ---- B. KeyT 试听未遇曲目 → 弹框（试听 30 秒）→ 点按钮进入试听（preview 不丢） ----
  const miB0 = await mrInfo(T);
  const target2 = miB0.lockedIdx[0];
  const key2 = await T.eval(`window.__game.musicRoom.tracks[${target2}].key`);
  // 先用鼠标点一下该行选中（会弹框），Esc 取消，再按 T 走试听分支
  await clickSel(T, '.mr-row', target2);
  await sleep(260);
  const miB1 = await mrInfo(T);
  await T.key('Escape'); await sleep(300);
  const miB2 = await mrInfo(T);
  chk(miB1.warn && miB2.warn === null, 'M9 再次点未遇行仍弹框，Esc 可取消', { opened: !!miB1.warn, closed: miB2.warn === null });
  // 确认选中行 = target2
  const selIdx = miB2.index;
  chk(selIdx === target2, 'M10 Esc 取消后当前选中行未变', { index: selIdx, target: target2 });

  await T.key('KeyT'); await sleep(320);
  const miB3 = await mrInfo(T);
  const pB3 = await pageInfo(T);
  log('B preview warn:', JSON.stringify({ warn: miB3.warn, playText: miB3.warnPlayText, sel: pB3.mr?.warnSel }));
  chk(miB3.warn && miB3.warn.preview === true && miB3.warn.index === target2, 'M11 未遇曲目按 T 弹框且标记为试听', { warn: miB3.warn });
  chk(miB3.warnPlayText === '试听 30 秒', 'M12 试听确认框按钮文案为「试听 30 秒」', miB3.warnPlayText);

  await clickSel(T, '.mr-warn-btn[data-act="play"]', 0, false);
  await sleep(500);
  const miB4 = await mrInfo(T);
  const pB4 = await pageInfo(T);
  const sB4 = await settingsSnap(T);
  await shot(T, '93-music-preview.png');
  log('B after preview click:', JSON.stringify({ warn: miB4.warn, preview: miB4.preview, tag: pB4.mr?.previewTag, state: pB4.mr?.state, heard: miB4.isHeard }));
  chk(miB4.warn === null, 'M13 点「试听 30 秒」后确认框关闭', miB4.warn);
  chk(miB4.preview && miB4.preview.key === key2, 'M14 进入 30 秒试听且 preview 状态保留（曲目正确）', { preview: miB4.preview, key2 });
  chk((sB4.music?.heard || []).includes(key2), 'M15 试听也写入 hks.music.v1', { key2, heard: sB4.music?.heard });
  chk(pB4.mr?.previewTag !== '' && pB4.mr?.state === '试听中', 'M16 试听标签可见且状态为「试听中」', { tag: pB4.mr?.previewTag, state: pB4.mr?.state });

  // 倒计时递减（headless rAF 会被节流，用固定步长驱动真实 update）
  const left0 = miB4.preview?.left;
  await T.eval('for (let i = 0; i < 300; i++) window.__game.update(1 / 60);');
  await sleep(200);
  const miB5 = await mrInfo(T);
  const pB5 = await pageInfo(T);
  await shot(T, '94-music-preview-countdown.png');
  log('B countdown:', JSON.stringify({ left0, left1: miB5.preview?.left, tag: pB5.mr?.previewTag }));
  chk(miB5.preview && miB5.preview.left < left0 - 4, 'M17 试听倒计时在真实 update 下递减', { left0, left1: miB5.preview?.left });
  chk(/^\d+s$/.test(pB5.mr?.previewTag || ''), 'M18 试听倒计时标签格式 Ns', pB5.mr?.previewTag);

  // ---- C. 键盘 Enter 路径不回退：选中未遇曲目按 Enter 仍先弹框 ----
  const miC = await mrInfo(T);
  if (miC.lockedIdx.length) {
    const target3 = miC.lockedIdx[0];
    const cur = miC.index;
    const diff = (target3 - cur + 11) % 11;
    for (let i = 0; i < diff; i++) { await T.key('ArrowDown'); await sleep(90); }
    const miC2 = await mrInfo(T);
    await T.key('Enter'); await sleep(320);
    const miC3 = await mrInfo(T);
    const pC3 = await pageInfo(T);
    await shot(T, '95-keyboard-warn.png');
    log('C keyboard:', JSON.stringify({ target: target3, index: miC2.index, warn: miC3.warn, playText: miC3.warnPlayText }));
    chk(miC3.warn && miC3.warn.index === target3 && miC3.warn.preview === false, 'M19 键盘 Enter 路径仍先弹确认框（未回退）', { warn: miC3.warn });
    chk(miC3.warnPlayText === '播放', 'M20 键盘路径按钮文案仍为「播放」', miC3.warnPlayText);
    await T.key('Escape'); await sleep(280);
  } else {
    log('C skipped: no locked rows left');
  }

  // 返回标题
  await T.mouse(640, 8); await sleep(100);
  await T.key('Escape'); await sleep(500);
  const back = await pageInfo(T);
  chk(back.title === '東方新紀行' && back.state === 'menu', 'M21 Esc 退出音乐室回标题', { title: back.title, state: back.state });

  const sumd = sum();
  for (const r of sumd.rows) if (!r.ok) log('FAIL', r.name, r.detail);
  saveJson(`${DIR}/part_fixes.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows });
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_fixes.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e) });
  console.log('[fixes] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}
