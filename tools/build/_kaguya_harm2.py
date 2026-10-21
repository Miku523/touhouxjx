# -*- coding: utf-8 -*-
"""从原曲琶音层（ch5/ch12）逐半小节提取真实和弦 -> tools/build/_kaguya_harm2.json

规则：半小节内取琶音最低音当根音（原曲琶音都是根位置起手），三度/五度决定大小。
琶音缺席的小节（前奏 / 连接段 / 尾奏）用相邻小节或段落默认进行补齐。
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_score.json'), encoding='utf-8'))
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
NB = S['bars']


def quality(pcs, root):
    iv = {(p - root) % 12 for p in pcs}
    has3, has4 = 3 in iv, 4 in iv
    has6, has7, has8 = 6 in iv, 7 in iv, 8 in iv
    if has3 and has7:
        return 'm'
    if has4 and has7:
        return ''
    if has3 and has6:
        return 'dim'
    if has4 and has8:
        return 'aug'
    if has3:
        return 'm'
    if has4:
        return ''
    if has7:
        return ''  # 只有根＋五度：按大三处理
    return ''


def half_chord(bar, half):
    ns = [m for ch in (5, 12)
          for b, si, m, ls, v in S['ch'].get(str(ch), [])
          if b == bar and half * 8 <= si < half * 8 + 8]
    if len(ns) < 3:
        return None
    root = min(ns) % 12
    q = quality({m % 12 for m in ns}, root)
    return NAMES[root] + q


def main():
    raw = {}
    for b in range(NB):
        for h in (0, 1):
            c = half_chord(b, h)
            if c:
                raw[(b, h)] = c
    # 补齐：半小节内部互补；整小节都没有琶音的，记 None（交给编曲脚本用段落默认进行）
    table = {}
    for b in range(NB):
        a, c = raw.get((b, 0)), raw.get((b, 1))
        if a and c:
            table['%d-0' % b], table['%d-1' % b] = a, c
        elif a:
            table['%d-0' % b] = table['%d-1' % b] = a
        elif c:
            table['%d-0' % b] = table['%d-1' % b] = c
        else:
            table['%d-0' % b] = table['%d-1' % b] = None

    # 打印分段
    def show(b0, b1, lab):
        print('== %s（小节 %d-%d）' % (lab, b0 + 1, b1))
        for b in range(b0, b1):
            print('  bar%-3d  %-6s | %-6s' % (b + 1, table['%d-0' % b] or '-', table['%d-1' % b] or '-'))

    show(8, 22, 'intro+A')
    show(22, 36, 'B 连接段')
    show(36, 56, 'C 第二主题')
    show(56, 70, 'D 飞升段')
    show(84, min(NB, 92), 'outro')

    json.dump(table, open(os.path.join(ROOT, 'tools', 'build', '_kaguya_harm2.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)
    print('\n写出 tools/build/_kaguya_harm2.json')


if __name__ == '__main__':
    main()
