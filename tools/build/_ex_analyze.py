#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EX 两首原曲（TH06 ZUN MIDI）结构分析：速度 / 拍号 / 调性 / 声部角色 / 段落。

用法：
    python tools/build/_ex_analyze.py            # 打印报告
    python tools/build/_ex_analyze.py --json     # 额外写 tools/build/_ex_analyze.json
"""
import argparse
import json
import os
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import midi2js as M

BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
FILES = {
    'septette': '13. Septette for a Dead Princess (ZUN).mid',
    'un': '15. U.N. Owen was her (ZUN).mid',
}

NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
GM = {0: 'piano', 19: 'organ', 20: 'organ2', 16: 'organ', 6: 'harpsi', 7: 'clav',
      48: 'strings', 40: 'violin', 42: 'cello', 56: 'trumpet', 57: 'trombone',
      60: 'frenchhorn', 61: 'brass', 33: 'bass', 34: 'bass', 35: 'bass',
      73: 'flute', 68: 'oboe', 71: 'clarinet', 47: 'timpani', 14: 'tubular',
      11: 'vibes', 8: 'celesta', 9: 'glockenspiel', 46: 'harp', 52: 'choir',
      4: 'epiano', 5: 'epiano', 1: 'piano', 2: 'piano'}


def pc_name(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def load_ticks(path):
    """返回 (division, segs, chans)；chans[ch] = [(tick_on, tick_off, pitch, vel, prog)]"""
    midi = M.parse_midi(path)
    div = midi['division'] or 480
    segs = M.build_tempo_map(midi['tracks'], div)
    raw = defaultdict(list)
    prog = {}
    pending = defaultdict(list)
    max_tick = 0
    for tr in midi['tracks']:
        for ev in tr['events']:
            if ev[1] == 'prog':
                prog[ev[2]] = ev[3]
            elif ev[1] == 'on':
                pending[(ev[2], ev[3])].append((ev[0], ev[4], prog.get(ev[2], 0)))
                max_tick = max(max_tick, ev[0])
            elif ev[1] == 'off':
                st = pending.get((ev[2], ev[3]))
                if st:
                    on, vel, p = st.pop(0)
                    raw[ev[2]].append((on, max(ev[0], on + 1), ev[3], vel, p))
                    max_tick = max(max_tick, ev[0])
    for (ch, pitch), st in pending.items():
        for on, vel, p in st:
            raw[ch].append((on, max(on + 1, max_tick), pitch, vel, p))
    return div, segs, raw, midi


def report(name, path, quarter_per_bar=4):
    div, segs, raw, midi = load_ticks(path)
    print('=' * 78)
    print('## %s  %s' % (name, os.path.basename(path)))
    bpm0 = 60e6 / segs[0][2]
    print('division=%d  tempo segs=%d  初始 BPM=%.2f  tempo 变更=%s'
          % (div, len(segs), bpm0,
             '' if len(segs) == 1 else [(round(s[1], 2), round(60e6 / s[2], 2)) for s in segs[:8]]))
    end_tick = max(n[1] for ns in raw.values() for n in ns)
    end_sec = M.tick_to_sec(segs, div, end_tick)
    print('末 tick=%d / %.2fs  小节数(4/4)=%.2f' % (end_tick, end_sec, end_tick / div / quarter_per_bar))

    # 每通道统计
    print('\n-- 通道 --')
    chans = {}
    for ch in sorted(raw):
        ns = raw[ch]
        if not ns:
            continue
        pitches = sorted(n[2] for n in ns)
        progs = Counter(n[4] for n in ns)
        prog = progs.most_common(1)[0][0]
        durs = [M.tick_to_sec(segs, div, n[1]) - M.tick_to_sec(segs, div, n[0]) for n in ns]
        poly = 0
        for i, n in enumerate(ns):
            for j in range(max(0, i - 6), i):
                if ns[j][0] < n[0] < ns[j][1]:
                    poly += 1
                    break
        # 该通道最常出现的音（用来猜根音/角色）
        pcs = Counter(n[2] % 12 for n in ns)
        chans[ch] = dict(count=len(ns), prog=prog,
                         lo=pc_name(pitches[0]), hi=pc_name(pitches[-1]),
                         med=pc_name(pitches[len(pitches) // 2]),
                         avg_dur=round(sum(durs) / len(durs), 2),
                         poly=round(poly / len(ns), 2),
                         top_pc=[NAMES[p] for p, _ in pcs.most_common(3)],
                         first=round(M.tick_to_sec(segs, div, ns[0][0]), 2))
        print('ch%-2d prog%-3d %-10s notes=%-4d 音域 %-4s..%-4s 中位 %-4s '
              'avgDur=%.2f poly=%.2f 首现 %.2fs 常用音 %s'
              % (ch, prog, GM.get(prog, '?'), chans[ch]['count'], chans[ch]['lo'],
                 chans[ch]['hi'], chans[ch]['med'], chans[ch]['avg_dur'],
                 chans[ch]['poly'], chans[ch]['first'],
                 ','.join(chans[ch]['top_pc'])))

    # 逐小节：主旋律（最高音通道）+ 低音根音 + 活跃通道
    bar = div * quarter_per_bar
    nbar = int(end_tick // bar) + 1
    print('\n-- 逐小节（%d 小节；M=顶线最高音，B=最低音，[]=活跃通道）--' % nbar)
    rows = []
    for b in range(nbar):
        t0 = b * bar
        t1 = t0 + bar
        mel = []
        low = []
        act = set()
        cnt = 0
        for ch, ns in raw.items():
            hit = False
            for n in ns:
                if n[0] < t1 and n[1] > t0:
                    hit = True
                    cnt += 1
                    if ch != 9 and n[0] < t1:
                        mel.append(n)
                        low.append(n)
            if hit:
                act.add(ch)
        mel.sort(key=lambda n: (n[0], n[2]))
        top = [pc_name(n[2]) for n in mel[-6:]] if mel else []
        bass = [pc_name(n[2]) for n in sorted(low, key=lambda n: n[2])[:2]] if low else []
        rows.append(dict(bar=b, time=round(M.tick_to_sec(segs, div, t0), 2),
                         top=top, bass=bass, act=sorted(act), cnt=cnt))
        print('%3d %6.2fs M=%-34s B=%-12s [%s] n=%d'
              % (b, rows[-1]['time'], ' '.join(top), ' '.join(bass),
                 ','.join(str(c) for c in sorted(act)), cnt))
    return dict(bpm=round(bpm0, 2), division=div, end_tick=end_tick,
                end_sec=round(end_sec, 2), chans=chans, rows=rows,
                segs=[[s[0], round(s[1], 3), s[2]] for s in segs])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    out = {}
    for key, fn in FILES.items():
        if args.only and args.only not in key:
            continue
        out[key] = report(key, os.path.join(BASE, fn))
    if args.json:
        p = os.path.join(ROOT, 'tools', 'build', '_ex_analyze.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print('\n写入 %s' % p)


if __name__ == '__main__':
    main()
