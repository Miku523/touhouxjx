#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/show_theme.py —— 查看某作某通道在指定小节范围的音符（16 分格 = 0.25 拍）。

用法:
    python tools/show_theme.py 14 0 12 8     # TH14 通道 0，从第 12 小节起 8 小节
    python tools/show_theme.py 13 3 0 16     # TH13 通道 3，从头 16 小节
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIDI2JS = os.path.join(ROOT, 'tools', 'midi2js.py')
SRC_BASE = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
            r'\touhou-midi-collection-main\1 - Shooter Games')
T = {
    6: r'6 - The Embodiment of Scarlet Devil\1. A Dream that is more Scarlet than Red (ZUN).mid',
    7: r'7 - Perfect Cherry Blossom\1. Ghostly Dream ~ Snow or Cherry Petal (ZUN).mid',
    8: r'8 - Imperishable Night\1. Eternal Night Vignette ~ Eastern Night (ZUN).mid',
    9: r'9 - Phantasmagoria of Flower View\1. Flower Viewing Mound ~ Higan Retour (ZUN).mid',
    10: r'10 - Mountain of Faith\1. Sealed Gods (unknown).mid',
    11: r'11 - Subterranean Animism\1. Awakening of the Earth Spirits (Dekyo Ongen).mid',
    12: r'12 - Undefined Fantastic Object\1. A Shadow In The Blue Sky (terebi).mid',
    13: r'13 - Ten Desires\1. Spirit of Avarice (unknown).mid',
    14: r'14 - Double Dealing Character\1. Mysterious Purification Rod (gondayu).mid',
    15: r'15 - Legacy of Lunatic Kingdom\1. The Space Shrine Maiden Appears (Karl Zuñiga).mid',
    16: r'16 - Hidden Star in Four Seasons\1. The Sky Where Cherry Blossoms Flutter Down (Yaki).mid',
    17: r'17 - Wily Beast and Weakest Creature\2. Lament that only Jizo knows (ryoya1295).mid',
    18: r'18 - Unconnected Marketeers\1. A Rainbow Spanning Gensokyo (Karl Zuñiga).mid',
}
spec = importlib.util.spec_from_file_location('midi2js', MIDI2JS)
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
M.tick_to_sec = lambda segs, division, tick: tick / float(division or 480)
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def main():
    num = int(sys.argv[1]); ch = int(sys.argv[2])
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    nbars = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    midi = M.parse_midi(os.path.join(SRC_BASE, T[num]))
    chans, segs, div = M.extract_channels(midi)
    if ch not in chans:
        print('no channel', ch); return
    notes = M.mono_ize(chans[ch]['notes'])
    print('TH%d ch%d  notes=%d  first=%.2f beats (%d bars)' % (
        num, ch, len(notes), notes[0]['t'] if notes else 0,
        int(notes[0]['t'] // 4) if notes else 0))
    for bar in range(start, start + nbars):
        ns = [n for n in notes if bar * 4 <= n['t'] < (bar + 1) * 4]
        if not ns:
            continue
        toks = []
        for n in ns:
            pos = int(round((n['t'] - bar * 4) / 0.25))
            d = max(1, int(round(n['d'] / 0.25)))
            toks.append('%s@%d/%d' % (nn(n['m']), pos, d))
        print('%02d | %s' % (bar + 1, ' '.join(toks)))


if __name__ == '__main__':
    main()
