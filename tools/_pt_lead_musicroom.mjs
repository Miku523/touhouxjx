/**
 * BUG-A 证据采集：音乐回忆室「未遭遇曲目」确认框，鼠标点「播放」永远播不了
 *
 * 复现：标题 → M 打开音乐回忆室 → 点任一未遭遇曲目（行/回车）→ 确认框「播放」
 * 预期：确认框关闭并开始播放
 * 实际：确认框关掉立刻重开，曲目不变，heard 集合不变（键盘 Enter 走的是另一条分支，正常）
 *
 * 运行：node tools/_pt_lead_musicroom.mjs
 */
import { launch, makeChecks, saveJson, sleep } from './_pt_core.mjs';

const OUT = '_pt/lead_musicroom';
const C = makeChecks();
const marks = [];
const step = (m) => {
  console.log(`[step ${new Date().toISOString().slice(11, 19)}] ${m}`);
  marks.push(m);
};

const T = await launch({ port: 9431, width: 1280, height: 720 });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);
const vis = (sel) =>
  T.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return !e.classList.contains('hidden') && r.width > 1 && r.height > 1;
  })()`);

const state = () =>
  G(`({
    song: g.audio.currentSong || null,
    musicOn: !!g.audio.musicOn,
    warn: g.musicRoom._warn ? { i: g.musicRoom._warn.index, sel: g.musicRoom._warn.sel, preview: !!g.musicRoom._warn.preview } : null,
    warnVisible: !document.querySelector('#musicRoom .mr-warn').classList.contains('hidden'),
    warnPlayLabel: document.querySelector('#musicRoom .mr-warn-btn[data-act="play"]').textContent.trim(),
    index: g.musicRoom.index,
    preview: g.musicRoom._preview ? { key: g.musicRoom._preview.key, left: Math.round(g.musicRoom._preview.left) } : null,
    heardCount: g._heardSongs.size,
  })`);

const clickSel = async (sel) => {
  const r = await T.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  if (!r) throw new Error('找不到元素 ' + sel);
  await T.mouse(r.x, r.y);
};

try {
  await T.boot();
  await T.tap('KeyM');
  await T.waitFor('window.__game.musicRoom && window.__game.musicRoom.visible', 5000);
  await sleep(500);
  step('音乐室已打开');

  const unk = await G(`(() => {
    const mr = g.musicRoom;
    const i = mr.tracks.findIndex((t) => !g._heardSongs.has(t.key));
    return i >= 0 ? { i, key: mr.tracks[i].key, no: mr.tracks[i].no, title: mr.tracks[i].title || '' } : null;
  })()`);
  C.chk(!!unk, '存在未遭遇曲目', JSON.stringify(unk));
  if (!unk) throw new Error('没有未遭遇曲目');

  // 1) 点未遭遇曲目行 → 确认框
  await clickSel(`#musicRoom .mr-list .mr-row:nth-child(${unk.i + 1})`);
  await sleep(350);
  const s1 = await state();
  C.chk(s1.warnVisible && s1.warn && s1.warn.i === unk.i, '复现步骤1：点未遭遇曲目 → 弹出确认框', JSON.stringify(s1));
  await T.shot(`${OUT}/01-warn-open.png`);
  const warnText = await T.eval(`document.querySelector('#musicRoom .mr-warn-text').textContent`);
  marks.push('确认框正文: ' + warnText.trim().slice(0, 120));

  // 2) 鼠标点「播放」三次，记录每次状态
  const trail = [];
  for (let k = 0; k < 3; k++) {
    await clickSel('#musicRoom .mr-warn-btn[data-act="play"]');
    await sleep(320);
    const s = await state();
    trail.push({ k: k + 1, ...s });
    step(`第 ${k + 1} 次点「播放」→ song=${s.song} warnVisible=${s.warnVisible} heard=${s.heardCount}`);
  }
  const last = trail[trail.length - 1];
  C.chk(
    last.warnVisible && last.warn !== null,
    'BUG-A：点「播放」后确认框又弹回来（循环，永远播不了）',
    JSON.stringify(trail.map((t) => ({ k: t.k, song: t.song, warn: t.warnVisible, heard: t.heardCount })))
  );
  C.chk(last.song !== unk.key, 'BUG-A：曲目从未开始播放', `当前 song=${last.song}，目标=${unk.key}`);
  C.chk(last.heardCount === trail[0].heardCount, 'BUG-A：「已遭遇」记录没有写入，曲名依然锁着', `${trail[0].heardCount} → ${last.heardCount}`);
  await T.shot(`${OUT}/02-after-click-play.png`);

  // 3) 取消 → 用键盘重走一遍（对照组）
  await clickSel('#musicRoom .mr-warn-btn[data-act="cancel"]');
  await sleep(300);
  C.chk(!(await state()).warnVisible, '鼠标「取消」能正常关闭确认框');

  // 3a) 键盘 Enter 打开确认框并确认 → 应该能播
  await T.tap('Enter');
  await sleep(350);
  const kb1 = await state();
  C.chk(kb1.warnVisible, '键盘 Enter 对未遭遇曲目也先弹确认框', JSON.stringify(kb1));
  await T.tap('Enter'); // sel 默认在「播放」
  await sleep(600);
  const kb2 = await state();
  C.chk(!kb2.warnVisible && kb2.song === unk.key, '对照组：键盘 Enter 确认后正常播放（说明只有鼠标路径坏）', JSON.stringify({ song: kb2.song, warn: kb2.warnVisible }));
  await T.shot(`${OUT}/03-keyboard-works.png`);

  // 4) 第二处同源问题：T 试听 → 确认框预览标记丢失
  //    先挑另一首仍未遭遇的曲目
  const unk2 = await G(`(() => {
    const mr = g.musicRoom;
    const i = mr.tracks.findIndex((t) => !g._heardSongs.has(t.key));
    return i >= 0 ? { i, key: mr.tracks[i].key, no: mr.tracks[i].no } : null;
  })()`);
  if (unk2) {
    // 光标移到这行（鼠标悬停/点击行都会移动，但点击会弹框；这里用键盘选）
    await G(`(() => {
      const mr = window.__game.musicRoom;
      let guard = 0;
      while (mr.index !== ${unk2.i} && guard++ < 20) mr._move(1);
      return mr.index;
    })()`);
    await sleep(150);
    await T.tap('KeyT');
    await sleep(300);
    const p1 = await state();
    C.chk(
      p1.warnVisible && p1.warn && p1.warn.preview && p1.warnPlayLabel.includes('试听'),
      'T 试听未遭遇曲目 → 确认框按钮应显示「试听 30 秒」',
      JSON.stringify({ label: p1.warnPlayLabel, warn: p1.warn })
    );
    await T.shot(`${OUT}/04-preview-warn.png`);
    await clickSel('#musicRoom .mr-warn-btn[data-act="play"]');
    await sleep(350);
    const p2 = await state();
    C.chk(
      !p2.warnVisible && p2.preview && p2.preview.key === unk2.key,
      'BUG-A2：点确认框里的「试听 30 秒」应开始 30 秒试听',
      JSON.stringify({ warn: p2.warnVisible, label: p2.warnPlayLabel, preview: p2.preview, song: p2.song })
    );
    marks.push(`A2 结果：warn=${p2.warnVisible} label=${p2.warnPlayLabel} preview=${JSON.stringify(p2.preview)} song=${p2.song}`);
    await T.shot(`${OUT}/05-preview-after-click.png`);
  }

  // 5) 收尾：Esc 回标题，记录音乐室整体无 JS 异常
  await T.tap('Escape');
  await sleep(400);
  C.eq(await G('g.state'), 'menu', 'Esc 正常返回标题');
  const rep = await T.report();
  C.chk(rep.errors.length === 0, '本场景无 JS 异常', rep.errors.slice(0, 3).join(' | '));
} catch (e) {
  C.chk(false, '场景异常', String(e && e.message ? e.message : e));
  marks.push('异常: ' + String(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
} finally {
  try { await T.close(); } catch {}
}

const sum = C.sum();
saveJson(`${OUT}/report.json`, { ...sum, marks });
console.log(JSON.stringify({ ...sum, marks }, null, 2));
process.exit(0);
