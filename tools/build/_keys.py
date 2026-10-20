# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M, preview_song as PS
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def detect(chroma):
    best=[]
    for root in range(12):
        for prof,name in ((MAJ,'大调'),(MIN,'小调')):
            sc = sum(chroma[(root+i)%12]*prof[i] for i in range(12))
            best.append((sc, NAMES[root]+name))
    best.sort(reverse=True)
    return best[:3]
def chroma_of(notes):
    h=[0.0]*12
    for n in notes:
        t,m,d = (n['t'],n['m'],n['d']) if isinstance(n,dict) else (n[0],n[1],n[2])
        h[m%12]+=d
    return h
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
alln=[]
for tr in s['tracks']: alln+=tr['notes']
ca = chroma_of(alln); print('TH06 全曲:', detect(ca))
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
mid = M.parse_midi(os.path.join(base,'9 - Phantasmagoria of Flower View','7. Adventure of the Lovestruck Tomboy (ZUN).mid'))
chans, segs, div = M.extract_channels(mid); bpm=M.bpm_of(segs); bar=4*60/bpm
mel=[n for n in chans[10]['notes'] if 24*bar <= n['t'] < 48*bar]
bass=[n for n in M.mono_ize(chans[5]['notes'], keep='low') if 24*bar <= n['t'] < 48*bar]
print('TH09 ch10 旋律:', detect(chroma_of(mel)))
print('TH09 贝斯:', detect(chroma_of(bass)))
print('TH09 旋律+贝斯:', detect(chroma_of(mel+bass)))
print('ch10 音数 %d 音域 %d-%d' % (len(mel), min(n['m'] for n in mel), max(n['m'] for n in mel)))
print('每小节音符数:', [len([n for n in mel if b*bar <= n['t'] < (b+1)*bar]) for b in range(24)])
