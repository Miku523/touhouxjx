import { launch, sleep } from './_pt_core.mjs';
import { bootFresh, pageInfo, clickBtn, shot } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
try {
  await bootFresh(T);
  let p = await pageInfo(T);
  console.log('A title=', p.title, 'n=', p.buttons.length, 'labels=', p.buttons.map((b) => b.label || b.text));
  const c0 = await clickBtn(T, 0);
  console.log('click0=', JSON.stringify(c0));
  p = await pageInfo(T);
  console.log('B title=', p.title, 'state=', p.state, 'n=', p.buttons.length, 'labels=', p.buttons.map((b) => b.text));
  await shot(T, 'debug-b.png');
  const c4 = await clickBtn(T, 4);
  console.log('click4=', JSON.stringify(c4));
  await sleep(250);
  p = await pageInfo(T);
  console.log('C title=', p.title, 'n=', p.buttons.length, 'labels=', p.buttons.map((b) => b.text));
  const rep = await T.report();
  console.log('console=', JSON.stringify({ errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad }));
} finally {
  await T.close();
}
