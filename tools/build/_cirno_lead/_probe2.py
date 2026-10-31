# -*- coding: utf-8 -*-
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
FILES = {
  'girl': (os.path.join(BASE, '6 - The Embodiment of Scarlet Devil', '5. Tomboyish Girl in Love (ZUN).mid'), 440),
  'adventure': (os.path.join(BASE, '9 - Phantasmagoria of Flower View', '7. Adventure of the Lovestruck Tomboy (ZUN).mid'), 0),
}
KS_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
KS_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
def ks(hist):
    tot=sum(hist.values()) or 1
    best=[]
    for r in range(12):
        for name,prof in (('maj',KS_MAJ),('min',KS_MIN)):
            sc=sum(prof[(i-r)%12]*hist.get(i,0)/tot for i in range(12))
            best.append((round(sc,3), M.NOTE_NAMES[r] if hasattr(M,'NOTE_NAMES') else r, name))
    best.sort(reverse=True)
    return best[:3]
for name,(MIDI,OFF) in FILES.items():
    mid = M.parse_midi(MIDI); div=mid['division'] or 480
    segs = M.build_tempo_map(mid['tracks'], div)
    def tsec(t): return M.tick_to_sec(segs, div, int(t))
    # raw note-ons with channel and duration
    evs={}
    for ti,tr in enumerate(mid['tracks']):
        for ev in tr['events']:
            pass
    chans,_,_ = M.extract_channels(mid)
    print('===',name)
    # histogram all pitched
    hist=collections.Counter()
    for ch,c in chans.items():
        if ch==9: continue
        for n in c['notes']: hist[n['m']%12]+=1
    print(' KS all', ks(hist))
    # per channel: which bars active, first notes
    for ch in sorted(chans):
        c=chans[ch]; ns=c['notes']
        if not ns or ch==9: continue
        # per-bar counts from seconds: bar length at first tempo
        bpm0=60e6/segs[0][2]; bar=4*60.0/bpm0
        # bars in flat time: t*? tempo changes only at end for girl -> ok
        bc=collections.Counter(int(n['t']/bar) for n in ns)
        bars=sorted(bc)
        # melody likelihood: distinct pitches and range
        ps=sorted(set(n['m'] for n in ns))
        h=collections.Counter(n['m']%12 for n in ns)
        print(' ch%02d n=%d range=%d-%d bars=%s..%s (%d) ks=%s' % (ch,len(ns),min(ps),max(ps),bars[0],bars[-1],len(bars),ks(h)[0]))
    # dump candidate melody first bars
    cand = [7,2,3,0] if name=='girl' else [2,0,3,7]
    for ch in cand:
        if ch not in chans: continue
        ns=[n for n in chans[ch]['notes']]
        bpm0=60e6/segs[0][2]; bar=4*60.0/bpm0; beat=bar/4
        print(' --- ch%d first 40 notes (bar,beat,midi,dur)'%ch)
        row=[]
        for n in ns[:40]:
            b=int(n['t']/bar)+1; bt=round(((n['t']/bar)-(b-1))*4,2)
            row.append((b,bt,n['m'],round(n['d']/beat,2)))
        print('   ',row)
