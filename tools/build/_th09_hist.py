# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base,'9 - Phantasmagoria of Flower View','7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid); bpm=M.bpm_of(segs); bar=4*60/bpm
def hist(ns):
    h=[0.0]*12
    for n in ns: h[n['m']%12]+=n['d']
    s=sum(h) or 1
    return {NAMES[i]:round(h[i]/s*100) for i in range(12)}
w10=[n for n in chans[10]['notes'] if 36 <= n['t'] < 80]
wb =[n for n in chans[5]['notes'] if 36 <= n['t'] < 80]
w4 =[n for n in chans[4]['notes'] if 36 <= n['t'] < 80]
print('ch10 旋律', hist(w10))
print('ch5  低音', hist(wb))
print('ch4  弦乐', hist(w4))
print('ch10 音数', len(w10), 'ch5 音数', len(wb))
