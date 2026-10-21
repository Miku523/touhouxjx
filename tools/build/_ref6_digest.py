# -*- coding: utf-8 -*-
"""_ref6_digest.py —— 把 _ref6_sections.json 压成紧凑摘要（供写报告时阅读）"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
d = json.load(open(os.path.join(HERE, '_ref6_sections.json'), encoding='utf-8'))


def pat(vals, thr=0.80):
    """16 格 → 4x4 点阵: 每拍 4 个十六分"""
    out = []
    for beat in range(4):
        s = ''
        for i in range(4):
            v = vals[beat * 4 + i]
            s += 'X' if v >= thr else ('x' if v >= 0.55 else ('.' if v >= 0.35 else ' '))
        out.append(s)
    return ' '.join(out)


for tag in ('ref1', 'ref3', 'ref5'):
    info = d[tag]
    print('\n' + '#' * 100)
    print('# %s  bpm=%.1f bar=%.3fs dur=%.1f 段数=%d' % (
        tag, info['bpm'], info['bar'], info['dur'], len(info['sections'])))
    print('#' * 100)
    for s in info['sections']:
        b = s['bands']
        print('\n[%2d] %6.1f-%6.1f s  小%3d-%3d (%2d)  rms %5.1f  质心%5.0f  '
              '频段 %2.0f/%2.0f/%2.0f/%2.0f/%2.0f  E%.2f' % (
                  s['idx'], s['t0'], s['t1'], s['bar0'], s['bar1'], s['bars'],
                  s['rms_db'], s['centroid'], b[0] * 100, b[1] * 100, b[2] * 100,
                  b[3] * 100, b[4] * 100, s['energy_lv']))
        chs = s.get('chords', [])
        seq = []
        for c in chs:
            if seq and seq[-1][0] == c['guess']:
                seq[-1][1] += 1
            else:
                seq.append([c['guess'], 1])
        print('  和弦: ' + ' '.join('%s%s' % (a, '' if n == 1 else 'x%d' % n) for a, n in seq))
        print('  频次: ' + ', '.join('%s x%d' % tuple(kv) for kv in s['chord_hist'][:5]))
        for k, lb in (('kick', 'K'), ('snare', 'S'), ('hat', 'H')):
            if k + '_val' in s:
                print('  %s %s  强调%s' % (lb, pat(s[k + '_val']), s[k + '_on']))
        mel = s.get('melody', [])
        line = ['%s%s' % (c['name'], c['reg']) for c in mel]
        for i in range(0, len(line), 16):
            print('  mel ' + ' '.join('%-4s' % x for x in line[i:i + 16]))
