# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base,'9 - Phantasmagoria of Flower View','7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid); bpm=M.bpm_of(segs); bar=4*60/bpm
bass=[n for n in M.mono_ize(chans[5]['notes'], keep='low')]
def chord(ns, t, bar):
    seg=[n for n in ns if t<=n['t']<t+bar]
    if not seg: return '-'
    h={}
    for n in seg: h[n['m']%12]=h.get(n['m']%12,0)+n['d']
    top=sorted(h.items(), key=lambda x:-x[1])[:3]
    return ' '.join(NAMES[k] for k,_ in top)
print('TH09 低音和弦骨干 bar24-48:')
print(' | '.join('%d:%s' % (b, chord(bass, b*bar, bar)) for b in range(24,49)))
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
b2=[(n['t'],n['m'],n['d']) for n in s['tracks'][1]['notes']]
b2=[dict(t=a,m=b,d=c) for a,b,c in b2]
bar2=4*60/s['bpm']
print('TH06 低音和弦骨干 bar0-32:')
print(' | '.join('%d:%s' % (b, chord(b2, b*bar2, bar2)) for b in range(0,33)))
