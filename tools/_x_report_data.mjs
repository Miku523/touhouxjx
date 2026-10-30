import fs from 'node:fs';

const keys = ['gpu-1280', 'gpu-1920', 'soft-1280', 'soft-1920'];
const scenes = ['title', 'stg_fight', 'boss', 'extra_dense', 'extra_cap60', 'extra_low', 'extra_high'];
const out = [];
const j = {};
for (const k of keys) j[k] = JSON.parse(fs.readFileSync('tools/_pt/perf_matrix_' + k + '.json', 'utf8'));
const f = (n, d = 1) => (typeof n === 'number' ? (Math.round(n * 10 ** d) / 10 ** d).toFixed(d) : '—');

out.push('### A. Main matrix');
out.push('| config | scene | fps | p50 | p95 | p99 | worst | >33ms | render avg | rint p50 | backing/post |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  for (const s of scenes) {
    const sc = (j[k].scenes || {})[s];
    if (!sc) { out.push('| ' + k + ' | ' + s + ' | - | - | - | - | - | - | - | - | - |'); continue; }
    const p = sc.probe || {}, ph = sc.ph || {}, r = ph.rint || {};
    const ri = (ph.rinfo || j[k].rinfo || {});
    out.push('| ' + k + ' | ' + s + ' | ' + (p.avg ? (1000 / p.avg).toFixed(1) : '-') + ' | ' + f(p.p50) + ' | ' + f(p.p95) + ' | ' + f(p.p99) + ' | ' + f(p.worst) + ' | ' + (p.over33 ?? '-') + ' | ' + f(ph.render && ph.render.avg) + ' | ' + f(r.p50) + ' | ' + (ri.backing ?? '?') + '/' + (ri.postLevel ?? '?') + ' |');
  }
}
out.push('');
out.push('### B. Boot');
out.push('| config | DCL | load | audio | fill | full | hide |');
out.push('|---|---|---|---|---|---|---|');
for (const k of keys) {
  const b = j[k].boot || {}, pw = b.prewarm || {}, tl = {};
  for (const e of (b.timeline || [])) tl[e.n] = e.t;
  out.push('| ' + k + ' | ' + f(b.dcl, 0) + ' | ' + f(b.loadEvent, 0) + ' | ' + f(pw.audio, 0) + ' | ' + (tl.fill ?? '-') + ' | ' + (tl.full ?? '-') + ' | ' + (tl.hide ?? '-') + ' |');
}
out.push('');
out.push('### C. Latency');
out.push('| config | native med | cap60 med | cap30 med | native min | native max |');
out.push('|---|---|---|---|---|---|');
for (const k of keys) {
  const l = j[k].latency || {}, g = (x) => f((l[x] || {}).median, 1);
  out.push('| ' + k + ' | ' + g('native') + ' | ' + g('cap60') + ' | ' + g('cap30') + ' | ' + g('native') + ' | ' + f((l.native || {}).max, 1) + ' |');
}
out.push('');
out.push('### D. Ablation (soft-1280)');
try {
  const ab = JSON.parse(fs.readFileSync('tools/_pt/perf_ablate_soft.json', 'utf8'));
  for (const [scene, vars] of Object.entries(ab.scenes || {})) {
    out.push('| scene | variant | avg ms | fps | p50 | p95 | worst | bullets |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const [v, r] of Object.entries(vars)) {
      const p = r.probe || {};
      out.push('| ' + scene + ' | ' + v + ' | ' + f(p.avg, 2) + ' | ' + (p.avg ? (1000 / p.avg).toFixed(1) : '-') + ' | ' + f(p.p50) + ' | ' + f(p.p95) + ' | ' + f(p.worst) + ' | ' + ((r.snap || {}).bullets ?? '-') + ' |');
    }
  }
} catch (e) { out.push('ablate: ' + e.message); }
out.push('');
out.push('### E. Phase timings per frame (ms)');
for (const k of ['soft', 'gpu']) {
  try {
    const p = JSON.parse(fs.readFileSync('tools/_pt/perf_phases_' + k + '.json', 'utf8'));
    for (const [name, sc] of Object.entries(p.scenes || {})) {
      const sub = (sc.sub || {}).draw || {};
      const n = sub.begin ? sub.begin.n : 1;
      const per = {};
      for (const [b, v] of Object.entries(sub)) per[b] = +(v.ms / n).toFixed(3);
      const tot = Object.values(per).reduce((a, b) => a + b, 0);
      const upd = (sc.sub || {}).upd || {};
      let updTot = 0;
      for (const v of Object.values(upd)) updTot += v.ms / (v.n || 1);
      out.push('| ' + k + ' | ' + name + ' | ' + ((sc.snap || {}).bullets ?? '?') + ' | ' + tot.toFixed(2) + ' | ' + JSON.stringify(per) + ' | upd ' + updTot.toFixed(2) + ' |');
    }
  } catch (e) { out.push(k + ': ' + e.message); }
}
fs.writeFileSync('tools/_pt/_report_data.md', out.join('\n'), 'utf8');
console.log(out.join('\n'));
