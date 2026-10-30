/** QA probe: learn DOM/state shapes for player-mode QA. */
import { launch, snapshot, sleep } from './_pt_core.mjs';
import { writeFileSync } from 'node:fs';
const T = await launch({ port: 9459 });
const log = [];
const say = (o) => { const s = typeof o === 'string' ? o : JSON.stringify(o); log.push(s); console.log(s); };
await T.boot();
say({ boot: await snapshot(T) });
say({ title: await T.eval("(() => { const ov = document.getElementById('overlay'); const btns = [...ov.querySelectorAll('.btn')].map(b => ({ t: b.textContent.replace(/\\s+/g,' ').trim(), cls: b.className, dis: !!b.disabled, hot: b.dataset && b.dataset.hotkey })); return { page: window.__game._page, state: window.__game.state, ovCls: ov.className, btns }; })()") });
say({ meta: await T.eval("(() => { const g = window.__game; return { ver: g.version, boot: window.__boot && { done: window.__boot.done, pct: window.__boot.pct }, title: document.title, lang: document.documentElement.lang, now: performance.now()|0 }; })()") });
await T.key('Enter'); await sleep(400);
say({ diff: await T.eval("(() => { const ov=document.getElementById('overlay'); return { page: window.__game._page, state: window.__game.state, cls: ov.className, cards:[...ov.querySelectorAll('.diff-card')].map(c=>c.textContent.replace(/\\s+/g,' ').trim()), cur: window.__game.difficulty }; })()") });
await T.shot('tools/shots/_qa_player/probe_diff.png');
await T.key('KeyN'); await sleep(500);
say({ charsel: await T.eval("(() => { const ov=document.getElementById('overlay'); return { page: window.__game._page, state: window.__game.state, diff: window.__game.difficulty, cards:[...ov.querySelectorAll('.cc-card')].map(c=>c.textContent.replace(/\\s+/g,' ').trim()) }; })()") });
await T.shot('tools/shots/_qa_player/probe_char.png');
await T.key('Digit1');
for (let i = 0; i < 14; i++) { await sleep(700); const s = await snapshot(T); say({ t: +((i + 1) * 0.7).toFixed(1), state: s.state, dialogue: s.dialogue, level: s.level, px: s.px }); if (s.state === 'play') break; }
await T.shot('tools/shots/_qa_player/probe_play0.png');
for (let i = 0; i < 10; i++) { await T.key('Enter'); await sleep(250); const s = await snapshot(T); say({ dia: i, state: s.state, dialogue: s.dialogue }); if (s.state === 'play' && !s.dialogue) break; }
await sleep(800);
say({ after: await snapshot(T) });
say({ hud: await T.eval("(() => ({ lives: document.getElementById('lives') && document.getElementById('lives').textContent.trim(), stageName: document.getElementById('stageName') && document.getElementById('stageName').textContent, timer: document.getElementById('timer') && document.getElementById('timer').textContent, power: document.getElementById('powerNum') && document.getElementById('powerNum').textContent, lv: document.getElementById('powerLvNum') && document.getElementById('powerLvNum').textContent, hudCls: document.getElementById('hud') && document.getElementById('hud').className, dlgCls: document.getElementById('dialogue') && document.getElementById('dialogue').className }))()") });
await T.shot('tools/shots/_qa_player/probe_play1.png');
const x0 = (await snapshot(T)).px;
await T.holdKeys(['ArrowRight'], 900);
const x1 = (await snapshot(T)).px;
say({ move: { x0, x1, d: x1 - x0 } });
say({ binds: await T.eval("(() => { const i = window.__game.input; return { scheme: i.scheme, labels: ['left','right','up','down','jump','shoot','cast','dash','slow','pause','mute','quit'].reduce((o,k)=>(o[k]=i.labelFor ? i.labelFor(k) : null, o), {}) }; })()") });
const rep = await T.report();
say({ report: { errors: rep.errors, warns: rep.warns.slice(0, 5), netFails: rep.netFails.length, httpBad: rep.httpBad.length } });
writeFileSync('tools/reports/_runner/qa_probe.json', JSON.stringify(log, null, 2));
await T.close();
