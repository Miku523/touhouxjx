# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MIDI = os.path.join(r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main", "6 - Arranges", "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
mid = M.parse_midi(MIDI); div = mid['division'] or 480
segs = M.build_tempo_map(mid['tracks'], div)
chans, _, _ = M.extract_channels(mid)
def tsec(tick): return M.tick_to_sec(segs, div, int(tick))
print('division', div, 'tempo', [(s[0], round(60e6/s[2],2)) for s in segs][:12], 'nsegs', len(segs))
ons=[]
for ti,tr in enumerate(mid['tracks']):
    for ev in tr['events']:
        if ev[1]=='on' and ev[4]>0: ons.append((ev[0],ev[2],ev[3],ev[4],ti))
ons.sort(); mt=max(o[0] for o in ons)
print('ons',len(ons),'max_tick',mt,'end',round(tsec(mt),3),'first',round(tsec(ons[0][0]),3))
for g in (1920,480,240):
    print(' mod',g,collections.Counter(o[0]%g for o in ons).most_common(4))
for ch in sorted(chans):
    c=chans[ch]; ns=c['notes']
    if not ns: continue
    lo=min(n['m'] for n in ns); hi=max(n['m'] for n in ns)
    t0=min(n['t'] for n in ns); t1=max(n['t']+n['d'] for n in ns)
    pc=collections.Counter(n['m']%12 for n in ns).most_common(3)
    print(' ch%-2d n=%-4d %d-%d prog=%s t=%.2f-%.2f pc=%s'%(ch,len(ns),lo,hi,c.get('progs'),t0,t1,pc))
bpm0=60e6/segs[0][2]; bar=4*60.0/bpm0
mx=tsec(mt); bars=int(mx/bar)+2
mus=[ch for ch in chans if chans[ch]['notes'] and len(chans[ch]['notes'])>50]
cnt=[]
for b in range(bars):
    t0,t1=b*bar,(b+1)*bar
    cnt.append(sum(1 for ch in mus for x in chans[ch]['notes'] if t0<=x['t']<t1))
print(' bar %.3fs bars=%d'%(bar,bars)); print(' counts',cnt)
