# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
SCALE = {9,11,0,2,4,5,7}  # E minor natural: E F# G A B C D = 4,6,7,9,11,0,2
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base,'9 - Phantasmagoria of Flower View','7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid); bpm=M.bpm_of(segs); bar=4*60/bpm
mel=[n for n in chans[10]['notes'] if 24*bar <= n['t'] < 48*bar]
bass=[n for n in M.mono_ize(chans[5]['notes'], keep='low') if 24*bar <= n['t'] < 48*bar]
def score(notes, delta):
    tot=0; fit=0
    for n in notes:
        tot+=n['d']
        if (n['m']+delta)%12 in SCALE: fit+=n['d']
    return fit/tot
rows=[]
for d in range(12):
    rows.append((round(score(mel,d)+score(bass,d),3), d, round(score(mel,d),3), round(score(bass,d),3)))
rows.sort(reverse=True)
for r in rows[:6]:
    print('移调 +%2d 半音 → 吻合 E 小调 %.2f（旋律 %.2f / 低音 %.2f）' % (r[1], r[0]/2, r[2], r[3]))
print()
mm=[n['m'] for n in mel]
print('旋律原音域 %d-%d 中位 %d；+3 → %d-%d' % (min(mm), max(mm), sorted(mm)[len(mm)//2], min(mm)+3, max(mm)+3))
