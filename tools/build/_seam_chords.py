# -*- coding: utf-8 -*-
import sys, os, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def ns(ch): return [dict(t=n['t'], m=n['m'], d=n['d']) for n in chans[ch]['notes']]
mel = M.mono_ize(ns(0)+ns(1)+ns(2)+ns(3), keep='high'); mel.sort(key=lambda n:n['t'])
def chord_at(ts, width=1.2):
    pcs = collections.Counter()
    for ch in (5, 7, 8):
        for n in chans[ch]['notes']:
            if ts <= n['t'] < ts+width: pcs[n['m']%12] += 1
    return [p for p,_ in pcs.most_common(4)]
def mel_near(ts, span=1.4):
    return [ (round(n['t'],2), n['m']) for n in mel if abs(n['t']-ts) < span ]
print('接缝 A：前奏末 %.2fs → 主体首 %.2fs' % (9.94, 27.61))
print('  前奏末和弦', chord_at(9.94, 0.9), ' 主体首和弦', chord_at(27.61))
print('  A 附近旋律', mel_near(9.94, 1.0), '\n  →', mel_near(27.61, 1.2))
print('接缝 B：主体末 %.2fs → 尾声首 15.83s' % (27.61+32*1.4724))
print('  主体末和弦', chord_at(27.61+32*1.4724-1.2, 1.2), ' 尾声首和弦', chord_at(15.83))
print('  B 附近旋律', mel_near(27.61+32*1.4724, 1.0), '\n  →', mel_near(15.83, 1.2))
print('接缝 C：尾声末 %.2fs → 循环回前奏 4.05s' % (15.83+4*1.4724))
print('  尾声末和弦', chord_at(15.83+4*1.4724-1.2, 1.2), ' 前奏首和弦', chord_at(4.05))
print('  C 附近旋律', mel_near(15.83+4*1.4724, 1.0), '\n  →', mel_near(4.05, 1.2))
