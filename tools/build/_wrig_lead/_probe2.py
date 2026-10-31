# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
mid = M.parse_midi(MIDI); div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans, _, _ = M.extract_channels(mid)
def tsec(tick): return M.tick_to_sec(segs, div, int(tick))
PITCH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def ks(counter):
    tot = sum(counter.values()) or 1
    prof=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
    best=[]
    for r in range(12):
        p=sum(counter.get((i+r)%12,0)/tot*prof[i] for i in range(12))
        best.append((round(p,4), 'major', PITCH[r]))
        p=sum(counter.get((i+r)%12,0)/tot*prof[(i+3)%12] for i in range(12))
        best.append((round(p,4), 'minor', PITCH[r]))
    best.sort(reverse=True)
    return best[:3]

mel_ch = [0,2,3,4,5,6,7,8,10,11,14]
allc = collections.Counter()
for ch in mel_ch:
    for n in chans[ch]['notes']:
        allc[n['m'] % 12] += 1
print('ALL', ks(allc))
bassc = collections.Counter()
for ch in (2, 9):
    if ch in chans:
        for n in chans[ch]['notes']:
            bassc[n['m'] % 12] += 1
print('BASS(2,9)', ks(bassc))

# per channel: bars covered, notes per bar, poly, dup vs others
def bar_of_tick(t): return t // 1920 + 1
print('\nch  notes bars(n) med poly  dup%')
per = {}
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if ch == 9:  # drums
        continue
    bars = sorted({bar_of_tick(round(_tick_of(n['t']))) for n in ns}) if False else None
    # poly ratio
    ev = sorted((n['t'], n['t']+n['d']) for n in ns)
    poly = 0; active=[]
    for t0,t1 in ev:
        active=[e for e in active if e>t0+1e-6]
        if active: poly+=1
        active.append(t1)
    per[ch]=ns
    print(ch, len(ns), round(sum(n['d'] for n in ns)/len(ns),2), round(poly/len(ns),2))
# duplicates: same pitch within 0.02s across channels
print('\ndup pairs (chA,chB,count)')
chs = sorted(per)
for i,a in enumerate(chs):
    for b in chs[i+1:]:
        sa = {(round(n['t'],2), n['m']) for n in per[a]}
        sb = {(round(n['t'],2), n['m']) for n in per[b]}
        c = len(sa & sb)
        if c > 20: print(a,b,c, 'of', len(sa), len(sb))
