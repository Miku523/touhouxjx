# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
print(s['title'], s['bpm'], round(s['duration'],2), 'tracks', len(s['tracks']), 'drums', len(s.get('drums',[])))
for i, tr in enumerate(s['tracks']):
    ns = tr['notes']
    def g(n, k, d=None):
        return n[k] if isinstance(n, dict) else (n[k] if isinstance(n, dict) else (n[0] if k=='t' else n[1] if k=='m' else n[2] if k=='d' else n[3]))
    ts = [g(n,'t') for n in ns]; ms = [g(n,'m') for n in ns]
    print(' track%d wave %s gain %s 音数 %d 中位 %d 音域 %d-%d 时间 %.1f-%.1f' % (
        i, tr['wave'], tr['gain'], len(ns), sorted(ms)[len(ms)//2], min(ms), max(ms), min(ts), max(ts)))
