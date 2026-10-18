#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时诊断脚本（工具链内部用，不参与游戏运行）：
列出同一首曲子的所有 MIDI 版本的时长 / BPM / 各通道覆盖区间，
用来给 stage1 / stage3 / extra 重新选源与规划循环窗口。
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('m2j', os.path.join(ROOT, 'tools', 'midi2js.py'))
m2j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m2j)

BASE = m2j.SRC_BASE
DIR6 = os.path.join(BASE, '6 - The Embodiment of Scarlet Devil')


def probe(path, chans_of_interest=None):
    midi = m2j.parse_midi(path)
    chans, segs, div = m2j.extract_channels(midi)
    raw_end = 0.0
    for c in chans.values():
        for n in c['notes']:
            raw_end = max(raw_end, n['t'] + n['d'])
    print('\n=== %s' % os.path.basename(path))
    print('  raw_end=%.2fs  bpm=%d  通道=%s' % (raw_end, m2j.bpm_of(segs), sorted(chans)))
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            continue
        st = m2j.chan_stats(ns)
        met = m2j.channel_metrics(ns)
        first = min(n['t'] for n in ns)
        last = max(n['t'] + n['d'] for n in ns)
        print('   ch%-2d prog=%-8s n=%-5d med=%-3d poly=%3.0f%% first=%6.2f last=%6.2f '
              'dens=%.1f/s gap=%.1fs rep=%.2f  (%s)'
              % (ch, m2j.fmt_progs(chans[ch]['progs']), st['count'], st['med'],
                 st['poly'] * 100, first, last, met['dens'], met['gap'], met['rep'],
                 'DRUM' if ch == 9 else ''))
    return raw_end


if __name__ == '__main__':
    pat = sys.argv[1] if len(sys.argv) > 1 else '3. Apparitions'
    for fn in sorted(os.listdir(DIR6)):
        if not fn.lower().endswith('.mid'):
            continue
        if pat.lower() in fn.lower():
            probe(os.path.join(DIR6, fn))
