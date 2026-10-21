import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

def hist(ch, t0=None, t1=None, wdur=True):
    h = {i:0.0 for i in range(12)}
    for n in chans[ch]['notes']:
        if t0 is not None and n['t'] < t0: continue
        if t1 is not None and n['t'] >= t1: continue
        h[n['m'] % 12] += n['d'] if wdur else 1
    s = sum(h.values()) or 1
    return dict(sorted(((PC[k], round(v/s,3)) for k,v in h.items() if v), key=lambda x:-x[1]))

print('== ch12 melody full');  print(hist(12))
print('== ch12 22.39-36');     print(hist(12, 22.39, 36))
print('== ch12 36-50');        print(hist(12, 36, 50))
print('== ch2 arp 22-50');     print(hist(2, 22, 50))
print('== ch3 chords 22-50');  print(hist(3, 22, 50))
print('== ch1 bass 22-50');    print(hist(1, 22, 50))
print('== ch13 22-50');        print(hist(13))
# ch12 每个音的序列（音高）
ns = sorted([n for n in chans[12]['notes']], key=lambda n: n['t'])
print('ch12 音级序列: ' + ' '.join(PC[n['m']%12] + str(n['m']//12-1) for n in ns[:40]))
print('ch13 音高:', sorted(set(n['m'] for n in chans[13]['notes']))[:20])
