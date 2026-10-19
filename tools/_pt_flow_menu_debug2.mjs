import { launch, sleep } from './_pt_core.mjs';

console.log('before launch', new Date().toISOString());
const t = Date.now();
const T = await Promise.race([
  launch({ port: 9433, width: 1280, height: 720 }),
  new Promise((_, rej) => setTimeout(() => rej(new Error('launch timeout 60s')), 60000)),
]);
console.log('launched in', Date.now() - t, 'ms');
try {
  console.log('boot...');
  await T.boot({ query: '?seed=12345' });
  console.log('booted', await T.eval('({game:!!window.__game,state:window.__game&&window.__game.state,title:document.title})'));
  const rep = await T.report();
  console.log('console=', JSON.stringify({ errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad, netFails: rep.netFails }));
} finally {
  await T.close();
  console.log('closed');
}
