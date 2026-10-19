import { launch, sleep } from './_pt_core.mjs';
import { bootFresh, pageInfo } from './_pt_flow_menu_util.mjs';
const T = await launch({ port: 9411, width: 1280, height: 720 });
try {
  await bootFresh(T);
  await T.key('KeyM'); await sleep(600);
  const dump1 = await T.eval(`(() => {
    const g = window.__game, m = g.musicRoom;
    return { idx: m.index, isHeardType: typeof m.isHeard, markHeardType: typeof m.markHeard,
      isHeardSrc: String(m.isHeard).slice(0, 300), gKeys: Object.keys(g).filter((k) => /heard|music/i.test(k)),
      ls: localStorage.getItem('hks.music.v1') };
  })()`);
  console.log('dump1', JSON.stringify(dump1, null, 1));
  // click row 1
  const r = await T.eval(`(() => { const el=[...document.querySelectorAll('.mr-row')][1]; const b=el.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
  await T.mouse(r.x, r.y); await sleep(300);
  const d2 = await T.eval(`(() => { const g=window.__game,m=g.musicRoom; return { idx:m.index, warn:m._warn, heardLS:localStorage.getItem('hks.music.v1') }; })()`);
  console.log('d2', JSON.stringify(d2));
  const w = await T.eval(`(() => { const el=document.querySelector('.mr-warn-btn[data-act="play"]'); const b=el.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`);
  await T.mouse(w.x, w.y); await sleep(500);
  const d3 = await T.eval(`(() => { const g=window.__game,m=g.musicRoom; const tr=m.tracks[m.index];
    return { idx:m.index, key:tr&&tr.key, song:g.audio.currentSong, musicOn:g.audio.musicOn,
      isHeardNow: tr?m.isHeard(tr.key):null, heardArr: (()=>{try{return JSON.parse(localStorage.getItem('hks.music.v1')).heard}catch(e){return 'ERR'}})(),
      count: (document.querySelector('.mr-count-num')||{}).textContent, warn:m._warn };
  })()`);
  console.log('d3', JSON.stringify(d3));
  const d4 = await T.eval(`(() => { const g=window.__game; return { keys:Object.keys(g).filter(k=>/heard|music|song/i.test(k)),
    heardVals: Object.fromEntries(Object.keys(g).filter(k=>/heard|music/i.test(k)).map(k=>{ const v=g[k]; return [k, (v instanceof Set)?[...v]:(Array.isArray(v)?v:typeof v)];})) }; })()`);
  console.log('d4', JSON.stringify(d4));
  await T.key('Escape'); await sleep(300);
  const p = await pageInfo(T);
  console.log('title', p.title);
} finally { await T.close(); }
