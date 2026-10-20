# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def tmvd(n):
    if isinstance(n, dict): return n['t'], n['m'], n['d']
    return n[0], n[1], n[2]
def hist(notes):
    h = [0.0]*12
    for n in notes:
        t, m, d = tmvd(n); h[m % 12] += d
    s = sum(h) or 1
    return [round(x/s*100) for x in h]
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
lead = s['tracks'][0]['notes']
ms = [tmvd(n)[1] for n in lead]
print('TH06 主旋律 音域 %d-%d 中位 %d' % (min(ms), max(ms), sorted(ms)[len(ms)//2]))
h = hist(lead); print('TH06 音级分布', dict(zip(NAMES,h)))
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base, '9 - Phantasmagoria of Flower View', '7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid)
bpm = M.bpm_of(segs); bar = 4*60/bpm; t0 = 14*bar
melb = [n for n in M.mono_ize(chans[2]['notes'], keep='high') if t0 <= n['t'] < t0 + 24*bar]
mm = [tmvd(n)[1] for n in melb]
print('TH09 B 段 音域 %d-%d 中位 %d 音数 %d' % (min(mm), max(mm), sorted(mm)[len(mm)//2], len(mm)))
hb = hist(melb); print('TH09 音级分布', dict(zip(NAMES,hb)))
print('B 段每小节音符数:', [len([n for n in melb if b*bar <= tmvd(n)[0] < (b+1)*bar]) for b in range(24)])
