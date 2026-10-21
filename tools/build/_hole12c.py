# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as P
song = P.load_song(r'C:\Users\GuSheng\Downloads\HKS\src/engine/songs/yuuga_stage5.js', 'YUGA_STAGE5', 'stage5')
NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
pn = lambda m: NM[m%12]+str(m//12-1)
print('drums 13.1–14.5:', json.dumps([x for x in song['drums'] if 13.1 <= x[0] < 14.5]))
for i in (14, 4, 12, 13):
    tr = song['tracks'][i]
    print('t%-2d %-8s g=%.3f %s' % (i, tr['wave'], tr['gain'],
        ' '.join('%s@%.2f/%.2f' % (pn(n[1]), n[0], n[2]) for n in tr['notes'] if 13.1 <= n[0] < 14.6)))
