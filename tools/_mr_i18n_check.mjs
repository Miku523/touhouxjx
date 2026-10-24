/**
 * 音乐室中文曲名 / 署名 / 解说 验收
 * 跑法：node tools/_mr_i18n_check.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9624, headless: true });
const out = { steps: [] };
try {
  await T.boot();
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(500);
  const keys = await T.eval(`window.__game.musicRoom.tracks.map(t => t.key)`);
  await T.eval(`localStorage.setItem('hks.music.v1', ${JSON.stringify(JSON.stringify({ heard: keys }))}); window.__mrProbe = 1;`);
  await T.reload();
  await T.waitFor('typeof window.__mrProbe === "undefined" && !!window.__game', 20000);
  await T.waitFor('window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")', 12000);
  await T.waitFor('!document.getElementById("boot") || document.getElementById("boot").classList.contains("done")', 15000);
  await sleep(1600);
  await T.eval(`window.__game.showMusicRoom()`);
  await sleep(900);

  const data = await T.eval(`(() => {
    const mr = window.__game.musicRoom;
    return { count: mr.tracks.length,
      heard: (JSON.parse(localStorage.getItem('hks.music.v1') || '{}').heard || []).length,
      rows: mr.tracks.map(t => ({ key: t.key, no: t.no, title: t.title, sub: t.sub, cat: t.cat, orig: t.orig, note: t.note })) };
  })()`);
  out.data = data;

  const banned = /(改编|重编|直译|1:1|重排|原速|融合|柔和版|完整曲式|血月编|血月圆舞编|旅人编|改编|照原谱|照扒谱)/;
  const aiTell = /(像[^。]{0,10}一样|仿佛|某种|说不清|心里|不是[^，。]{0,12}，而是)/;
  out.audit = data.rows.map((r) => ({
    no: r.no, key: r.key,
    titleHasKana: /[\u3040-\u30ff]/.test(r.title),
    titleBanned: banned.test(r.title),
    origBanned: banned.test(r.orig),
    origCredit: /编曲：Miku523/.test(r.orig) || /作曲：Miku523/.test(r.orig),
    noteLen: r.note.length,
    noteAiTell: aiTell.test(r.note),
    noteNewline: r.note.includes('\n'),
  }));

  const snap = () => T.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y),
      w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height),
      sw: el.scrollWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
    const t = q('.mr-title'), g = q('.mr-tags');
    const tb = box(t), gb = box(g);
    return { title: t && t.textContent, titleBox: tb, tags: g && g.textContent, tagsBox: gb,
      titleOverlapTags: !!(tb && gb && tb.y + tb.h > gb.y + 1),
      orig: q('.mr-orig') && q('.mr-orig').textContent, origBox: box(q('.mr-orig')),
      note: q('.mr-note') && q('.mr-note').textContent, noteBox: box(q('.mr-note')),
      head: q('.mr-head-sub') && q('.mr-head-sub').textContent,
      count: q('.mr-count') && q('.mr-count').textContent,
      name: q('.mr-disc-name') && q('.mr-disc-name').textContent,
    };
  })()`);

  out.first = await snap();
  await T.shot('_pt/mr_i18n/01_title.png');

  const targets = [2, 6, 10, 14, 16, 18];
  for (const target of targets) {
    await T.eval(`(() => { const mr = window.__game.musicRoom; mr.index = ${target}; mr._paint(); mr._paintList(); mr._reveal(); })()`);
    await sleep(300);
    const s = await snap();
    out.steps.push({ target, key: data.rows[target].key, snap: s });
    await T.shot(`_pt/mr_i18n/${String(target + 1).padStart(2, '0')}_${data.rows[target].key}.png`);
  }

  out.errors = [...T.errors];
  out.netFails = T.netFails.filter((f) => !f.canceled);
  out.httpBad = [...T.httpBad];
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  out.fatal = String(e && e.stack || e);
  console.log(JSON.stringify(out, null, 1));
  process.exitCode = 1;
} finally {
  await T.close();
}
