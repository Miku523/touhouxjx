import { launch, sleep } from './_pt_core.mjs';
import { bootFresh, pageInfo, gameSnap, advanceToPlay, shot } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9433, width: 1280, height: 720 });
try {
  await bootFresh(T);
  await T.key('Enter'); await sleep(350);
  await T.key('KeyN'); await sleep(400);
  await T.key('Digit1'); await sleep(700);
  await advanceToPlay(T);
  let g = await gameSnap(T);
  console.log('play?', g.state, g.char, g.diff);

  await T.key('Escape'); await sleep(400);
  let p = await pageInfo(T);
  console.log('pause page title=', p.title, 'n=', p.buttons.length, p.buttons.map((b) => b.text));
  console.log('subtitle=', p.subtitle);

  await T.key('KeyQ'); await sleep(500);
  p = await pageInfo(T);
  g = await gameSnap(T);
  console.log('after Q: title=', p.title, 'state=', p.state, 'overlayHidden=', p.overlayHidden, 'n=', p.buttons.length, p.buttons.map((b) => b.text));
  console.log('game=', JSON.stringify(g));

  // 再按一次 Q 看是否在标题页触发退出页
  await T.key('KeyQ'); await sleep(400);
  p = await pageInfo(T);
  console.log('Q again: title=', p.title, 'state=', p.state, 'overlayHidden=', p.overlayHidden, 'n=', p.buttons.length);
  const rep = await T.report();
  console.log('console=', JSON.stringify({ errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad }));
  await shot(T, 'debug-pause.png');
} finally {
  await T.close();
}
