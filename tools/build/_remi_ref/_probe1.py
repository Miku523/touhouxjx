# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M

BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
print('exists', os.path.exists(MID), os.path.getsize(MID))
p = M.parse_file(MID)
g = M.build_grid(p)
print('division', p['division'], 'ntrk', p['ntrk'], 'tracks_parsed', len(p['tracks']))
print('tempo_map', g['tmap'])
print('timesig_map', g['tsmap'])
print('bars', len(g['bars']), 'lastTick', g['lastTick'], 'seconds', round(g['seconds'],3))
for i,b in enumerate(g['bars'][:4]):
    print(' bar', i, b['startTick'], round(b['startSec'],3), b['barTicks'], b['numer'], b['denom'])
ns = M.notes(p, g)
print('notes', len(ns))
# per track info
for ti,t in enumerate(p['tracks']):
    ev = t['events']
    progs = sorted(set((e[2], e[3]) for e in ev if e[1]=='prog'))
    chs = sorted(set(e[2] for e in ev if e[1] in ('on','off','prog')))
    tref = [n for n in ns if n['track']==ti]
    print('TRK', ti, 'name=', repr(t['name'])[:40], 'ev', len(ev), 'ch', chs, 'progs', progs, 'notes', len(tref))
print('--- channels')
chs = sorted(set(n['ch'] for n in ns))
for ch in chs:
    sub = [n for n in ns if n['ch']==ch]
    if not sub: continue
    pitches = [n['pitch'] for n in sub]
    bars = sorted(set(n['bar']+1 for n in sub))
    # max polyphony
    ev = []
    for n in sub:
        ev.append((n['tickOn'],1)); ev.append((n['tickOff'],-1))
    ev.sort(key=lambda x:(x[0], x[1]))
    cur=mx=0
    for _,d in ev:
        cur+=d; mx=max(mx,cur)
    print('CH', ch, 'notes', len(sub), 'range', M.pname(min(pitches)), '-', M.pname(max(pitches)),
          'bars', bars[0] if bars else 0, '-', bars[-1] if bars else 0, 'poly', mx)
