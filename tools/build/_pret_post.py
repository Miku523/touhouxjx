# -*- coding: utf-8 -*-
"""tools/build/_pret_post.py —— 五首道中曲 v1.6.70 优化用的共用后处理。

全部只做「加层 / 调鼓 / 调电平」，不动原曲逐音搬入的音符。
"""
from _pret_lib import Song  # noqa: F401


def bar_span(song, b0, b1):
    return song.bt(b0), song.bt(b1) + song.bar_len(b1)


def bar_roots(song, lo=33, hi=45, names=('bass', 'sub', 'pad', 'strings', 'piano', 'choir')):
    roots = {}
    for bar in range(1, song.nbars + 1):
        t0, t1 = bar_span(song, bar, bar)
        vals = []
        for nm in names:
            for z in song.BY.get(nm, []):
                if t0 - 0.02 <= z[0] < t1:
                    vals.append(z[1])
        if not vals:
            continue
        r = min(vals)
        while r < lo:
            r += 12
        while r - 12 >= lo and r > hi:
            r -= 12
        roots[bar] = r
    return roots


def sub_pedal(song, vel=64, lo=33, hi=45, frac=0.97):
    """每小节铺一根低音 pedal（F1-Bb2 区间），专治 63-125Hz 偏薄。"""
    roots = bar_roots(song, lo=lo, hi=hi)
    n = 0
    for bar, r in sorted(roots.items()):
        L = song.bar_len(bar)
        song.add('sub', song.bt(bar), r, L * frac, vel)
        n += 1
    return n


def copy_layer(song, src, dst, b0, b1, shift=0, vmul=1.0, lo=0, hi=127, only_long=0.0):
    t0, t1 = bar_span(song, b0, b1)
    n = 0
    for z in list(song.BY.get(src, [])):
        if not (t0 <= z[0] < t1):
            continue
        if only_long and z[2] < only_long:
            continue
        m = z[1] + shift
        while m < lo:
            m += 12
        while m > hi:
            m -= 12
        if not (0 <= m <= 127):
            continue
        song.add(dst, z[0], m, z[2], max(1, min(127, z[3] * vmul)))
        n += 1
    return n


def tick_accents(song, marks, midi=93, vel=46, wood=86, woodvel=40):
    n = 0
    for bar, beat in marks:
        t = song.bt(bar, beat)
        song.add('tick', t, midi, 0.07, vel)
        if wood is not None:
            song.add('wood' if 'wood' in [x[0] for x in song.track_defs] else 'tick', t, wood, 0.06, woodvel)
        n += 1
    return n


def crash_heads(song, marks, kind=4, vel=88):
    for bar, beat in marks:
        song.drum(song.bt(bar, beat), kind, vel)


def add_ride(song, b0, b1, beats=(0.0, 1.0, 2.0, 3.0), vel=48, skip=None):
    for bar in range(b0, b1 + 1):
        for bt in beats:
            if skip and skip(bar, bt):
                continue
            song.drum(song.bt(bar, bt), 7, vel)


def thin_crashes(song, keep_mod=3, min_vel=0):
    """把 crash/splash(kind 4) 稀疏化：每 keep_mod 个留 1 个。"""
    out, i = [], 0
    for ev in song.DRUMS:
        if ev[1] == 4 and ev[2] >= min_vel:
            keep = (i % keep_mod == 0)
            i += 1
            if not keep:
                continue
        out.append(ev)
    song.DRUMS = out
    return i

def copy_shift(song, src, dst, b0, b1, t_dst, shift=0, vmul=1.0, hi=127, lo=0):
    """把 b0-b1 小节里的 src 轨音符整体搬到 t_dst 起（用于 hook 预演）。"""
    t0, t1 = bar_span(song, b0, b1)
    n = 0
    for z in list(song.BY.get(src, [])):
        if not (t0 <= z[0] < t1):
            continue
        m = z[1] + shift
        while m < lo:
            m += 12
        while m > hi:
            m -= 12
        if not (0 <= m <= 127):
            continue
        song.add(dst, t_dst + (z[0] - t0), m, z[2], max(1, min(127, z[3] * vmul)))
        n += 1
    return n


def thin_kind(song, kind, b0, b1, mod=4, phase=0):
    """把某段里的某种鼓稀疏化：每 mod 个只留 1 个。"""
    t0, t1 = bar_span(song, b0, b1)
    out, i = [], 0
    for ev in song.DRUMS:
        if ev[1] == kind and t0 <= ev[0] < t1:
            keep = ((i + phase) % mod == 0)
            i += 1
            if not keep:
                continue
        out.append(ev)
    song.DRUMS = out
    return i
