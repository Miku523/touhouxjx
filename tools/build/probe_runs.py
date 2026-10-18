#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时诊断脚本之二：把每个通道切成连续发声段（runs），
并输出每段的音域 / 音数，用来判断「哪个版本 + 哪些通道能覆盖完整段落」。
用法：python tools/build/probe_runs.py "3. Apparitions" [--top]
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('m2j', os.path.join(ROOT, 'tools', 'midi2js.py'))
m2j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m2j)

DIR6 = os.path.join(m2j.SRC_BASE, '6 - The Embodiment of Scarlet Devil')
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def main():
    pat = sys.argv[1]
    show_top = '--top' in sys.argv
    for fn in sorted(os.listdir(DIR6)):
        if not fn.lower().endswith('.mid') or pat.lower() not in fn.lower():
            continue
        path = os.path.join(DIR6, fn)
        midi = m2j.parse_midi(path)
        chans, segs, div = m2j.extract_channels(midi)
        raw_end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
        print('\n=== %s  raw_end=%.2fs bpm=%d' % (fn, raw_end, m2j.bpm_of(segs)))
        for ch in sorted(chans):
            if ch == 9:
                continue
            ns = chans[ch]['notes']
            if not ns:
                continue
            runs = [r for r in m2j.runs_of(ns, 3.0) if r[1] - r[0] > 1.0]
            st = m2j.chan_stats(ns)
            print('  ch%-2d prog=%-8s n=%-5d med=%s runs=%d' %
                  (ch, m2j.fmt_progs(chans[ch]['progs']), st['count'], nn(st['med']), len(runs)))
            for a, b, lst in runs:
                top = max(n['m'] for n in lst)
                lo = min(n['m'] for n in lst)
                print('      %6.2f-%6.2f  %5.2fs  n=%-4d  %s..%s' % (a, b, b - a, len(lst), nn(lo), nn(top)))
        if show_top:
            # 每 2 秒的最高音（判断主旋律在哪个通道 / 何时出现）
            print('  -- 每2秒窗口最高音（通道:音名） --')
            buckets = {}
            for ch in sorted(chans):
                if ch == 9:
                    continue
                for n in chans[ch]['notes']:
                    k = int(n['t'] // 2)
                    if k not in buckets or n['m'] > buckets[k][1]:
                        buckets[k] = (ch, n['m'])
            line = []
            for k in sorted(buckets):
                line.append('%d-%d:%d%s' % (k * 2, k * 2 + 2, buckets[k][0], nn(buckets[k][1])))
            for i in range(0, len(line), 8):
                print('     ' + '  '.join(line[i:i + 8]))


main()
