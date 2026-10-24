import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9727 });
try {
  await T.boot({ waitTitle: true });
  const which = process.argv[2] || 'settings-null';
  const payloads = {
    'settings-null': ["hks.settings.v1", 'null'],
    'progress-bad': ["hks.progress.v1", '{oops'],
    'music-num': ["hks.music.v1", '42'],
    'keybinds-arr': ["hks.keybinds.v1", '["x"]'],
  };
  const [k, v] = payloads[which];
  await T.eval(`localStorage.clear(); localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)}); 1`);
  await T.reload();
  await sleep(3500);
  const st = await T.eval(`({ hasGame: !!window.__game, state: window.__game && window.__game.state, ready: document.readyState })`);
  const rep = await T.report();
  console.log(which, JSON.stringify(st));
  console.log('errors:', JSON.stringify(rep.errors.slice(0, 5)));
  console.log('warns:', JSON.stringify(rep.warns.slice(0, 5)));
} finally { await T.close(); }
