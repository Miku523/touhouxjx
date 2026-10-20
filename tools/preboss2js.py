#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/preboss2js.py —— 东方「道中 / 前置曲」MIDI -> src/engine/songs/preboss.js

和 tools/midi2js.py（Boss 曲）同一套提取器，区别只在「人工编排」：
每关道中曲都显式指定主旋律分段（lead_plan）——道中曲的旋律常常在
小号 / 圆号 / 钢琴之间轮换，自动打分容易选中只演一段的副旋律，
所以这里按原作编曲逐段点名，再压低鼓组抽稀阈值（道中比 Boss 低一格）。

用法：
    python tools/preboss2js.py            # 生成 src/engine/songs/preboss.js
    python tools/preboss2js.py --check    # 只打印，不写文件
"""

import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'preboss.js')

# 道中曲一律「比 Boss 曲低一格」：鼓每 250ms 桶里留得少、和声压低、
# 不叠 sparkle/sub 这类加花层，只保留方波主旋律 + 三角波贝斯 + 轻和声。
DRUM_LIMITS = {0: 2, 1: 1, 2: 2, 3: 1, 4: 1}

# 再按「最小间隔」二次抽稀：军鼓只留正拍重音（ghost note 丢掉），
# 擦片不低于 16 分音符，底鼓不低于 8 分音符——目标是整体鼓点密度
# 落回现有 Boss 曲的 8~9 击/秒，而不是打击乐独奏的 16 击/秒。
MIN_GAP = {0: 0.16, 1: 0.40, 2: 0.19, 3: 0.45, 4: 0.0}


def polish_drums(drums):
    """按最小间隔二次抽稀，军鼓优先保留力度大的正拍。"""
    out = []
    last = {}
    for (t, kind, vel) in sorted(drums, key=lambda d: (d[0], -d[2])):
        gap = MIN_GAP.get(kind, 0.0)
        prev = last.get(kind)
        if prev is not None and gap > 0 and t - prev < gap:
            # 军鼓：被让位的如果是弱音，直接丢；强音则替换掉前一个弱音
            if kind == 1 and vel >= 100:
                if out and out[-1][1] == 1 and abs(out[-1][0] - prev) < 1e-6 and out[-1][2] < 100:
                    out.pop()
                else:
                    continue
            else:
                continue
        out.append((t, kind, vel))
        last[kind] = t
    out.sort()
    return out

SPECS = [
    # 1 面（红魔馆前庭 / 博丽神社黄昏）：TH06 1 面道中
    # 原作配器：小号 20.2-45s 领奏 → 圆号 45-60s 接 B 段 → 钢琴 60s 之后回到主歌。
    dict(key='pre1',
         title='ほおずきみたいに紅い魂',
         file=r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid',
         bpm_hint=145,
         arrange=dict(lead_plan=[(19.862, 45.0, [5]), (45.0, 60.0, [3]), (60.0, 72.828, [6])],
                      bass_ch=1, harm_chs=[4],
                      window=(19.862, 72.828),      # 12 小节 → 44 小节，正好 32 小节的乐句循环
                      drum_limits=DRUM_LIMITS)),
]

HEADER = """/**
 * 道中 / 前置 BGM —— Boss 登场前播放的那一段。
 *
 * 数据格式见 src/engine/songs/index.js 顶部注释。
 * 由 tools/preboss2js.py 从本地 MIDI 集合（ZUN 原作版）提取，勿手改。
 *
 * 设计口径：道中曲比对应的 Boss 曲「低一格」——
 * - 鼓组抽稀更狠（每 250ms 桶：底鼓/军鼓/闭镲 ≤2、开镲/吊镲 ≤1）；
 * - 不叠 sparkle / sub-bass 等加花层，只有主旋律 + 贝斯 + 轻和声；
 * - 循环片段 55~60s，够玩家跑完一张图，进 Boss 再切 Boss 曲。
 *
 * 每首的编排依据：
%s
 */
"""


def render(data):
    body = M.render_song_js(data, data['reasons'])
    return body


def main():
    check_only = '--check' in sys.argv
    results = []
    for spec in SPECS:
        path = os.path.join(M.SRC_BASE, spec['file'])
        print('\n=== %s %s' % (spec['key'], os.path.basename(spec['file'])))
        if not os.path.exists(path):
            print('  !! 文件不存在: %s' % path)
            continue
        midi = M.parse_midi(path)
        chans, segs, div = M.extract_channels(midi)
        data = M.build_song(spec, chans, segs)
        before = len(data['drums'])
        data['drums'] = polish_drums(data['drums'])
        # 循环点必须落在小节线上，否则每次重放都会切在拍子中间
        bar = 4 * 60.0 / float(data['bpm'])
        bars = int(data['duration'] / bar + 1e-6)
        snapped = round(bars * bar, 3)
        for tr in data['tracks']:
            tr['notes'] = [n for n in tr['notes']
                           if (n['t'] if isinstance(n, dict) else n[0]) < snapped]
        data['drums'] = [d for d in data['drums'] if d[0] < snapped]
        data['duration'] = snapped
        print('  鼓组：%d → %d（%.1f 击/秒）；小节长 %.4fs，循环 %.2fs = %.2f 小节'
              % (before, len(data['drums']), len(data['drums']) / data['duration'],
                 bar, data['duration'], data['duration'] / bar))
        print('\n'.join(data['reasons']))
        print('  -> duration=%ss bpm=%d 大小=%.1fKB' % (data['duration'], data['bpm'], data['size'] / 1024.0))
        for tr in data['tracks']:
            print('     %-8s %-8s gain=%.2f notes=%d' % (tr['_name'], tr['wave'], tr['gain'], len(tr['notes'])))
        print('     drums  %d' % len(data['drums']))
        results.append(data)

    if check_only:
        print('\n--check：未写入文件')
        return

    lines = []
    for d in results:
        lines.append(' *  %s %s（%ss，%d 条轨）' % (d['key'], d['title'], d['duration'], len(d['tracks'])))
        for r in d['reasons']:
            lines.append(' *    - %s' % r.strip())
    head = HEADER % ('\n'.join(lines))
    parts = [render(d) for d in results]
    out = head + 'export const PREBOSS_SONGS = {\n' + ',\n'.join(parts) + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('\n写入 %s：%.1f KB（%d 首）' % (OUT_JS, len(out.encode('utf-8')) / 1024.0, len(results)))


if __name__ == '__main__':
    main()
