#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/boss5_murasaki.py -- 11 五面首领《幽雅に咲かせ、墨染の桜 ～ Border of Life》墨染编（照原曲版 v15）。

主人 m02633：「不行，st5首领曲子再照着原作曲子优化」。
=> 原曲 **1:1 直译**，而且**跟着原曲自己的 tempo map 走**（原曲 20 段速度，144 起步、中后段到 155），
   不再压成固定 144 BPM 网格 —— 上一版包络和原曲录音差了 10 dB 就是这里来的。

素材：7 - Perfect Cherry Blossom\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid
用 tools/midi2js.py 的 tempo map 把 tick 换算成秒，所有音符按原曲真实时间铺。

用法：
    python tools/boss5_murasaki.py --check
    python tools/boss5_murasaki.py
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
                   '7 - Perfect Cherry Blossom',
                   '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'yuuga_stage5.js')
EXPORT = 'YUGA_STAGE5'
SPEC = dict(key='stage5', title='幽雅に咲かせ、墨染の桜 ～ Border of Life（墨染编）', bpm=144.0)


def load():
    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    notes = {}
    for ch, c in chans.items():
        ns = []
        for n in c['notes']:
            ns.append(dict(t=n['t'], d=n['d'], m=n['m'], v=n['v']))
        ns.sort(key=lambda n: (n['t'], n['m']))
        notes[ch] = ns
    return notes, segs, div


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lead-gain', type=float, default=0.20)
    ap.add_argument('--octave-gain', type=float, default=0.045)
    ap.add_argument('--descant-gain', type=float, default=0.030)
    ap.add_argument('--piano-gain', type=float, default=0.098)
    ap.add_argument('--epiano-gain', type=float, default=0.068)
    ap.add_argument('--piano16-gain', type=float, default=0.054)
    ap.add_argument('--trumpet-gain', type=float, default=0.060)
    ap.add_argument('--strings-gain', type=float, default=0.064)
    ap.add_argument('--bass-gain', type=float, default=0.104)
    ap.add_argument('--sub-gain', type=float, default=0.125)
    ap.add_argument('--pad-gain', type=float, default=0.070)
    ap.add_argument('--hat-thin', type=float, default=0.150)
    ap.add_argument('--trim', type=float, default=1.18)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    q = 4.0 * div
    sec_of_bar = lambda b: M.tick_to_sec(segs, div, int(round(b * q)))
    off = sec_of_bar(1.0)
    end_sec = M.tick_to_sec(segs, div, int(round(90.5 * q)))
    duration = round(end_sec - off + 0.35, 3)
    print('原曲 tempo map：%d 段；内容 %.3fs 起，%.3fs 止 -> 成品 %.3fs'
          % (len(segs), off, end_sec, duration))
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(notes.items())})

    def mk(ch, kinds=None, transpose=0, only_below=None, only_above=None,
           vscale=1.0, dscale=1.0):
        out = []
        for n in notes.get(ch, []):
            t = n['t'] - off
            if t < 0:
                continue
            m = n['m'] + transpose
            if only_below is not None or only_above is not None:
                if (only_below is not None and m >= only_below) or \
                   (only_above is not None and m <= only_above):
                    continue
            t = round(t, 3)
            b = M.tick_to_sec(segs, div, 0)  # unused
            out.append(dict(t=t, m=m, d=round(min(n['d'] * dscale, 8.0), 3),
                            v=max(1, min(127, int(round(n['v'] * vscale))))))
        out.sort(key=lambda x: (x['t'], x['m']))
        return out

    lead = M.mono_ize(mk(2), keep='high')
    octave = [dict(n, v=int(n['v'] * 0.72)) for n in M.mono_ize(mk(12), keep='high')]
    descant = mk(7, only_above=84, vscale=0.5, dscale=0.9)
    print('主旋律 %d 音（%.2fs-%.2fs）/ 八度 %d / 对句 %d'
          % (len(lead), lead[0]['t'], max(n['t'] for n in lead), len(octave), len(descant)))

    piano = top_k(mk(0, only_above=50, only_below=101), 2)
    epiano = M.mono_ize(mk(3), keep='high')
    piano16 = mk(5)
    trumpet = M.cap_poly(mk(6), 2)
    strings = M.cap_poly(mk(10), 2)
    bass_raw = M.mono_ize(mk(4), keep='low')
    lh = M.mono_ize(mk(1, only_below=60), keep='low')
    lh = [n for n in lh if n['t'] < sec_of_bar(8.5) - off or n['t'] > sec_of_bar(73.0) - off]
    lh = [dict(n, v=int(n['v'] * 0.85)) for n in lh]
    bass = sorted(lh + bass_raw, key=lambda n: (n['t'], n['m']))
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    print('伴奏：piano %d / epiano %d / piano16 %d / trumpet %d / strings %d / bass %d / sub %d'
          % (len(piano), len(epiano), len(piano16), len(trumpet), len(strings), len(bass), len(sub)))

    kind_of = {36: 0, 38: 1, 40: 1, 42: 2, 44: 2, 46: 3, 49: 4, 51: 3}
    raw = []
    for n in notes[9]:
        k = kind_of.get(n['m'])
        if k is None:
            continue
        raw.append((round(n['t'] - off, 3), k, float(n['v'])))
    raw.sort()
    thin = {0: 0.055, 1: 0.075, 2: args.hat_thin, 3: 0.0, 4: 0.0}
    drums, last = [], {}
    for t, k, v in raw:
        g = thin.get(k, 0.0)
        if g and (t - last.get(k, -1e9)) < g:
            continue
        last[k] = t
        drums.append([t, k, int(max(20, min(127, round(v))))])

    # 原曲 bar 74.5-80 整段鼓撤掉（10 秒大喘气）：补心跳底鼓 + 极轻八分镲 + 进再现前的军鼓爬升
    brk0, brk1 = sec_of_bar(74.5) - off, sec_of_bar(80.0) - off
    pad = []
    t = brk0
    while t < brk1 - 1e-6:
        drums.append([round(t, 3), 0, 74])
        for j in (1, 2, 3):
            drums.append([round(t + j * 0.25, 3), 2, 26 if j != 2 else 34])
        t += 0.5
    for i in range(16):
        tt = round(brk1 - 0.834 + i * 0.2085, 3)
        drums.append([tt, 1, int(46 + i * 4.4)])
        pad.append(dict(t=tt, m=min(96, 57 + i), d=0.20, v=min(110, int(76 + i * 2.6))))
    drums.sort(key=lambda x: (x[0], x[1]))
    drums.append([0.0, 4, 84])
    drums.sort(key=lambda x: (x[0], x[1]))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s' % (len(drums), cnt))

    intro_end = sec_of_bar(8) - off
    piano = [dict(n, v=min(127, int(n['v'] * 1.10))) if n['t'] < intro_end else n for n in piano]
    strings = [dict(n, v=min(127, int(n['v'] * 1.12))) if n['t'] < intro_end else n for n in strings]

    def clip(ns):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - 0.10]

    lead, octave, descant, piano, epiano, piano16, trumpet, strings, bass, sub, pad = (
        clip(x) for x in (lead, octave, descant, piano, epiano, piano16, trumpet, strings,
                          bass, sub, pad))
    left = [d for d in drums if d[0] < duration - 0.02]
    maxn = max(n['t'] for n in lead)
    print('主旋律止于 %.2fs / 全长 %.2fs' % (maxn, duration))
    for b in range(0, 91, 4):
        t0, t1 = sec_of_bar(b) - off, sec_of_bar(b + 4) - off
        print('  bar %2d-%2d  t %6.1f-%6.1f  lead %2d  drums %3d' % (
            b, b + 4, t0, t1, sum(1 for n in lead if t0 <= n['t'] < t1),
            sum(1 for d in left if t0 <= d[0] < t1)))
    if args.check:
        return

    k = args.trim
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=144,
                tracks=[dict(wave='square', gain=round(args.lead_gain * k, 3), notes=lead),
                        dict(wave='square', gain=round(args.octave_gain * k, 3), notes=octave),
                        dict(wave='triangle', gain=round(args.descant_gain * k, 3), notes=descant),
                        dict(wave='triangle', gain=round(args.piano_gain * k, 3), notes=piano),
                        dict(wave='triangle', gain=round(args.epiano_gain * k, 3), notes=epiano),
                        dict(wave='square', gain=round(args.piano16_gain * k, 3), notes=piano16),
                        dict(wave='square', gain=round(args.trumpet_gain * k, 3), notes=trumpet),
                        dict(wave='triangle', gain=round(args.strings_gain * k, 3), notes=strings),
                        dict(wave='sawtooth', gain=round(args.bass_gain * k, 3), notes=bass),
                        dict(wave='sine', gain=round(args.sub_gain * k, 3), notes=sub),
                        dict(wave='triangle', gain=round(args.pad_gain * k, 3), notes=pad)],
                drums=left)
    data['reasons'] = [
        '照原曲直译：按 ZUN 原谱 bar 1-90.5 的原始顺序 1:1 搬过来，连原曲自己的 tempo map（20 段速度，144→155）一起照抄，不做段落重排',
        '主旋律 = 原曲 square 主音 ch2，八度加倍 = 原曲 ch12（原谱本来就有的 +12 叠音）',
        '伴奏全部取原谱：ch0 钢琴八度柱 + ch3 电钢流动线 + ch5 钢琴十六分 + ch6 小号六度 + ch10 弦乐 + ch4 击弦贝斯 + ch1 钢琴左手',
        '鼓 = 原曲 ch9 真鼓抽稀（闭镲走八分）；原曲 bar 74.5-80 的「大喘气」补了心跳底鼓与极轻八分镲，免得 10 秒像卡带',
        '蓝图分工：refA 原曲 = 旋律与全部织体；refB 四重奏 = 弦乐长音；refC 重军鼓；refD 强前后拍',
    ]
    head = """/**
 * 五面首领《幽雅に咲かせ、墨染の桜 ～ Border of Life》—— 墨染编（照原曲直译版）。
 * 素材 = ZUN 原曲 TH07 扒谱 MIDI，按原曲 tempo map 换算真实秒数（不压成固定 BPM 网格）；
 * 主旋律 100% 原曲 square 主音，伴奏全部照原谱编制；tools/boss5_murasaki.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


def top_k(notes, k):
    groups = {}
    for n in notes:
        groups.setdefault(n['t'], []).append(n)
    out = []
    for t in sorted(groups):
        g = sorted(groups[t], key=lambda n: n['m'])
        out.extend(g[-k:])
    out.sort(key=lambda n: (n['t'], n['m']))
    return out


if __name__ == '__main__':
    main()
