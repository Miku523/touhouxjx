# -*- coding: utf-8 -*-
"""v10 验收测量：python _chk8.py <mono.wav> <stemsdir>"""
import os, sys, json, io, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SEC = json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))['secs']
SEC = [(n, a, b) for n, a, b in SEC]
SONG = json.load(io.open(os.path.join(HERE, 'song.json'), encoding='utf-8'))


def rd(p):
    with wave.open(p) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
        return y, w.getframerate(), w.getnchannels()


def rms_db(y):
    return 20 * np.log10(max(np.sqrt(np.mean(y * y)), 1e-9))


def band(y, sr, lo, hi):
    F = np.fft.rfft(y); fr = np.fft.rfftfreq(len(y), 1 / sr)
    F[(fr < lo) | (fr >= hi)] = 0
    z = np.fft.irfft(F, len(y))
    return 20 * np.log10(max(np.sqrt(np.mean(z * z)), 1e-9))


master, sr, nch = rd(sys.argv[1])
if nch > 1:
    master = master.reshape(-1, nch).mean(axis=1)
print('master %.3fs peak %.4f rms %.2f crest %.2f' % (len(master) / sr, np.abs(master).max(), rms_db(master), 20 * np.log10(np.abs(master).max() / np.sqrt(np.mean(master ** 2)))))
print('%-6s %7s %7s' % ('sec', 'rms', '63-125'))
for n, a, b in SEC:
    y = master[int(a * sr):int(b * sr)]
    print('%-6s %7.2f %7.2f' % (n, rms_db(y), band(y, sr, 63, 125)))
print('whole  %7.2f %7.2f' % (rms_db(master), band(master, sr, 63, 125)))
tot = np.mean(master ** 2)
F = np.fft.rfft(master); fr = np.fft.rfftfreq(len(master), 1 / sr)
for lo, hi in ((20, 63), (63, 125), (125, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 16000)):
    m = (fr >= lo) & (fr < hi)
    e = np.sum(np.abs(F[m]) ** 2) / (len(master) ** 2) * 2
    print('  band %5d-%-5d %6.2f' % (lo, hi, 10 * np.log10(max(e / tot, 1e-12))))

D = sys.argv[2]
ST = {}
for f in os.listdir(D):
    if f.endswith('.wav'):
        y, sr2, c2 = rd(os.path.join(D, f))
        if c2 > 1:
            y = y.reshape(-1, c2).mean(axis=1)
        ST[f[:-4]] = y
print()
keys = [k for k in ('00_lead', '06_brass', '90_drums', '04_strings', '07_bass', '08_wavesine', '12_tick', '19_wood', '11_counter') if k in ST]
print('%-6s' % 'sec' + ''.join('%9s' % k[3:] for k in keys))
for n, a, b in SEC:
    i0, i1 = int(a * sr2), int(b * sr2)
    print('%-6s' % n + ''.join('%9.1f' % rms_db(ST[k][i0:i1]) for k in keys))
print()
print('=== melody vs drums ===')
for n, a, b in SEC:
    i0, i1 = int(a * sr2), int(b * sr2)
    lead = rms_db(ST['00_lead'][i0:i1]); brass = rms_db(ST['06_brass'][i0:i1]); dr = rms_db(ST['90_drums'][i0:i1])
    print('%-6s lead %6.1f brass %6.1f drums %6.1f mel-dr %+5.1f' % (n, lead, brass, dr, max(lead, brass) - dr))
print()
print('=== tick / wood 峰值 ===')
for n, a, b in SEC:
    i0, i1 = int(a * sr2), int(b * sr2)
    row = '%-6s' % n
    for k in (('12_tick', 'tick'), ('19_wood', 'wood')):
        if k[0] in ST:
            row += ' %s peak %.3f' % (k[1], np.abs(ST[k[0]][i0:i1]).max())
    print(row)
print()
tr = {t['name']: t['notes'] for t in SONG['tracks']}
print('=== lead 逐段最高音 / >=100 计数 ===')
for n, a, b in SEC:
    ns = [x for x in tr['lead'] if a <= x[0] < b]
    if ns:
        ms = sorted(x[1] for x in ns)
        print('%-6s n=%-4d med=%-3d max=%-3d >=100 %d' % (n, len(ns), ms[len(ms)//2], max(ms), sum(1 for m in ms if m >= 100)))
print()
for tag, lo, hi in (('B1', 26.494, 38.96), ('B2', 38.96, 51.429)):
    p = [x for x in tr['brass'] if lo <= x[0] < hi]
    c = [x for x in tr['counter'] if lo <= x[0] < hi]
    print('%s brass %d  counter %d  counter pitches %s' % (tag, len(p), len(c), [x[1] for x in c][:12]))
