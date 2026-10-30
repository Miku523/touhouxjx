import { launchCfg, webglInfo, systemInfo, installProbe, readProbe, sleep, BASE } from './_pt_perf_lib.mjs';

const cfgs = [
  { key: 'gpu1280', port: 9461, gpu: true, width: 1280, height: 720 },
  { key: 'soft1280', port: 9462, gpu: false, width: 1280, height: 720 },
];
for (const c of cfgs) {
  const T = await launchCfg(c);
  const t0 = Date.now();
  await T.boot();
  const bootMs = Date.now() - t0;
  const info = await T.eval('window.__rendererInfo');
  const webgl = await webglInfo(T);
  const pre = await T.eval('window.__prewarmInfo');
  const qinfo = await T.eval('window.__game.renderer.qualityInfo()');
  const sys = await systemInfo(T.port);
  await installProbe(T);
  await sleep(3000);
  const probe = await readProbe(T);
  const snap = await T.eval(`(() => { const g = window.__game, r = g.renderer; return { state: g.state, fps: g.loop.fps, frameCap: g.loop.frameCap, stepMs: g.loop.lastStepMs, innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio, canvas: [r.canvas.width, r.canvas.height], backing: r.backing, css: getComputedStyle(r.canvas).width + 'x' + getComputedStyle(r.canvas).height, postLevel: r.postLevel, lowSpec: r.lowSpec, mode: r.quality, dprRaw: r.dpr }; })()`);
  console.log(JSON.stringify({ key: c.key, bootMs, info, qinfo, pre, webgl, probe, snap, gpuDevices: sys && sys.gpu ? sys.gpu.devices : null, args: sys && sys.commandLine }, null, 1));
  await T.close();
}
