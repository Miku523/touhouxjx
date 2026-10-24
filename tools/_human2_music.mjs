import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9623, headless: true });
await T.boot();
await T.key('KeyM');
await sleep(900);
const log = [];
const snap = (tag) => T.eval(`(() => {
  const g = window.__game, mr = g.musicRoom, a = g.audio;
  const s = (x) => x == null ? null : x;
  return { tag: ${JSON.stringify(tag)}, st: g.state,
    index: mr ? mr.index : null, tracks: mr ? mr.tracks.length : null,
    cur: a.currentSong, on: a.musicOn, muted: a.muted,
    voices: a._musicVoices ? a._musicVoices.size : null,
    prog: a.musicProgress ? { e: +a.musicProgress.elapsed.toFixed(2), d: a.musicProgress.duration, loop: a.musicProgress.loop } : null,
    preview: mr && mr._preview ? { key: mr._preview.key, left: +mr._preview.left.toFixed(2) } : null,
    previewDone: mr ? mr._previewDone : null,
    heard: JSON.parse(localStorage.getItem('hks.music.v1') || '[]'),
    count: document.querySelector('.mr-count-num')?.textContent,
    stateTxt: document.querySelector('.mr-state')?.textContent,
    tagTxt: document.querySelector('.mr-preview-tag')?.textContent,
    warn: !document.querySelector('.mr-warn')?.classList.contains('hidden'),
    cut: !document.querySelector('.mr-cut')?.classList.contains('hidden'),
    curTitle: document.querySelector('.mr-title')?.textContent
  };
})()`);

const tracks = (await T.eval(`window.__game.musicRoom.tracks.map(t => ({ key: t.key, no: t.no, title: t.title, time: t.time }))`));
log.push({ tracks: tracks.length, first: tracks[0], last: tracks[tracks.length - 1] });
log.push(await snap('open'));
await T.shot('_pt/human2/00_musicroom.png');

// 1) 19 首全播（每首未听过 → 弹确认 → Enter 播放）
for (let i = 0; i < tracks.length; i++) {
  if (i > 0) { await T.key('ArrowDown', 45); await sleep(120); }
  await T.key('Enter'); await sleep(180);
  const w = await T.eval(`!document.querySelector('.mr-warn').classList.contains('hidden')`);
  if (w) {
    if (i === 1) await T.shot('_pt/human2/01_enable_warn.png');
    await T.key('Enter'); await sleep(220);
  }
  const s = await snap('play' + i);
  log.push({ i, key: tracks[i].key, warn: w, cur: s.cur, on: s.on, heard: s.heard.length });
  if (i === 0) await T.shot('_pt/human2/02_playing_first.png');
}
const allHeard = await snap('all_heard');
log.push({ allHeard: { count: allHeard.count, heard: allHeard.heard.length, warn: allHeard.warn } });
await T.shot('_pt/human2/03_all19.png');

// 2) 试听 30 秒：回到第 7 首（index 6）
for (let i = 0; i < 7; i++) { await T.key('ArrowDown', 45); await sleep(100); }
await T.key('KeyT'); await sleep(300);
log.push(await snap('preview_start'));
await T.shot('_pt/human2/04_preview_start.png');
await sleep(10000);
log.push(await snap('preview_10s'));
await T.shot('_pt/human2/05_preview_10s.png');
await sleep(21500);
log.push(await snap('preview_end'));
await T.shot('_pt/human2/06_preview_end.png');
await sleep(1500);
log.push(await snap('preview_end_settled'));

// 3) 试听中切换：再按 T 开始 → 立刻换曲播放
await T.key('KeyT'); await sleep(400);
log.push(await snap('preview_again'));
await T.key('ArrowDown'); await sleep(80);
await T.key('ArrowDown'); await sleep(80);
await T.key('Enter'); await sleep(300);
log.push(await snap('rapid_switch'));
await T.shot('_pt/human2/07_preview_switch.png');

// 4) 房内 M 静音 / 恢复
await T.key('KeyM'); await sleep(250);
log.push(await snap('room_muted'));
await T.shot('_pt/human2/08_room_muted.png');
await T.key('KeyM'); await sleep(250);
log.push(await snap('room_unmute'));
// 5) ESC 退出 → 主界面 BGM 恢复
await T.key('Escape'); await sleep(900);
const back = await snap('back_title');
log.push(back);
await T.shot('_pt/human2/09_back_title.png');
const rep = await T.report();
log.push({ errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad });
console.log(JSON.stringify(log, null, 1));
await T.close();
