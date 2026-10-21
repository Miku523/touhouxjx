# -*- coding: utf-8 -*-
import sys, os, copy
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import numpy as np
import preview_song as P
JS = os.path.join(r'C:\Users\GuSheng\Downloads\HKS', 'src/engine/songs/yuuga_stage5.js')
song = P.load_song(JS, 'YUGA_STAGE5', 'stage5')
full = P.render(song, loops=1)
def render_without(idxs):
    s2 = copy.deepcopy(song)
    for i in idxs: s2['tracks'][i]['gain'] = 0.0
    return P.render(s2, loops=1)
def rms(x): return float(np.sqrt(np.mean(x**2))) if len(x) else 0.0
# 轨道顺序：0 lead,1 octave,2 descant,3 chug,4 stab,5 flow,6 strings,7 bass,8 sub,9 pad_c,10 open,11 arp,12 cascade
no_lead = render_without([0])
n = min(len(full), len(no_lead))
lead_eng = full[:n] - no_lead[:n]
SEC = [('前奏1 0-6.7', 0, 6.67), ('前奏2 6.7-13.3', 6.67, 13.33), ('A 13.3-36.7', 13.33, 36.67),
       ('B 36.7-60', 36.67, 60.0), ('C 60-66.7', 60.0, 66.67), ('D 66.7-90', 66.67, 90.0)]
for name, a, b in SEC:
    i0, i1 = int(a*P.SR), int(min(b, n/P.SR)*P.SR)
    print('%-14s 总RMS %.3f  主旋律 %.3f (%2.0f%%)' % (name, rms(full[i0:i1]), rms(lead_eng[i0:i1]), 100*rms(lead_eng[i0:i1])/max(1e-9, rms(full[i0:i1]))))
# 前奏三层贡献
no_open = render_without([10]); no_arp = render_without([11]); no_casc = render_without([12])
for name, arr in (('游戏内长音', no_open), ('游戏内琶音', no_arp), ('原曲瀑布', no_casc)):
    d = full[:min(len(full),len(arr))] - arr[:min(len(full),len(arr))]
    i0, i1 = 0, int(13.33*P.SR)
    print('前奏里 %-10s 贡献 RMS %.3f' % (name, rms(d[i0:i1])))
