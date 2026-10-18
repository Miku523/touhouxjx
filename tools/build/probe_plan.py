#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时诊断脚本之三：为「编曲层」方案收集事实
- 是否有 ch9 鼓轨、鼓事件统计
- 指定通道 onset 间隔直方图（判断能否用 onset 网格加鼓）
- 指定时间窗内各通道的 monophony / 音域 / 音数（判断主旋律在哪个通道）
用法：python tools/build/probe_plan.py <substr> [<substr> ...]
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('m2j', os.path.join(ROOT, 'tools', 'midi2js.py'))
m2j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m2j)

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def find_files(sub):
    out = []
    for root, dirs, files in os.walk(m2j.SRC_BASE):
        for fn in files:
            if fn.lower().endswith('.mid') and sub.lower() in fn.lower():
                out.append(os.path.join(root, fn))
    return sorted(out)


def onset_hist(notes, step=0.01):
    ts = sorted(set(round(n['t'], 3) for n in notes))
    diffs = [round(ts[i + 1] - ts[i], 2) for i in range(len(ts) - 1)]
    buckets = {}
    for d in diffs:
        k = round(round(d / step) * step, 2)
        buckets[k] = buckets.get(k, 0) + 1
    return sorted(buckets.items(), key=lambda kv: -kv[1])[:10]


def window_stats(notes, a, b):
    sel = [n for n in notes if a <= n['t'] < b]
    if not sel:
        return None
    return dict(n=len(sel), med=sorted(n['m'] for n in sel)[len(sel) // 2],
                lo=min(n['m'] for n in sel), hi=max(n['m'] for n in sel),
                avgd=sum(n['d'] for n in sel) / len(sel),
                on=len(set(round(n['t'], 3) for n in sel)))


def main():
    for sub in sys.argv[1:]:
        for path in find_files(sub):
            midi = m2j.parse_midi(path)
            chans, segs, div = m2j.extract_channels(midi)
            raw_end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
            print('\n=== %s  raw_end=%.2fs bpm=%d  tempo_points=%d' %
                  (os.path.basename(path), raw_end, m2j.bpm_of(segs), len(segs)))
            dr = chans.get(9)
            if dr:
                ns = dr['notes']
                print('  DRUMS ch9 n=%d first=%s last=%s' %
                      (len(ns), [round(x['t'], 2) for x in ns[:6]], round(ns[-1]['t'], 2)))
                kinds = {}
                for n in ns:
                    kinds[n['m']] = kinds.get(n['m'], 0) + 1
                print('  DRUMS pitches(kind):', dict(sorted(kinds.items())))
            else:
                print('  DRUMS ch9: NONE')
            ch7 = chans.get(7)
            if ch7 and ch7['notes']:
                print('  onset diffs ch7:', onset_hist(ch7['notes']))
            print('  -- window 34.0-60.0 stats (stage3 B) --')
            for ch in sorted(chans):
                st = window_stats(chans[ch]['notes'], 34.0, 60.0)
                if st and st['n'] > 20:
                    print('    ch%-2d prog=%-6s n=%-4d med=%-4s %s..%s avgd=%.2f distinct_on=%d' %
                          (ch, m2j.fmt_progs(chans[ch]['progs']), st['n'], nn(st['med']),
                           nn(st['lo']), nn(st['hi']), st['avgd'], st['on']))


main()
