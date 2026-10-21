# -*- coding: utf-8 -*-
"""dump Septette 各通道音符，人工判断谁在唱主旋律。"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
ch = {k: sorted(v['notes'], key=lambda n: n['t']) for k, v in chans.items()}

# ch3 与 ch10 是否互为八度加倍
a = [(round(n['t'], 2), n['m']) for n in ch[3]]
b = [(round(n['t'], 2), n['m']) for n in ch[10]]
print('ch3/ch10 音数', len(a), len(b), '时间重合', len(set(x[0] for x in a) & set(x[0] for x in b)) / max(1, len(a)))

def show(name, notes, t0, t1, limit=30):
    seg = [n for n in notes if t0 <= n['t'] < t1][:limit]
    print('\n%s  %g-%gs' % (name, t0, t1))
    print('  ' + ' '.join('%s%.2f' % (['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n['m']%12] + str(n['m']//12-1), n['t'] - t0) for n in seg))

show('ch3 trumpet 高', ch[3], 15.0, 24.0)
show('ch10 trumpet 低', ch[10], 15.0, 24.0)
show('ch5 guitar', ch[5], 15.0, 24.0)
show('ch2 piano', ch[2], 15.0, 24.0)
show('ch6 fiddle', ch[6], 42.0, 50.0)
show('ch7 trumpet2', ch[7], 42.0, 50.0)
show('ch11 dist gtr', ch[11], 15.0, 24.0)
show('ch4 strings', ch[4], 15.0, 24.0)
show('ch13 bass', ch[13], 15.0, 22.0)
