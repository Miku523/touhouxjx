import { readFileSync } from 'node:fs';

const files = ['src/main.js', 'src/game/musicRoom.js', 'src/game/hud.js', 'src/game/ending.js', 'src/game/spellCutin.js'];
const seen = new Map();
const re = /(['"])((?:\\.|(?!\1)[^\\\n])*[\u3400-\u9fff](?:\\.|(?!\1)[^\\\n])*)\1/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const s = m[2].replace(/\\(['"\\])/g, '$1');
    if (s.includes('<') || s.includes('${')) continue;
    if (!seen.has(s)) seen.set(s, []);
    seen.get(s).push(f);
  }
}
const arr = [...seen.entries()].sort((a, b) => a[0].length - b[0].length);
for (const [s, fs] of arr) console.log(JSON.stringify(s), fs[0]);
console.log('TOTAL', arr.length);
