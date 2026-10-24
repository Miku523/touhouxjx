import fs from 'node:fs';

const files = [
  'src/main.js',
  'src/game/story.js',
  'src/game/endings.js',
  'src/game/boss.js',
  'src/game/musicTracks.js',
  'src/game/musicRoom.js',
  'src/game/dialogue.js',
  'src/game/hud.js',
  'src/game/difficulty.js',
  'src/game/enemies.js',
  'src/engine/audio.js',
  'src/assets/levelgen.js',
  'src/assets/levels.js',
  'src/game/playerShots.js',
  'src/game/stage.js',
];

const re = /(['"`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g;
const total = new Set();

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const set = new Set();
  let m;
  while ((m = re.exec(s))) {
    const t = m[2];
    if (/[\u4e00-\u9fff]/.test(t) && t.trim()) set.add(t.trim());
  }
  for (const t of set) total.add(t);
  console.log(f.padEnd(28), set.size);
}
console.log('TOTAL unique CJK strings:', total.size);
