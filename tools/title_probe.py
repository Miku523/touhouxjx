#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/title_probe.py —— 各作标题曲 MIDI 主旋律探针（临时分析工具）。

用法:
    python tools/title_probe.py 6 18      # 只看 6 / 18 作
    python tools/title_probe.py           # 全部 13 作

打印每首标题曲的 BPM / 长度 / 通道候选，以及推定主旋律通道前 16 小节的
音符（音名 + 时值，16 分音符为单位）。用于人工挑句、定调、扒谱。
"""

import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIDI2JS = os.path.join(ROOT, 'tools', 'midi2js.py')
SRC_BASE = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
            r'\touhou-midi-collection-main\1 - Shooter Games')

spec = importlib.util.spec_from_file_location('midi2js', MIDI2JS)
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
M.tick_to_sec = lambda segs, division, tick: tick / float(division or 480)

TITLES = {
    6: (r'6 - The Embodiment of Scarlet Devil\1. A Dream that is more Scarlet than Red (ZUN).mid',
        'A Dream that is more Scarlet than Red'),
    7: (r'7 - Perfect Cherry Blossom\1. Ghostly Dream ~ Snow or Cherry Petal (ZUN).mid',
        'Ghostly Dream ~ Snow or Cherry Petal'),
    8: (r'8 - Imperishable Night\1. Eternal Night Vignette ~ Eastern Night (ZUN).mid',
        'Eternal Night Vignette ~ Eastern Night'),
    9: (r'9 - Phantasmagoria of Flower View\1. Flower Viewing Mound ~ Higan Retour (ZUN).mid',
        'Flower Viewing Mound ~ Higan Retour'),
    10: (r'10 - Mountain of Faith\1. Sealed Gods (unknown).mid',
         'Sealed Gods'),
    11: (r'11 - Subterranean Animism\1. Awakening of the Earth Spirits (Dekyo Ongen).mid',
         'Awakening of the Earth Spirits'),
    12: (r'12 - Undefined Fantastic Object\1. A Shadow In The Blue Sky (terebi).mid',
         'A Shadow in the Blue Sky'),
    13: (r'13 - Ten Desires\1. Spirit of Avarice (unknown).mid',
         'Spirit of Avarice'),
    14: (r'14 - Double Dealing Character\1. Mysterious Purification Rod (gondayu).mid',
         'Mysterious Purification Rod'),
    15: (r'15 - Legacy of Lunatic Kingdom\1. The Space Shrine Maiden Appears (Karl Zuñiga).mid',
         'The Space Shrine Maiden Appears'),
    16: (r'16 - Hidden Star in Four Seasons\1. The Sky Where Cherry Blossoms Flutter Down (Yaki).mid',
         'The Sky Where Cherry Blossoms Flutter Down'),
    # 17 缺 track #1，先用 Stage 6 Boss《Entrusting this World to Idols》占位做探针
    17: (r'17 - Wily Beast and Weakest Creature\13. Entrusting this World to Idols ~ Idolatrize World (ryoya1295).mid',
         '(placeholder) Entrusting this World to Idols'),
    18: (r'18 - Unconnected Marketeers\1. A Rainbow Spanning Gensokyo (Karl Zuñiga).mid',
         'A Rainbow Spanning Gensokyo'),
}

OVERRIDE = {}

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def bpm_of_segs(segs):
    if not segs:
        return 120.0
    return 60.0 / (segs[0][2] / 1e6)


def probe(num):
    rel, title = TITLES[num]
    path = os.path.join(SRC_BASE, rel)
    if not os.path.exists(path):
        print('MISSING', path)
        return
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    dur = max((n['t'] + n['d'] for c in chans.values() for n in c['notes']), default=0.0)
    bpm = bpm_of_segs(segs)
    step = 0.25  # 已改为「拍」网格：16 分音符 = 0.25 拍
    print('=' * 78)
    print('TH%02d  %s' % (num, title))
    print('bpm=%.1f  dur=%.2f beats  div=%d' % (bpm, dur, div))
    rows = []
    for ch, c in chans.items():
        if ch == 9 or not c['notes']:
            continue
        st = M.chan_stats(c['notes'])
        st.update(M.channel_metrics(c['notes']))
        st['ch'] = ch
        st['prog'] = M.main_prog(c['progs'])
        rows.append(st)
    rows.sort(key=lambda s: -s['count'])
    for s in rows[:8]:
        print('  ch%-2d prog=%-3d n=%-4d med=%-3d poly=%2.0f%% leap=%.1f dens=%.1f cov=%2.0f%%'
              % (s['ch'], s['prog'], s['count'], s['med'], s['poly'] * 100,
                 s['leap'], s['dens'], s['cov'] * 100))
    lead, bass, harm, reasons = M.pick_voices(chans, dur)
    ch_override = OVERRIDE.get(num)
    if ch_override is not None:
        lead = dict(ch=ch_override, prog=M.main_prog(chans[ch_override]['progs']),
                    notes=chans[ch_override]['notes'])
    print('  LEAD ch%d prog=%d | BASS ch%s | HARM %s'
          % (lead['ch'], lead['prog'], bass['ch'], [h['ch'] for h in harm]))
    lead_notes = M.mono_ize(lead['notes'])
    # 打印前 16 小节
    nbars = 16
    bar_of = lambda n: int(n['t'] / (step * 16))
    by_bar = {}
    for n in lead_notes:
        b = bar_of(n)
        if b < nbars:
            by_bar.setdefault(b, []).append(n)
    for b in range(nbars):
        ns = by_bar.get(b, [])
        if not ns:
            print('  %02d |' % (b + 1))
            continue
        toks = []
        for n in ns:
            # 小节内起点（16 分格）
            pos = int(round((n["t"] - b * 4) / step))
            d = max(1, int(round(n["d"] / step)))
            toks.append('%s@%d/%d' % (nn(n['m']), pos, d))
        print('  %02d | ' % (b + 1) + ' '.join(toks))


def main():
    args = sys.argv[1:]
    for a in args:
        if ':' in a:
            k, v = a.split(':')
            OVERRIDE[int(k)] = int(v)
    nums = [int(a.split(':')[0]) for a in args] or list(TITLES)
    for n in nums:
        probe(n)


if __name__ == '__main__':
    main()
