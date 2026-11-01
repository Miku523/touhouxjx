# -*- coding: utf-8 -*-
import json, io, os, wave
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for n in ('pre1','pre2','pre3','pre4','pre6'):
    d = json.load(io.open(os.path.join(ROOT,'tools/build/_pret_lead/%s_song.json'%n), encoding='utf-8'))
    notes = sum(len(t['notes']) for t in d['tracks'])
    mp3 = os.path.getsize(os.path.join(ROOT,'src/assets/bgm/%s.mp3'%n))
    wav = os.path.join(ROOT,'tools/build/_pret_kit/%s_stereo.wav'%n)
    wb = os.path.getsize(wav) if os.path.exists(wav) else 0
    print(n, 'tracks', len(d['tracks']), 'notes', notes, 'drums', len(d['drums']), 'dur', d.get('duration'), 'bpm', d.get('bpm'), 'mp3', mp3, 'wav', wb)
