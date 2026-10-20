# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js', 'ATEAM_STAGE3', 'stage3')
def n_(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
bar = 4*60/s['bpm']
waves=[t['wave'] for t in s['tracks']]
print('轨:', waves)
mel = [n_(n) for n in s['tracks'][0]['notes']]
bass = [n_(n) for n in s['tracks'][2]['notes']] if len(s['tracks'])>2 else []
print('lead 音数 %d 音域 %d-%d' % (len(mel), min(n['m'] for n in mel), max(n['m'] for n in mel)))
# 每小节：贝斯音级 vs 主旋律音级 的重合率
def pcs(ns, a, b, key):
    return {(n[key] % 12 if key=='m' else 0) for n in ns if a <= n['t'] < b}
mism = 0; tot = 0
for b in range(0, 64, 4):
    t0, t1 = b*bar, (b+4)*bar
    mp = {n['m']%12 for n in mel if t0<=n['t']<t1}
    if not mp: continue
    bp = {n['m']%12 for n in bass if t0<=n['t']<t1}
    if not bp: continue
    tot += 1
    if not (bp & mp): mism += 1
print('每 4 小节：贝斯音级与主旋律音级完全不重合的段落 %d/%d' % (mism, tot))
