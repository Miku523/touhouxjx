# -*- coding: utf-8 -*-
import os, json, io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LEAD = os.path.join(ROOT, 'tools/build/_pret_lead')
KIT = os.path.join(ROOT, 'tools/build/_pret_kit')
rows = []
for n in ('pre1','pre2','pre3','pre4','pre6'):
    d = json.load(io.open(os.path.join(LEAD, n + '_song.json'), encoding='utf-8'))
    notes = sum(len(t['notes']) for t in d['tracks'])
    mp3 = os.path.getsize(os.path.join(ROOT, 'src/assets/bgm', n + '.mp3'))
    wav = os.path.getsize(os.path.join(KIT, n + '_stereo.wav'))
    rows.append((n, round(d['duration'],3), len(d['tracks']), notes, len(d['drums']), wav, mp3))
for r in rows:
    print(r)
print('mp3 total', sum(r[6] for r in rows), 'wav total', sum(r[5] for r in rows))
