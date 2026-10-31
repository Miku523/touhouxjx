
import sys, os, collections
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
for name in ['11. Wind God Girl (Kanade_KND34).mid', '11. Wind God Girl (rongns_2).mid']:
    m = M2.parse_midi(os.path.join(BASE, name))
    ch, segs, div = M2.extract_channels(m)
    print('===', name)
    print('  tempo segs:', [(a, b, round(60e6/c,2)) for a,b,c in segs][:8], '...total', len(segs))
    tot = 0
    for ci in sorted(ch):
        ns = ch[ci]['notes']
        if not ns: continue
        pitches = [n['m'] for n in ns]
        t0 = min(n['t'] for n in ns); t1 = max(n['t']+n['d'] for n in ns)
        hist = collections.Counter(pitches).most_common(4)
        print('  ch%-2d n=%-5d t=%.2f-%.2f range=%d-%d med=%d top=%s' % (ci, len(ns), t0, t1, min(pitches), max(pitches), sorted(pitches)[len(pitches)//2], hist))
        tot += len(ns)
    last = max(max(n['t']+n['d'] for n in ch[ci]['notes']) for ci in ch if ch[ci]['notes'])
    print('  total', tot, 'end %.3fs' % last, 'bars@154=%.2f' % (last/ (60/154*4)))
