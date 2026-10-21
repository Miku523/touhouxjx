# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as P
song = P.load_song(r'C:\Users\GuSheng\Downloads\HKS\src/engine/songs/yuuga_stage5.js', 'YUGA_STAGE5', 'stage5')
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
pn = lambda m: NM[m%12]+str(m//12-1)
print('--- 12.40–14.60s 各轨音 ---')
for i, tr in enumerate(song['tracks']):
    ns = [n for n in tr['notes'] if 12.40 <= n[0] < 14.60]
    print('t%-2d %-8s g=%.3f n=%-2d %s' % (i, tr['wave'], tr['gain'], len(ns),
          ' '.join('%s@%.2f/%.2f' % (pn(n[1]), n[0], n[2]) for n in ns[:18])))
d = [x for x in song['drums'] if 12.40 <= x[0] < 14.60]
print('drums:', json.dumps(d))
