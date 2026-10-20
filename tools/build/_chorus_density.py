# -*- coding: utf-8 -*-
import os, sys
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import preview_song as PS
def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0],m=r[1],d=r[2],v=r[3]) for r in rows]
for path, exp, key in (('phoenix_stage1.js','PHOENIX_A','stage1a'), ('eurobeat_stage2.js','EUROBEAT_SONGS','stage2')):
    s = PS.load_song(os.path.join(ROOT,'src','engine','songs',path), exp, key)
    lead = objs(s['tracks'][0]['notes']); bar = 4*60.0/s['bpm']; nb = int(round(s['duration']/bar))
    counts=[sum(1 for n in lead if b*bar <= n['t'] < (b+1)*bar) for b in range(nb)]
    sm=[sum(counts[max(0,b-1):min(nb,b+3)])/float(len(counts[max(0,b-1):min(nb,b+3)])) for b in range(nb)]
    med=sorted(sm)[len(sm)//2]
    print('%s bar=%.3f bars=%d median=%.1f' % (key, bar, nb, med))
    print('  逐小节:', ' '.join('%d' % c for c in counts))
    print('  平滑后:', ' '.join('%.1f' % c for c in sm))
    print('  超过 1.10×:', [b for b in range(nb) if sm[b] >= med*1.10], ' 超过 1.25×:', [b for b in range(nb) if sm[b] >= med*1.25])
