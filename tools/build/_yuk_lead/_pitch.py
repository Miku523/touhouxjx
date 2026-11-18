# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys
sys.path.insert(0,'tools/build')
import importlib.util, json, io
# read song js via node-free path: parse with json from _pret_lead/yukari_ph_song.json if present
song = json.load(io.open('tools/build/_pret_lead/yukari_ph_song.json', encoding='utf-8'))
bpm = song['bpm']; bar = 4*60/bpm
y, sr = sf.read('tools/build/_yuk_kit/stems_v4/00_lead.wav')
secs = json.load(io.open('tools/build/_pret_lead/yukari_ph_secs.json', encoding='utf-8'))['secs']
A = dict((n,(t0,t1)) for n,t0,t1 in secs)['A']
t0,t1 = A
tr = [t for t in song['tracks'] if t['name']=='lead'][0]
notes = [n for n in tr['notes'] if t0 <= n[0] < t1]
print('lead notes in A', len(notes))
devs=[]; missing=0
for (t, m, dur, v) in notes:
    f0 = 440.0*2**((m-69)/12.0)
    i0 = int((t+0.03)*sr); i1 = i0 + int(0.08*sr)
    if i1 >= len(y): break
    seg = y[i0:i1]*np.hanning(i1-i0)
    sp = np.abs(np.fft.rfft(seg, 1<<15))
    fr = np.fft.rfftfreq(1<<15, 1/sr)
    msk = (fr > f0*0.85) & (fr < f0*1.18)
    if not msk.any(): continue
    k = np.argmax(sp*msk)
    cents = 1200*np.log2(fr[k]/f0)
    devs.append(cents)
devs=np.array(devs)
print('n %d  mean %+.1f  median %+.1f  p5 %+.1f  p95 %+.1f  |dev|>35c: %d' % (
  len(devs), devs.mean(), np.median(devs), np.percentile(devs,5), np.percentile(devs,95), (np.abs(devs)>35).sum()))
