
import fs from 'node:fs';
const ROOT = 'C:/Users/GuSheng/Downloads/HKS';
const flat = JSON.parse(fs.readFileSync(ROOT + '/tools/build/_aya_lead/midi_flat.json', 'utf8'));
const { pathToFileURL } = await import('node:url');
const mod = await import(pathToFileURL(ROOT + '/src/engine/songs/aya_stage4_b.js').href);
const song = mod.AYA_STAGE4.stage4;
const key = (t, m) => t.toFixed(2) + ':' + m;
const byc = new Map();
for (const n of flat.notes) {
  if (!byc.has(n.ch)) byc.set(n.ch, new Set());
  byc.get(n.ch).add(key(n.t, n.m));
}
console.log('game', song.title, song.duration, song.bpm, 'tracks', song.tracks.length, 'drums', song.drums.length);
song.tracks.forEach((tr, i) => {
  const s = new Set(tr.notes.map(n => key(n[0], n[1])));
  let best = [0, 0, -1];
  for (const [ch, set] of byc) {
    let inter = 0; for (const k of s) if (set.has(k)) inter++;
    if (inter > best[1]) best = [inter / s.size, inter, ch];
  }
  console.log('track' + String(i).padStart(2) + ' ' + String(tr.name || '?').padEnd(10) + ' n=' + String(tr.notes.length).padStart(4) + '  best ch' + best[2] + ' overlap=' + best[0].toFixed(2) + ' (' + best[1] + ')');
});
// 第一轨前 20 个音 vs 各通道
const t0 = song.tracks[0].notes.slice(0, 12);
console.log('track0 head', JSON.stringify(t0));
// 找这些音在 Kanade 的位置
for (const n of t0.slice(0, 6)) {
  for (const [ch, list] of Object.entries(flat.notes.reduce((a, x) => { (a[x.ch] ||= []).push(x); return a; }, {}))) {
    const hit = list.find(x => Math.abs(x.t - n[0]) < 0.005 && x.m === n[1]);
    if (hit) console.log('  t=' + n[0] + ' m=' + n[1] + ' -> ch' + ch + ' bar ' + hit.bar + ' beat ' + hit.beat);
  }
}
