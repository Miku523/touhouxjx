#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/ex_septette.py -- EX 中段（雷米莉亚拦路）《亡き王女の為のセプテット》血月圆舞编。

素材：6 - The Embodiment of Scarlet Devil\13. Septette for a Dead Princess (ZUN).mid
照 boss5_murasaki.py 的做法：用 tempo map 把 tick 换算成真实秒数，按原曲顺序 1:1 铺，
不做段落重排 —— 原曲自己就是一套完整的圆舞曲（前奏钢琴 → A → B → A'）。

用法：
    python tools/ex_septette.py --check
    python tools/ex_septette.py
"""
import argparse
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'septette_ex.js')
EXPORT = 'REMILIA_EX'
SPEC = dict(key='ex_mid', title='亡き王女の為のセプテット（血月圆舞编）', bpm=145.0)


def load():
    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    notes = {}
    for ch, c in chans.items():
        ns = [dict(t=n['t'], d=n['d'], m=n['m'], v=n['v']) for n in c['notes']]
        ns.sort(key=lambda n: (n['t'], n['m']))
        notes[ch] = ns
    return notes, segs, div


def top_k(notes, k):
    groups = {}
    for n in notes:
        groups.setdefault(round(n['t'], 3), []).append(n)
    out = []
    for t in sorted(groups):
        g = sorted(groups[t], key=lambda n: n['m'])
        out.extend(g[-k:])
    out.sort(key=lambda n: (n['t'], n['m']))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lead-gain', type=float, default=0.205)
    ap.add_argument('--lead-lo-gain', type=float, default=0.052)
    ap.add_argument('--piano-gain', type=float, default=0.098)
    ap.add_argument('--intro-gain', type=float, default=0.072)
    ap.add_argument('--guitar-gain', type=float, default=0.050)
    ap.add_argument('--strings-gain', type=float, default=0.060)
    ap.add_argument('--organ-gain', type=float, default=0.042)
    ap.add_argument('--counter-gain', type=float, default=0.030)
    ap.add_argument('--bass-gain', type=float, default=0.112)
    ap.add_argument('--sub-gain', type=float, default=0.135)
    ap.add_argument('--gtr-gain', type=float, default=0.036)
    ap.add_argument('--hat-thin', type=float, default=0.17)
    ap.add_argument('--trim', type=float, default=1.0)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    off = min(n['t'] for ns in notes.values() for n in ns)
    end_sec = max(n['t'] + n['d'] for ns in notes.values() for n in ns)
    duration = round(end_sec - off + 0.10, 3)
    print('tempo map %d 段；内容 %.3fs - %.3fs -> 成品 %.3fs' % (len(segs), off, end_sec, duration))

    def mk(chs, transpose=0, only_above=None, only_below=None, vscale=1.0, dscale=1.0):
        out = []
        for ch in chs:
            for n in notes.get(ch, []):
                t = n['t'] - off
                if t < 0:
                    continue
                m = n['m'] + transpose
                if (only_below is not None and m >= only_below) or \
                   (only_above is not None and m <= only_above):
                    continue
                out.append(dict(t=round(t, 3), m=m,
                                d=round(min(n['d'] * dscale, 8.0), 3),
                                v=max(1, min(127, int(round(n['v'] * vscale))))))
        out.sort(key=lambda x: (x['t'], x['m']))
        return out

    lead = M.mono_ize(mk([3]), keep='high')
    lead_lo = M.mono_ize(mk([10]), keep='high')
    piano = top_k(mk([2]), 2)
    intro = mk([8]) + [n for n in piano if n['t'] < 12.5]
    intro.sort(key=lambda n: (n['t'], n['m']))
    guitar = mk([5])
    strings = M.cap_poly(mk([4, 12]), 2)
    organ = M.cap_poly(mk([14]), 2)
    counter = mk([7], only_above=70, vscale=0.62)
    bass = M.mono_ize(mk([1]), keep='low')
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    gtr = M.cap_poly(mk([11]), 2)
    print('lead %d / lo %d / piano %d / intro %d / guitar %d / strings %d / organ %d / counter %d / bass %d / gtr %d'
          % (len(lead), len(lead_lo), len(piano), len(intro), len(guitar), len(strings),
             len(organ), len(counter), len(bass), len(gtr)))

    kind_of = {35: 0, 36: 0, 37: 0, 38: 1, 40: 1, 41: 1, 42: 2, 44: 2, 45: 2,
               46: 3, 48: 3, 49: 4, 51: 3, 57: 4, 59: 4}
    raw = []
    for n in notes.get(9, []):
        k = kind_of.get(n['m'])
        if k is None:
            continue
        raw.append((round(n['t'] - off, 3), k, float(n['v'])))
    raw.sort()
    thin = {0: 0.06, 1: 0.085, 2: args.hat_thin, 3: 1.2, 4: 0.0}
    drums, last = [], {}
    for t, k, v in raw:
        g = thin.get(k, 0.0)
        if g and (t - last.get(k, -1e9)) < g:
            continue
        last[k] = t
        drums.append([t, k, int(max(20, min(127, round(v))))])
    drums.sort(key=lambda x: (x[0], x[1]))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s' % (len(drums), cnt))

    def clip(ns):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - 0.10]

    lead, lead_lo, piano, intro, guitar, strings, organ, counter, bass, sub, gtr = (
        clip(x) for x in (lead, lead_lo, piano, intro, guitar, strings, organ, counter, bass, sub, gtr))
    left = [d for d in drums if d[0] < duration - 0.02]
    maxn = max(n['t'] for n in lead)
    print('主旋律 %d 音，止于 %.2fs / 全长 %.2fs' % (len(lead), maxn, duration))
    for b in range(0, 110, 10):
        t0, t1 = b * 1.2414, (b + 10) * 1.2414
        print('  小节 %3d-%3d  t %6.1f-%6.1f  lead %2d  drums %3d' % (
            b, b + 10, t0, t1, sum(1 for n in lead if t0 <= n['t'] < t1),
            sum(1 for d in left if t0 <= d[0] < t1)))
    if args.check:
        return

    k = args.trim
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=SPEC['bpm'],
                tracks=[dict(wave='square', gain=round(args.lead_gain * k, 3), notes=lead),
                        dict(wave='square', gain=round(args.lead_lo_gain * k, 3), notes=lead_lo),
                        dict(wave='triangle', gain=round(args.piano_gain * k, 3), notes=piano),
                        dict(wave='triangle', gain=round(args.intro_gain * k, 3), notes=intro),
                        dict(wave='triangle', gain=round(args.guitar_gain * k, 3), notes=guitar),
                        dict(wave='triangle', gain=round(args.strings_gain * k, 3), notes=strings),
                        dict(wave='triangle', gain=round(args.organ_gain * k, 3), notes=organ),
                        dict(wave='triangle', gain=round(args.counter_gain * k, 3), notes=counter),
                        dict(wave='sawtooth', gain=round(args.gtr_gain * k, 3), notes=gtr),
                        dict(wave='sawtooth', gain=round(args.bass_gain * k, 3), notes=bass),
                        dict(wave='sine', gain=round(args.sub_gain * k, 3), notes=sub)],
                drums=left)
    data['reasons'] = [
        '照原曲直译：ZUN 扒谱按原谱顺序 1:1 铺，连原曲自己的 tempo map（27 段，145→140→133 附近的摇摆）一起照抄',
        '主旋律 = 原谱 ch3 小号顶线；原谱自带的 −12 加倍（ch10）留着当厚度',
        '伴奏全部取原谱：ch2 钢琴圆舞琶音、ch8 前奏钢琴、ch5 吉他分解、ch4/ch12 弦乐、ch14 管风琴、ch7 高音对句、ch11 失真吉他根音',
        '贝斯 = ch1，另做 −12 的 sine sub 垫底；鼓 = ch9 抽稀（闭镲走八分以下）',
        '三段式：0-12s 钢琴独奏前奏（她站在楼梯口）→ 12s 起圆舞曲全奏 → 后段弦乐/管风琴加厚',
    ]
    head = '''/**
 * EX 中段《亡き王女の為のセプテット》—— 血月圆舞编（照原曲直译版）。
 * 素材 = TH06 ZUN 扒谱 MIDI，按原曲 tempo map 换算真实秒数；
 * 主旋律 100% 原曲小号顶线；tools/ex_septette.py 生成，勿手改。
 */
'''
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()