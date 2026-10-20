# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\ateam_stage3.js', 'ATEAM_STAGE3', 'stage3')
bar = 4*60/s['bpm']; beat = 60/s['bpm']
def t_of(n): return n['t'] if isinstance(n,dict) else n[0]
lead = s['tracks'][0]['notes']
for b in (14,15,16,17,18,19):
    sel=sorted([n for n in lead if b*bar-1e-6 <= t_of(n) < (b+1)*bar], key=t_of)
    print('bar %2d (%.2fs) 主旋律 %d 音，前 3 个拍位 %s' % (b, b*bar, len(sel), [round((t_of(n)-b*bar)/beat,2) for n in sel[:3]]))
