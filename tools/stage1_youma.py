#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/stage1_youma.py -- 03 一面首领《妖魔夜行》照原曲版。

主人 m03977：「修改第一面道中和BoSS曲，完全按照原曲改」。
=> 原曲 **1:1 直译**：ZUN 谱 MIDI 的每个声部按真实秒数搬过来，不融合、不改段落、不换旋律。

素材：6 - The Embodiment of Scarlet Devil\3. Apparitions Stalk the Night (ZUN).mid
（原谱 tempo map 3 段 ≈146/144/146 BPM；bar1-34 = 55.77s，开头 2.0s 谱面空拍成品裁掉）

成曲：bar 10-34（跳过 bar 1-9 风琴前奏，m04129「1可以」）= 39.25s
段落：bar 10-17 弦乐+铁琴过门 / bar 18-33 长笛主旋律（成品 11.63s 进入）/ bar 34 收尾

用法：
    python tools/stage1_youma.py --check
    python tools/stage1_youma.py
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
                   '3. Apparitions Stalk the Night (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'youma_stage1.js')
EXPORT = 'YOUMA_STAGE1'
SPEC = dict(key='stage1', title='妖魔夜行', bpm=146.0)


def load():
    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    notes = {}
    for ch, c in chans.items():
        ns = [dict(t=n['t'], d=n['d'], m=n['m'], v=n['v']) for n in c['notes']]
        ns.sort(key=lambda n: (n['t'], n['m']))
        notes[ch] = ns
    return notes, segs, div


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lead-gain', type=float, default=0.190)
    ap.add_argument('--octave-gain', type=float, default=0.045)
    ap.add_argument('--counter-gain', type=float, default=0.062)
    ap.add_argument('--vibes-gain', type=float, default=0.055)
    ap.add_argument('--strings-gain', type=float, default=0.042)
    ap.add_argument('--organ-gain', type=float, default=0.036)
    ap.add_argument('--guitar-gain', type=float, default=0.045)
    ap.add_argument('--bass-gain', type=float, default=0.098)
    ap.add_argument('--sub-gain', type=float, default=0.105)
    ap.add_argument('--hat-thin', type=float, default=0.130)
    ap.add_argument('--kick-thin', type=float, default=0.075)
    ap.add_argument('--trim', type=float, default=1.35)
    ap.add_argument('--skip-bars', type=int, default=9)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    bpm = M.bpm_of(segs)
    first = min(n['t'] for c in notes.values() for n in c)
    end_sec = max(n['t'] + n['d'] for c in notes.values() for n in c)
    # 主人 m04129「1可以」= 首领前奏砍到 8 小节：跳过 bar1-9 的风琴前奏，从 bar10 起算
    # （bar10-17 仍是原曲自己的弦乐+铁琴过门，8 小节 = 13.2s，然后长笛主旋律进场）
    sec_of_bar = lambda b: M.tick_to_sec(segs, div, int(round(b * 4.0 * div)))
    off = round(sec_of_bar(args.skip_bars + 1), 3)
    duration = round(end_sec - off + 0.12, 3)
    print('原谱 %.2fs 起音，%.3fs 收尾；跳过 bar1-%d（%.2fs）-> 成品 %.3fs（tempo map %d 段）'
          % (first, end_sec, args.skip_bars, off, duration, len(segs)))
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(notes.items())})

    def mk(ch, transpose=0, vscale=1.0, dscale=1.0):
        out = []
        for n in notes.get(ch, []):
            t = n['t'] - off
            if t < 0:
                continue
            out.append(dict(t=round(t, 3), m=max(12, min(120, n['m'] + transpose)),
                            d=round(min(n['d'] * dscale, 8.0), 3),
                            v=max(1, min(127, int(round(n['v'] * vscale))))))
        out.sort(key=lambda x: (x['t'], x['m']))
        return out

    lead = M.mono_ize(mk(2), keep='high')                       # 长笛 = 主旋律
    octave = [dict(n, v=int(n['v'] * 0.72)) for n in M.mono_ize(mk(14), keep='high')]
    counter = M.cap_poly(mk(3), 2)                              # 钢琴对句
    vibes = mk(6)                                               # 铁琴过门
    strings = M.cap_poly(mk(5), 2)                              # 弦乐长音
    organ = M.cap_poly(mk(8), 2)                                # 风琴前奏
    guitar = M.mono_ize(mk(10), keep='low')                     # 电吉他低音切分
    bass = M.mono_ize(mk(1), keep='low')                        # 电贝斯
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    print('lead %d / octave %d / counter %d / vibes %d / strings %d / organ %d / guitar %d / bass %d'
          % (len(lead), len(octave), len(counter), len(vibes), len(strings), len(organ),
             len(guitar), len(bass)))

    # 62/63 是 16 分闭镲（与原谱 42 交替），并进 kind 2；41/45/48 落地嗵无处可去直接丢
    kind_of = {36: 0, 38: 1, 40: 1, 42: 2, 62: 2, 63: 2, 44: 2, 46: 3, 49: 4}
    raw = []
    for n in notes[9]:
        k = kind_of.get(n['m'])
        if k is None:
            continue
        t = round(n['t'] - off, 3)
        if t < 0:
            continue
        raw.append((t, k, float(n['v'])))
    raw.sort()
    thin = {0: args.kick_thin, 1: 0.075, 2: args.hat_thin, 3: 0.28, 4: 0.0}
    drums, last = [], {}
    for t, k, v in raw:
        g = thin.get(k, 0.0)
        # 重音（v>=100）不参与抽稀：原谱的重音落在正拍上，抽掉就把律动抽没了
        if g and v < 100 and (t - last.get(k, -1e9)) < g:
            continue
        last[k] = t
        drums.append([t, k, int(max(20, min(127, round(v))))])
    drums.append([0.0, 4, 84])
    drums.sort(key=lambda x: (x[0], x[1]))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s（%.1f 击/秒）' % (len(drums), cnt, len(drums) / duration))

    def clip(ns):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - 0.10]

    lead, octave, counter, vibes, strings, organ, guitar, bass, sub = (
        clip(x) for x in (lead, octave, counter, vibes, strings, organ, guitar, bass, sub))
    left = [d for d in drums if d[0] < duration - 0.02]

    for t in (5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0):
        t2 = min(t + 5.0, duration)
        print('  %.0f-%.0fs  lead %2d  counter %2d  guitar %2d  drums %3d' % (
            t, t2,
            sum(1 for n in lead if t <= n['t'] < t2),
            sum(1 for n in counter if t <= n['t'] < t2),
            sum(1 for n in guitar if t <= n['t'] < t2),
            sum(1 for d in left if t <= d[0] < t2)))
    if args.check:
        return

    k = args.trim
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=int(round(bpm)),
                tracks=[dict(wave='square', gain=round(args.lead_gain * k, 3), notes=lead),
                        dict(wave='triangle', gain=round(args.octave_gain * k, 3), notes=octave),
                        dict(wave='triangle', gain=round(args.counter_gain * k, 3), notes=counter),
                        dict(wave='triangle', gain=round(args.vibes_gain * k, 3), notes=vibes),
                        dict(wave='triangle', gain=round(args.strings_gain * k, 3), notes=strings),
                        dict(wave='square', gain=round(args.organ_gain * k, 3), notes=organ),
                        dict(wave='square', gain=round(args.guitar_gain * k, 3), notes=guitar),
                        dict(wave='sawtooth', gain=round(args.bass_gain * k, 3), notes=bass),
                        dict(wave='sine', gain=round(args.sub_gain * k, 3), notes=sub)],
                drums=left)
    data['reasons'] = [
        '照原曲直译：ZUN 谱 MIDI 原始顺序 1:1 搬谱（bar10-34 / 39.25s），不融合、不改段落、不换旋律',
        '前奏按 m04129「1可以」砍到 8 小节：跳过 bar1-9 原曲风琴前奏，从 bar10 起算，剩 bar10-17 弦乐+铁琴过门',
        '主旋律 = 原谱长笛 ch2（成品 11.63s 进入）；八度加倍 = 原谱 ch14（原谱自带的 -12 叠音）',
        '对句 = 原谱钢琴 ch3；过门铁琴 ch6、弦乐 ch5、风琴 ch8、电吉他切分 ch10、电贝斯 ch1 全部照原谱',
        '鼓 = 原谱 ch9 真鼓抽稀（62/63 是闭镲，与 42 交替；落地嗵 41/45/48 无处可去丢掉）；开头 2.0s 空拍已裁掉',
    ]
    head = """/**
 * 一面首领《妖魔夜行》—— 照原曲直译版。
 * 素材 = ZUN 原曲 TH06 扒谱 MIDI，按原文真实 tempo map 换算秒数 1:1 搬谱；
 * 主旋律、对句、贝斯、鼓全部是原谱音符；tools/stage1_youma.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
