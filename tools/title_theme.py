#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/title_theme.py —— 各作标题曲主旋律/低音提取 + 调性估计（临时分析工具）。

用法:
    python tools/title_theme.py            # 打印摘要并写 tools/build/themes.json
    python tools/title_theme.py 6 8 18     # 只处理指定作

输出 themes.json:
    {"6": {"title":..., "bpm":..., "bars":..., "key":{"tonic":9,"mode":"minor","corr":..},
           "notes":[[beat,midi,dur_beats,vel],...], "bass":[[beat,midi,dur_beats],...]}}

beat = 四分音符数（0 起）；bar = beat/4；16 分格 = 0.25 beat。
"""
import os
import sys
import json
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIDI2JS = os.path.join(ROOT, 'tools', 'midi2js.py')
SRC_BASE = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
            r'\touhou-midi-collection-main\1 - Shooter Games')
OUT = os.path.join(ROOT, 'tools', 'build', 'themes.json')

spec = importlib.util.spec_from_file_location('midi2js', MIDI2JS)
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

# 关键：让 extract_channels 直接用「拍」而不是秒（tick/division），
# 这样完全绕开 MIDI 内嵌 tempo map 的错误/变化，所有曲子都落在统一的拍网格上。
M.tick_to_sec = lambda segs, division, tick: tick / float(division or 480)

TITLES = {
    6: (r'6 - The Embodiment of Scarlet Devil\1. A Dream that is more Scarlet than Red (ZUN).mid',
        'A Dream that is more Scarlet than Red', 2, 1),
    7: (r'7 - Perfect Cherry Blossom\1. Ghostly Dream ~ Snow or Cherry Petal (ZUN).mid',
        'Ghostly Dream ~ Snow or Cherry Petal', 13, 2),
    8: (r'8 - Imperishable Night\1. Eternal Night Vignette ~ Eastern Night (ZUN).mid',
        'Eternal Night Vignette ~ Eastern Night', 10, 12),
    9: (r'9 - Phantasmagoria of Flower View\1. Flower Viewing Mound ~ Higan Retour (ZUN).mid',
        'Flower Viewing Mound ~ Higan Retour', 0, 1),
    10: (r'10 - Mountain of Faith\1. Sealed Gods (unknown).mid',
         'Sealed Gods', 3, 11),
    11: (r'11 - Subterranean Animism\1. Awakening of the Earth Spirits (Dekyo Ongen).mid',
         'Awakening of the Earth Spirits', 0, 6),
    12: (r'12 - Undefined Fantastic Object\1. A Shadow In The Blue Sky (terebi).mid',
         'A Shadow in the Blue Sky', 2, 11),
    13: (r'13 - Ten Desires\1. Spirit of Avarice (unknown).mid',
         'Spirit of Avarice', 3, 1),
    14: (r'14 - Double Dealing Character\1. Mysterious Purification Rod (gondayu).mid',
         'Mysterious Purification Rod', 6, 8),
    15: (r'15 - Legacy of Lunatic Kingdom\1. The Space Shrine Maiden Appears (Karl Zuñiga).mid',
         'The Space Shrine Maiden Appears', 0, 11),
    16: (r'16 - Hidden Star in Four Seasons\1. The Sky Where Cherry Blossoms Flutter Down (Yaki).mid',
         'The Sky Where Cherry Blossoms Flutter Down', 1, 8),
    17: (r'17 - Wily Beast and Weakest Creature\2. Lament that only Jizo knows (ryoya1295).mid',
         'Lament that only Jizo knows (TH17 stage 1; 标题曲 MIDI 缺失)', 1, 1),
    18: (r'18 - Unconnected Marketeers\1. A Rainbow Spanning Gensokyo (Karl Zuñiga).mid',
         'A Rainbow Spanning Gensokyo', 1, 4),
}

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def corr(a, b):
    n = len(a)
    ma = sum(a) / n
    mb = sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def estimate_key(notes):
    hist = [0.0] * 12
    for n in notes:
        hist[n[1] % 12] += n[2]
    best = None
    for tonic in range(12):
        for mode, prof in (('major', MAJOR), ('minor', MINOR)):
            rotated = [prof[(pc - tonic) % 12] for pc in range(12)]
            c = corr(hist, rotated)
            if best is None or c > best[2]:
                best = (tonic, mode, c)
    return best


def quant(v, step=0.25):
    return round(v / step) * step


def analyze(num):
    rel, title, lead_ch, bass_ch = TITLES[num]
    path = os.path.join(SRC_BASE, rel)
    if not os.path.exists(path):
        print('MISSING', path)
        return None
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    bpm = 60.0 / (segs[0][2] / 1e6) if segs else 120.0
    dur_beats = max((n['t'] + n['d'] for c in chans.values() for n in c['notes']), default=0.0)

    lead = M.mono_ize(chans[lead_ch]['notes']) if lead_ch in chans else []
    bass = chans[bass_ch]['notes'] if bass_ch in chans else []

    notes = []
    for n in lead:
        b = quant(n['t'])
        d = max(0.25, quant(n['d']))
        notes.append([round(b, 3), n['m'], round(d, 3), n.get('v', 80)])
    notes.sort()
    bnotes = []
    for n in bass:
        b = quant(n['t'])
        d = max(0.25, quant(n['d']))
        bnotes.append([round(b, 3), n['m'], round(d, 3)])
    bnotes.sort()

    # 低音每小节的主音（取该小节内最低音）
    bass_bar = {}
    for b, m, d in bnotes:
        bar = int(b // 4)
        bass_bar.setdefault(bar, []).append((m, d))
    roots = []
    for bar in sorted(bass_bar):
        low = min(m for m, d in bass_bar[bar])
        roots.append((bar, low))

    key = estimate_key([n for n in notes if n[2] > 0])
    return dict(title=title, bpm=round(bpm, 2), bars=int(dur_beats / 4 + 0.999),
                key=dict(tonic=key[0], mode=key[1], corr=round(key[2], 3)),
                notes=notes, bass=bnotes, roots=roots)


def main():
    args = [int(a) for a in sys.argv[1:] if a.isdigit()]
    nums = args or sorted(TITLES)
    out = {}
    for num in nums:
        r = analyze(num)
        if r is None:
            continue
        out[str(num)] = r
        k = r['key']
        print('TH%02d %-52s bpm=%-5.1f bars=%-4d key=%s %s (r=%.2f)' % (
            num, r['title'][:52], r['bpm'], r['bars'],
            NAMES[k['tonic']], k['mode'], k['corr']))
        # 每小节低音主音
        roots = ', '.join('%d:%s' % (bar + 1, nn(m)) for bar, m in r['roots'][:16])
        print('   bass: ' + roots)
        # 前 8 小节旋律
        for bar in range(8):
            ns = [n for n in r['notes'] if bar * 4 <= n[0] < (bar + 1) * 4]
            if not ns:
                continue
            toks = ' '.join('%s@%g/%g' % (nn(n[1]), (n[0] - bar * 4) * 4, n[2] * 4) for n in ns)
            print('   %02d | %s' % (bar + 1, toks))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\nwrote', OUT)


if __name__ == '__main__':
    main()
