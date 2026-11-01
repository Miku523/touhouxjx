# -*- coding: utf-8 -*-
"""stage6 复盘：分段频段/鼓密度/主奏空窗/旋律重复度。"""
import os, json, io, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SEC = json.load(io.open(os.path.join(HERE, 'secs.json'), encoding='utf-8'))
if 'secs' in SEC:
    SEC = {k: [a, b] for k, a, b in SEC['secs']}
DUR = 162.078
SONG = json.load(io.open(os.path.join(HERE, 'song9.json'), encoding='utf-8'))

def rms(x):
    return 20 * np.log10(max(np.sqrt(np.mean(x * x)), 1e-12))

# ---- master: band energies per section
with wave.open(os.path.join(ROOT, 'tools', 'build', '_kag_kit', 'kaguya_v9_mono.wav')) as w:
    sr = w.getframerate(); n = w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
def band(sig, lo, hi):
    F = np.fft.rfft(sig); fr = np.fft.rfftfreq(len(sig), 1 / sr)
    F[(fr < lo) | (fr >= hi)] = 0
    return np.fft.irfft(F, len(sig))
FULL = {'low': band(x, 40, 250), 'sub': band(x, 63, 125), 'mid': band(x, 300, 3000), 'hi': band(x, 4000, 12000)}
# centroid per section
def centroid(seg):
    F = np.abs(np.fft.rfft(seg)); fr = np.fft.rfftfreq(len(seg), 1 / sr)
    return float((F * fr).sum() / max(F.sum(), 1e-9))

print('=== 分段（master, mono）===')
print('%-8s %8s %8s %8s %8s %8s %7s' % ('sec', 'rms', 'low', 'sub63', 'mid', 'hi', 'cent'))
for k, (a, b) in SEC.items():
    if k.startswith('_'):
        continue
    i0, i1 = int(a * sr), min(len(x), int(b * sr))
    seg = x[i0:i1]
    print('%-8s %8.2f %8.2f %8.2f %8.2f %8.2f %7.0f' % (
        k, rms(seg), rms(FULL['low'][i0:i1]), rms(FULL['sub'][i0:i1]),
        rms(FULL['mid'][i0:i1]), rms(FULL['hi'][i0:i1]), centroid(seg)))

# ---- stems per section (already computed before, recompute quickly for key stems)
STEM_DIR = os.path.join(HERE, 'stems_v9')
def stem_rms(name):
    p = os.path.join(STEM_DIR, name)
    if not os.path.exists(p):
        return None
    with wave.open(p) as w:
        n2 = w.getnframes(); d = np.frombuffer(w.readframes(n2), dtype='<i2').astype(np.float64) / 32768.0
    return d
stems = {}
for f in sorted(os.listdir(STEM_DIR)):
    if f.endswith('.wav'):
        stems[f[:-4]] = stem_rms(f)
print()
print('=== 关键轨逐段（stem，不含段增益）===')
keys = ['00_lead', '01_piano', '02_harpsi', '03_arp', '05_brass', '06_bass', '07_bell', '12_tick', '90_drums']
hdr = '%-8s' % 'sec' + ''.join('%10s' % k.split('_', 1)[1][:8] for k in keys)
print(hdr)
for sec, (a, b) in SEC.items():
    if sec.startswith('_'):
        continue
    i0, i1 = int(a * sr), int(b * sr)
    row = '%-8s' % sec
    for k in keys:
        d = stems.get(k)
        if d is None:
            row += '%10s' % '-'
        else:
            row += '%10.1f' % rms(d[i0:i1])
    print(row)

print()
print('=== 鼓密度（数据）===')
dr = SONG['drums']
for sec, (a, b) in SEC.items():
    if sec.startswith('_'):
        continue
    ev = [e for e in dr if a <= e[0] < b]
    kinds = {}
    for e in ev:
        kinds[e[1]] = kinds.get(e[1], 0) + 1
    dur = b - a
    print('%-8s %5.1fs  %4d hit  %5.2f/s  %s' % (sec, dur, len(ev), len(ev) / dur, dict(sorted(kinds.items()))))

print()
print('=== 主奏（lead）逐段 ===')
tr = {t['name']: t for t in SONG['tracks']}
lead = tr['lead']['notes']
for sec, (a, b) in SEC.items():
    if sec.startswith('_'):
        continue
    ns = [n for n in lead if a <= n[0] < b]
    ps = [n[1] for n in ns]
    print('%-8s %4d 音  median %s  range %s' % (sec, len(ns), int(np.median(ps)) if ps else '-', (min(ps), max(ps)) if ps else '-'))

print()
print('=== lead 空窗 >1.2s ===')
prev = None
for t, m, d, v in lead:
    if prev is not None and t - prev > 1.2:
        print('  空窗 %.2f - %.2f  (%.2fs)' % (prev, t, t - prev))
    prev = t

print()
print('=== 旋律重复度（lead 音高序列，按段比较）===')
def seq(sec):
    a, b = SEC[sec]
    return [n[1] for n in lead if a <= n[0] < b]
def sim(s1, s2):
    k = min(len(s1), len(s2))
    if k == 0:
        return 0.0
    return sum(1 for i in range(k) if s1[i] == s2[i]) / k
for s1, s2 in (('C1', 'C2'), ('C2', 'C3'), ('C1', 'C3'), ('C3', 'D1'), ('C3', 'D2'), ('A1', 'C'), ('B', 'A1')):
    a1, b1 = seq(s1), seq(s2)
    print('%s vs %s: len %d/%d  逐音相同 %.0f%%' % (s1, s2, len(a1), len(b1), sim(a1, b1) * 100))
