/**
 * Lead 快速冒烟：验证启动幕全量门禁 v4（标题图 + game kit + 音频引擎 + 全曲库 + 关卡美术）
 * 在真浏览器里的行为。
 * 用法：PT_BASE=http://127.0.0.1:8138 node tools/_lead_smoke.mjs
 * 输出：每条 PASS/FAIL + 末尾 JSON 摘要；有失败时 exit code 1。
 */
import { launch, sleep, BASE } from './_pt_core.mjs';

const PORT = Number(process.env.SMOKE_PORT || 9426);
const rows = [];
const chk = (name, ok, detail = '') => {
  rows.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const T = await launch({ port: PORT, width: 1280, height: 720 });
try {
  await T.send('Network.enable', {});
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  // 在页面脚本之前装探针：揭幕那一刻抓门禁快照 + 各类资源的到货情况
  await T.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const S = window.__smoke = { revealedAt: 0, gate: null, timeline: [], songs: [], songsAll: [], kit: [], bgLq: 0, boss: 0, chars: 0 };
      const nameOf = (e) => String(e.name || '');
      const endOf = (e) => Math.round(e.responseEnd || 0);
      const iv = setInterval(() => {
        const b = window.__boot;
        if (!b || S.revealedAt || !b.done) return;
        S.revealedAt = Math.round(performance.now());
        const g = window.__hksBootGate || {};
        S.gate = {
          art: !!g.art, kit: !!g.kit, audio: !!g.audio, music: !!g.music,
          stageArt: !!g.stageArt, done: !!g.done, failed: (g.failed || []).slice(),
        };
        S.timeline = (b.timeline || []).map((x) => x.n);
        const res = performance.getEntriesByType('resource');
        S.songs = res
          .filter((e) => nameOf(e).includes('/engine/songs/honou_pre1.js') || nameOf(e).includes('/engine/songs/youma_stage1.js'))
          .map((e) => ({ name: nameOf(e).split('/').pop(), end: endOf(e) }));
        S.songsAll = res
          .filter((e) => nameOf(e).includes('/engine/songs/') && /\\.js(\\?|$)/.test(nameOf(e)))
          .map((e) => ({ name: nameOf(e).split('/').pop(), end: endOf(e) }));
        S.kit = res
          .filter((e) => nameOf(e).includes('/src/game/stage.js') || nameOf(e).includes('/src/game/bullets.js') || nameOf(e).includes('/src/game/story.js'))
          .map((e) => ({ name: nameOf(e).split('/').pop(), end: endOf(e) }));
        S.bgLq = res.filter((e) => /\\/art\\/gen\\/bg\\/[^/]+_lq\\.webp/.test(nameOf(e))).length;
        S.boss = res.filter((e) => /\\/art\\/gen\\/boss\\/[^/]+\\.(avif|webp)/.test(nameOf(e))).length;
        S.chars = res.filter((e) => /\\/art\\/gen\\/run\\//.test(nameOf(e))).length;
        clearInterval(iv);
      }, 20);
    })()`,
  });

  const t0 = Date.now();
  await T.nav(BASE + '/index.html');
  await T.waitFor('!!(window.__smoke && window.__smoke.revealedAt)', 120000);
  const revealMs = Date.now() - t0;
  await T.waitFor('!!(window.__game && window.__game.state === "menu")', 5000).catch(() => {});
  await sleep(200);

  const smoke = await T.eval('window.__smoke || null');
  const gate = smoke && smoke.gate;
  chk('启动幕已揭幕', !!(smoke && smoke.revealedAt > 0), `revealedAt=${smoke && smoke.revealedAt}ms, node=${revealMs}ms`);
  chk('门禁五路全绿（标题/game kit/音频/曲库/美术）',
    !!(gate && gate.art && gate.kit && gate.audio && gate.music && gate.stageArt),
    gate ? JSON.stringify(gate) : 'no gate');
  chk('门禁无失败项', !!(gate && gate.failed.length === 0), gate ? gate.failed.join(',') : '');
  chk('门禁在揭幕前完成', !!(gate && gate.done), '');
  const songs = (smoke && smoke.songs) || [];
  chk('第 1 面两首曲目模块到货', songs.length >= 2, JSON.stringify(songs));
  const songsLate = songs.filter((s) => !(s.end > 0 && smoke && s.end <= smoke.revealedAt + 5));
  chk('曲目模块在揭幕前下载完成', songsLate.length === 0, JSON.stringify(songsLate));
  const songsAll = (smoke && smoke.songsAll) || [];
  chk('全曲库模块在揭幕前到货（>=18）', songsAll.length >= 18,
    `n=${songsAll.length} late=${songsAll.filter((s) => !(s.end <= smoke.revealedAt + 5)).length}`);
  chk('7 个主题低清背景在揭幕前到货（14 张）', (smoke && smoke.bgLq) >= 14, `lq=${smoke && smoke.bgLq}`);
  chk('Boss 立绘在揭幕前到货（>=7）', (smoke && smoke.boss) >= 7, `boss=${smoke && smoke.boss}`);
  chk('自机动作帧在揭幕前到货（>=8）', (smoke && smoke.chars) >= 8, `run=${smoke && smoke.chars}`);
  const kit = (smoke && smoke.kit) || [];
  chk('三个 kit 入口模块到货', kit.length >= 3, JSON.stringify(kit));
  chk('进度时间线含 t94 里程碑', !!(smoke && smoke.timeline.indexOf('t94') >= 0), (smoke && smoke.timeline || []).join('>'));

  // 进关冒烟：标题 → 难度 → 开场对白（连续 Enter 推进）→ 进关
  await T.key('Enter');
  await sleep(600);
  const diffPage = await T.eval('({ state: window.__game.state, page: window.__game._page || null, bootDone: window.__game._bootDone })');
  await T.key('Enter');
  let reachedPlay = false;
  for (let i = 0; i < 25 && !reachedPlay; i += 1) {
    const ok = await T.waitFor('window.__game.state === "play"', 700);
    if (ok) { reachedPlay = true; break; }
    await T.key('Enter');
    await sleep(320);
  }
  await sleep(2500);
  const play = await T.eval(`(() => {
    const g = window.__game;
    const el = document.getElementById('kitLoad');
    return {
      state: g.state,
      kitLoad: el ? getComputedStyle(el).display : 'none',
      song: (g.audio && (g.audio.soundingSong || g.audio.currentSong)) || null,
      stage: !!g.stage,
      lives: g.runLives,
    };
  })()`);
  chk('揭幕后标题页可交互（难度页）', !!diffPage.bootDone && diffPage.state === 'menu', JSON.stringify(diffPage));
  chk('难度页 Enter 后进入关卡（stage 已建）', !!play.stage, JSON.stringify(play));
  chk('无 kitLoad 全屏遮罩', play.kitLoad === 'none', `display=${play.kitLoad}`);
  chk('进关后 BGM 为该关道中曲', !!play.song && play.song !== 'title', `song=${JSON.stringify(play.song)} state=${play.state}`);

  const rep = await T.report();
  const errs = (rep.errors || []).filter((e) => !/favicon/i.test(String(e)));
  chk('无 console error', errs.length === 0, errs.slice(0, 3).map((e) => String(e).slice(0, 160)).join(' | '));
  const bad = (rep.httpBad || []).filter((b) => !/favicon/i.test(JSON.stringify(b)));
  chk('无 4xx/5xx（favicon 除外）', bad.length === 0, JSON.stringify(bad.slice(0, 4)));

  const failed = rows.filter((r) => !r.ok).length;
  console.log('\n' + JSON.stringify({ ok: failed === 0, failed, total: rows.length, revealMs, smoke }, null, 2));
} finally {
  try { await T.close(); } catch (e) { /* ignore */ }
}
process.exit(rows.some((r) => !r.ok) ? 1 : 0);
