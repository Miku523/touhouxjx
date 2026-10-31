# -*- coding: utf-8 -*-
"""Wriggle boss MIDI loader: raw tick -> flat 155BPM time."""
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import midi2js as M
MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid')
BPM = 155.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TICK = BEAT / 480.0

mid = M.parse_midi(MIDI)
evs = mid['tracks'][0]['events']
pending = collections.defaultdict(list)
notes = []
max_tick = 0
for ev in evs:
    if ev[1] == 'on' and ev[4] > 0:
        pending[(ev[2], ev[3])].append((ev[0], ev[4]))
    elif ev[1] == 'off':
        k = (ev[2], ev[3])
        if pending[k]:
            ton, vel = pending[k].pop(0)
            notes.append(dict(ch=ev[2], to=ton, tt=max(ev[0], ton+1), m=ev[3], v=vel))
for k, st in pending.items():
    for ton, vel in st:
        notes.append(dict(ch=k[0], to=ton, tt=ton+240, m=k[1], v=vel))
notes.sort(key=lambda n: (n['to'], n['m']))
for n in notes:
    n['t'] = round(n['to'] * TICK, 4)
    n['d'] = round(max(0.03, (n['tt'] - n['to']) * TICK), 4)
    n['bar'] = n['to'] // 1920 + 1
    n['beat'] = round((n['to'] % 1920) / 480.0, 3)
max_tick = max(n['tt'] for n in notes)
print('notes', len(notes), 'last end', round(max_tick*TICK,3), 'bars', -(-max_tick//1920))

by = collections.defaultdict(list)
for n in notes: by[n['ch']].append(n)
for ch in sorted(by):
    if ch == 9: continue
    ns = by[ch]
    print('ch%2d %4d  %s' % (ch, len(ns), ' '.join('[%d:%.2f %d]' % (n['bar'], n['beat'], n['m']) for n in ns[:10])))

# hook candidates: bars 10-13 melody ch0 + ch11 + ch10
print('\nch0 bars10-14:')
for n in by[0]:
    if 10 <= n['bar'] <= 14: print('  b%d.%s m%d d%.2f v%d' % (n['bar'], n['beat'], n['m'], n['d'], n['v']))
print('\nch5 bars10-14:')
for n in by[5]:
    if 10 <= n['bar'] <= 14: print('  b%d.%s m%d d%.2f v%d' % (n['bar'], n['beat'], n['m'], n['d'], n['v']))
json.dump({'bpm':BPM,'beat':BEAT,'bar':BAR,'notes':[{k:n[k] for k in ('ch','t','d','m','v','bar','beat')} for n in notes]},
          open(os.path.join(ROOT,'tools','build','_wrig_lead','midi_flat.json'),'w',encoding='utf-8'), ensure_ascii=False)
print('saved midi_flat.json')
