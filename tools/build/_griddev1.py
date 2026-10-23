# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil',
                   '2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs)
e16 = 60.0/bpm/4.0
print('bpm %.2f e16 %.4f' % (bpm, e16))
allt = [n['t'] for c in chans.values() for n in c['notes']]
def err(phase):
    tot = 0.0
    for t in allt:
        x = ((t - phase) % e16)
        tot += min(x, e16 - x)
    return tot/len(allt)
best = min(((p*e16/200.0,) for p in range(200)), key=lambda q: err(q[0]))
print('best phase %.4fs -> mean dev %.2f ms (%.1f%% of 16th)' % (best[0], err(best[0])*1000, err(best[0])/e16*100))
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if not ns: continue
    devs = []
    for n in ns:
        x = ((n['t'] - best[0]) % e16)
        devs.append(min(x, e16-x)/e16)
    devs.sort()
    mean = sum(devs)/len(devs)
    p90 = devs[int(len(devs)*0.9)]
    print('ch%-2d n=%-4d mean %5.1f%%  p90 %5.1f%%  max %5.1f%%  (%.1f ms mean)' % (
        ch, len(ns), mean*100, p90*100, devs[-1]*100, mean*e16*1000))
