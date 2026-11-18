/**
 * 排行榜数据链路探针：用 main.js 真实存的难度键造一条成绩，再看排行榜页面能不能读到。
 * 这个探针专门防「写入端和读取端用不同键，但自测两端同错所以自洽通过」那类 bug。
 * 用法：PT_BASE=http://127.0.0.1:8731 node tools/_probe_ranking_data.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '_pt/rooms';
mkdirSync(OUT, { recursive: true });

const out = [];
const ok = (name, pass, info) => {
  out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + JSON.stringify(info) : ''}`);
};

const T = await launch({ port: 9414 });

try {
  await T.boot();
  const booted = await (async () => {
    for (let i = 0; i < 80; i++) {
      if (await T.eval('!!window.__game?._bootDone')) return true;
      await sleep(200);
    }
    return false;
  })();
  ok('启动幕揭幕完成（_bootDone）', booted);
  if (!booted) throw new Error('boot 未完成');

  // 造一条真实成绩：难度键用 main.js 实际存的短键 'N'
  const seeded = await T.eval(`(async () => {
    const s = await import('/src/game/score.js');
    try { localStorage.removeItem('hks.score.v1'); } catch {}
    const r = s.submitScore('stage1', 'N', { score: 987654, char: 'reimu', graze: 4321 });
    return { rank: r.rank, isNew: r.isNew, best: s.bestScore('stage1', 'N') };
  })()`);
  ok('造成绩成功（stage1 · N · 987654）', seeded.rank === 1 && seeded.best === 987654, seeded);

  // 开排行榜，默认 tab 应该是「普通」并读到这条成绩
  const view = await T.eval(`(() => {
    const g = window.__game;
    g.showRanking();
    const el = document.querySelector('.rk-root');
    const txt = el ? el.innerText.replace(/\\s+/g, ' ').trim() : '';
    const diffIdx = g.rankingRoom?._diffIdx ?? g.rankingRoom?.diffIdx;
    const tabLabel = document.querySelector('[data-f="diff"] .rk-chip.is-on')?.innerText || '';
    return { visible: !!g.rankingRoom?.visible, diffIdx, tabLabel, txt: txt.slice(0, 400) };
  })()`);
  ok('排行榜打开且默认难度是「普通」', view.visible && /普通/.test(view.tabLabel), {
    diffIdx: view.diffIdx,
    tabLabel: view.tabLabel,
  });
  ok('榜单读到了真实成绩 0987654', /0987654|987654/.test(view.txt), view.txt);
  await T.shot(`${OUT}/05-ranking-data.png`);

  // 切到别的难度应是空的（证明桶键隔离正常）
  const other = await T.eval(`(() => {
    const g = window.__game;
    const ev = (code) => g.onKeyDown?.({ code, preventDefault(){}, repeat:false });
    // 直接调 room 的按键，绕过菜单分派
    g.rankingRoom.handleKey({ code: 'ArrowLeft', preventDefault(){}, repeat:false });
    const el = document.querySelector('.rk-root');
    return {
      tabLabel: document.querySelector('[data-f="diff"] .rk-chip.is-on')?.innerText || '',
      txt: (el ? el.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 200),
    };
  })()`);
  ok('左键切到上一档难度后为空榜', /简单/.test(other.tabLabel) && /还没有记录/.test(other.txt), other);

  const rep = await T.report();
  ok('无 console error', rep.errors.length === 0, rep.errors.slice(0, 4));
  ok('无 4xx/5xx', rep.httpBad.filter((u) => !/favicon/.test(u)).length === 0, rep.httpBad.slice(0, 4));
} catch (e) {
  out.push('FAIL  探针异常  — ' + (e && e.message ? e.message.slice(0, 300) : String(e)));
} finally {
  console.log(out.join('\n'));
  console.log(
    `\n共 ${out.length} 项：PASS ${out.filter((l) => l.startsWith('PASS')).length} / FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`
  );
  await T.close();
}
