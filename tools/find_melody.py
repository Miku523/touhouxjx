#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rank candidate melody windows across all channels of a theme.

Usage: python tools/find_melody.py NUM
"""
import os, sys, statistics
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('title_theme', os.path.join(ROOT, 'tools', 'title_theme.py'))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)
M = T.M


def pickup(num):
    rel, title, lead_ch, bass_ch = T.TITLES[num]
    path = os.path.join(T.SRC_BASE, rel)
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    return chans


def features(notes, b0, b1):
    seg = [n for n in notes if b0 - 1e-6 <= n['t'] < b1 - 1e-6]
    if len(seg) < 5 or len(seg) > 40:
        return None
    ps = [n['m'] for n in seg]
    if max(ps) - min(ps) > 26 or statistics.median(ps) < 48:
        return None
    vec = []
    k = 0
    for i in range(int((b1 - b0) / 0.5)):
        t = b0 + i * 0.5
        while k < len(seg) and seg[k]['t'] < t - 1e-6:
            k += 1
        vec.append(seg[k]['m'] if k < len(seg) and abs(seg[k]['t'] - t) < 1e-6 else None)
    beats = [tuple(vec[i:i + 2]) for i in range(0, len(vec) - 1, 2)]
    rep = sum(1 for a, b in zip(beats, beats[1:]) if a == b and a != (None, None))
    ivs = [abs(b - a) for a, b in zip(ps, ps[1:])]
    step = sum(1 for v in ivs if 0 < v <= 4) / max(1, len(ivs))
    leap = sum(1 for v in ivs if v > 7) / max(1, len(ivs))
    uniq = len(set(ps)) / len(ps)
    dens = len(seg) / (b1 - b0)
    return dict(seg=seg, rep=rep, step=step, leap=leap, uniq=uniq, dens=dens)


def main():
    num = int(sys.argv[1])
    chans = pickup(num)
    out = []
    for chid, c in chans.items():
        notes = M.mono_ize([dict(n) for n in c['notes']])
        end = max((n['t'] + n['d'] for n in notes), default=0)
        for b0 in range(0, max(2, int(end) - 4), 2):
            f = features(notes, b0, b0 + 4)
            if not f:
                continue
            prog = c.get('prog', 0)
            fam = 1.10 if (73 <= prog <= 79 or prog in (0, 48, 49, 56, 71, 72)) else 1.0
            score = (f['step'] * 2.2 + f['uniq'] * 1.6 + min(f['dens'], 4) * 0.25
                     + (0.6 if 1.0 <= f['dens'] <= 3 else 0) - f['rep'] * 0.55 - f['leap'] * 1.2) * fam
            out.append((score, prog, chid, b0, f))
    out.sort(key=lambda x: -x[0])
    print('TH%02d  best melodic windows' % num)
    used = {}
    shown = 0
    for score, prog, chid, b0, f in out:
        if used.get(chid, 0) >= 2:
            continue
        used[chid] = used.get(chid, 0) + 1
        notes = ' '.join('%s@%.1f' % (T.nn(n['m']), n['t'] - b0) for n in f['seg'][:12])
        print('  ch%-2d prog%-3d beat%3d sc%5.2f rep%d st%.2f uq%.2f dn%.1f | %s'
              % (chid, prog, b0, score, f['rep'], f['step'], f['uniq'], f['dens'], notes))
        shown += 1
        if shown >= 12:
            break


if __name__ == '__main__':
    main()
