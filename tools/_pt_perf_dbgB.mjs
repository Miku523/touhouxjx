import { launchCfg, webglInfo, systemInfo, sleep } from './_pt_perf_lib.mjs';
const gpu = process.argv[2] !== 'soft';
const port = Number(process.argv[3] || 9460);
console.log('launching', { gpu, port });
const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
try {
  console.log('launched, proc alive?', T.proc.exitCode);
  const ok = await T.boot({ timeout: 20000 });
  console.log('boot', ok, 'state', await T.eval('window.__game && window.__game.state'));
  console.log('webgl', JSON.stringify(await webglInfo(T)));
  console.log('sys', JSON.stringify(await systemInfo(port)));
} finally {
  await T.close();
  console.log('closed');
}
