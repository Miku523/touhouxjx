# -*- coding: utf-8 -*-
"""核对「旋律 vs 和声」的贴合度：每个小节主旋律音落在和弦音/半音冲突的比例。"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import kaguya_stage6 as K  # noqa: E402

BAR = K.BAR
SECT = [('A', 8, K.PROG_A), ('B', 22, K.PROG_B), ('C', 36, K.PROG_C),
        ('D', 56, K.PROG_D), ('E', 70, K.PROG_E)]


def main():
    for name, b0, prog in SECT:
        print('== %s 段' % name)
        tot = on = semi = 0
        for i, c in enumerate(prog):
            b = b0 + i
            pair = c if isinstance(c, (tuple, list)) else (c, c)
            tones = set()
            for cc in pair:
                root, tpl = K.CHORDS[cc]
                tones |= {(root + x) % 12 for x in tpl}
            notes = [m for (t, m, d, v) in K.S.tracks['lead']['notes'] if int(t / BAR) == b]
            if not notes:
                continue
            o = sum(1 for m in notes if m % 12 in tones)
            s = sum(1 for m in notes if any((m % 12 - x) % 12 in (1, 11) for x in tones))
            tot += len(notes)
            on += o
            semi += s
            flag = ''
            if s / max(1, len(notes)) > 0.34:
                flag = '  <-- 半音冲突多'
            print('  bar%-3d %-7s 旋律 %2d 音：和弦音 %2d (%3.0f%%) 半音 %2d%s'
                  % (b, '+'.join(pair), len(notes), o, 100.0 * o / len(notes), s, flag))
        print('  合计：和弦音 %.0f%%  半音冲突 %.0f%%\n' % (100.0 * on / max(1, tot), 100.0 * semi / max(1, tot)))


if __name__ == '__main__':
    main()
