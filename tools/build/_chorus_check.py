# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import preview_song as PS
def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0],m=r[1],d=r[2],v=r[3]) for r in rows]
for key, f, exp in (('stage1','touhou.js','BOSS_SONGS'), ('stage2','touhou.js','BOSS_SONGS')):
    s = PS.load_song(os.path.join(ROOT,'src','engine','songs',f), exp, key)
    lead = objs(s['tracks'][0]['notes'])
    bar = 4*60.0/s['bpm']
    nb = int(s['duration']/bar)
    print('=== %s bpm=%s bar=%.3f bars=%d lead=%d' % (key, s['bpm'], bar, nb, len(lead)))
    # 每 8 小节一组的平均音符数与平均音高
    for g in range(0, nb, 8):
        a,b = g*bar, (g+8)*bar
        ns=[n for n in lead if a<=n['t']<b]
        if not ns: 
            print('  bars %2d-%2d  空' % (g+1,min(g+8,nb))); continue
        onsets = sorted(set(round((n['t']-g*bar)/bar,3) for n in ns))
        print('  bars %2d-%2d  音符 %3d  平均音高 %5.1f  小节内位置(前几个) %s' % (g+1,min(g+8,nb), len(ns), sum(n['m'] for n in ns)/len(ns), onsets[:6]))
