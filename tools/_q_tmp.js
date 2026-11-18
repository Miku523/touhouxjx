const fs = require('fs');
const d = JSON.parse(fs.readFileSync('tools/build/_yuk_kit/metrics_stereo_v10.json', 'utf8'));
console.log('width_db ' + d.width_db.toFixed(2) + ' corr ' + d.corr.toFixed(3) + ' centroid ' + d.centroid_hz.toFixed(0) + ' hf ' + d.hf_db.toFixed(2) + ' side_mid ' + d.side_mid_db.toFixed(2));
console.log('drums ' + JSON.stringify(d.drums));
console.log('render_sec ' + d.render_sec.toFixed(0));
const tr = {};
for (const t of d.tracks) tr[t.name] = t.rms_db.toFixed(1);
console.log('tracks ' + JSON.stringify(tr));
// 全曲 bands
const b = {};
for (const k of Object.keys(d.bands)) b[k] = d.bands[k].toFixed(1);
console.log('bands ' + JSON.stringify(b));
