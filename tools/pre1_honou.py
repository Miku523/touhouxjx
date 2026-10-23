#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/pre1_honou.py -- 02 一面道中《ほおずきみたいに紅い魂》照原曲版。

主人 m03977：「修改第一面道中和BoSS曲，完全按照原曲改」。
=> 原曲 **1:1 直译**：ZUN 谱 MIDI 的每一个声部按真实秒数搬过来，不重写旋律、不改段落顺序。

素材：6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid
（145 BPM 单段 tempo map；原谱 bar1-53 = 86.86s，开头有 2.4s 谱面空拍，成品从第一个音起算）

用法：
    python tools/pre1_honou.py --check
    python tools/pre1_honou.py
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
                   '2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'honou_pre1.js')
EXPORT = 'HONOU_PRE1'
SPEC = dict(key='pre1', title='ほおずきみたいに紅い魂', bpm=145.0)

# 原谱段落（小节号，1 基）
BAR_A = 13      # 小号主旋律进入
BAR_B = 29      # 圆号接过主旋律
BAR_C = 37      # 钢琴接过主旋律
BAR_BRIDGE = 45  # 钢琴间奏（无主旋律）
BAR_CODA = 49   # 尾奏钢琴


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
    ap.add_argument('--lead-gain', type=float, default=0.185)
    ap.add_argument('--horn-pad-gain', type=float, default=0.045)
    ap.add_argument('--horn-lead-gain', type=float, default=0.125)
    ap.add_argument('--piano-lead-gain', type=float, default=0.110)
    ap.add_argument('--piano-acc-gain', type=float, default=0.044)
    ap.add_argument('--epiano-gain', type=float, default=0.045)
    ap.add_argument('--guitar-gain', type=float, default=0.034)
    ap.add_argument('--violin-gain', type=float, default=0.030)
    ap.add_argument('--bass-gain', type=float, default=0.098)
    ap.add_argument('--sub-gain', type=float, default=0.105)
    ap.add_argument('--hat-thin', type=float, default=0.150)
    ap.add_argument('--trim', type=float, default=1.45)
    ap.add_argument('--drums', choices=('steady', 'orig'), default='steady')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    bpm = M.bpm_of(segs)
    sec_of_bar = lambda b: b * 4.0 * 60.0 / bpm
    first = min(n['t'] for c in notes.values() for n in c)
    off = round(first, 3)
    end_sec = max(n['t'] + n['d'] for c in notes.values() for n in c)
    duration = round(end_sec - off + 0.12, 3)
    print('原谱 %.2fs 起音，%.3fs 收尾 -> 成品 %.3fs（%.2f 小节）'
          % (first, end_sec, duration, duration / sec_of_bar(1)))
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(notes.items())})

    def mk(ch, transpose=0, only_below=None, only_above=None, vscale=1.0, dscale=1.0,
           t0=None, t1=None):
        out = []
        for n in notes.get(ch, []):
            t = n['t'] - off
            if t < 0:
                continue
            if t0 is not None and t < t0 - 1e-6:
                continue
            if t1 is not None and t >= t1 - 1e-6:
                continue
            m = n['m'] + transpose
            if only_below is not None or only_above is not None:
                if (only_below is not None and m >= only_below) or \
                   (only_above is not None and m <= only_above):
                    continue
            out.append(dict(t=round(t, 3), m=m,
                            d=round(min(n['d'] * dscale, 8.0), 3),
                            v=max(1, min(127, int(round(n['v'] * vscale))))))
        out.sort(key=lambda x: (x['t'], x['m']))
        return out

    def top_k(ns, k):
        groups = {}
        for n in ns:
            groups.setdefault(n['t'], []).append(n)
        out = []
        for t in sorted(groups):
            g = sorted(groups[t], key=lambda n: n['m'])
            out.extend(g[-k:])
        out.sort(key=lambda n: (n['t'], n['m']))
        return out

    tA, tB, tC = (sec_of_bar(b) - off for b in (BAR_A, BAR_B, BAR_C))
    lead = M.mono_ize(mk(5), keep='high')                    # 小号 = A 段主旋律
    horn_pad = M.cap_poly(mk(3, t1=tB), 2)                   # 圆号前奏/间奏垫音
    horn_lead = M.cap_poly(mk(3, t0=tB, t1=tC), 2)           # 圆号 = B 段主旋律
    piano_all = mk(6)
    piano_lead = M.cap_poly([n for n in piano_all if n['v'] >= 100], 3)   # 钢琴右手主旋律/走句
    piano_acc = M.cap_poly([n for n in piano_all if n['v'] < 100], 3)     # 钢琴左手琶音
    epiano = M.mono_ize(mk(4), keep='high')                  # 电钢流动线
    guitar = M.cap_poly(mk(10), 2)                           # 钢弦吉他切分
    violin = mk(7)                                           # 小提琴副旋律
    bass = M.mono_ize(mk(1), keep='low')                     # 无品贝斯

    def legato(ns, maxd=0.45, gap=0.02):
        """把断奏的贝斯连起来：原谱每音只有 0.10s（16 分），sawtooth 一路点下去会像脉冲，
        听感就是「卡」；这里让每个音延到下一个音之前，最长 0.45s。"""
        out = []
        for i, n in enumerate(ns):
            t = n['t']
            nxt = ns[i + 1]['t'] if i + 1 < len(ns) else t + maxd
            d = min(max(n['d'], nxt - t - gap), maxd)
            out.append(dict(n, d=round(max(0.08, d), 3)))
        return out

    def sustain(ns, gap=0.014, cap=0.30, join=None, rest=None, rest_hold=None):
        """把「短音 + 空洞」的连起来。合成器每个音到 d 就指数衰减到 0，
        原谱的断奏记号（0.14s 的音、0.2s 的间距）搬过来就是一个个孤立的点，整首听感「卡」。
        实测 v3 小号主旋律只有 38% 的时间在发声（stage1 长笛 101%），所以主旋律必须连奏。
        规则：延到下一个起音之前（留 gap），最长 cap；给了 join 就只补不超过 join 的缝；
        给了 rest 就表示「间距超过 rest 是真休止」，只延 rest_hold。"""
        ons = sorted(set(round(n['t'], 3) for n in ns))
        idx = {t: i for i, t in enumerate(ons)}
        out = []
        for n in ns:
            t = round(n['t'], 3)
            i = idx.get(t)
            room = None
            if i is not None and i + 1 < len(ons):
                room = ons[i + 1] - t - gap
            if room is None or room <= 0:
                out.append(dict(n, d=round(max(n['d'], 0.10), 3)))
                continue
            if rest is not None and room > rest:
                out.append(dict(n, d=round(max(n['d'], rest_hold or 0.25), 3)))
                continue
            if join is None:
                want = min(room, cap)
            else:
                want = room if room <= join else min(cap, join)
            out.append(dict(n, d=round(max(n['d'], max(0.06, want)), 3)))
        return out

    # 原曲的钢琴/吉他/电钢是靠延音踏板和连奏糊成一片的，8-bit 单音发声器不补就全是点
    # 主旋律：连奏（原谱是小号/圆号/钢琴的真实连音线，MIDI 里被切成了 16 分断奏）
    lead = sustain(lead, gap=0.026, cap=0.55, rest=0.62, rest_hold=0.30)
    horn_lead = sustain(horn_lead, gap=0.022, cap=0.55, rest=0.62, rest_hold=0.30)
    horn_pad = sustain(horn_pad, gap=0.020, cap=0.80)
    piano_lead = sustain(piano_lead, gap=0.018, cap=0.50, rest=0.62, rest_hold=0.28)
    piano_acc = sustain(piano_acc, gap=0.014, cap=0.30)
    # 前奏（bar1-12）原曲是电钢/吉他踩着延音踏板的铺底，MIDI 里被切成 16 分点奏；
    # 独奏（主旋律还没进）的时候这些点之间全是空洞，听起来就是「卡」，所以前奏按踏板铺满。
    intro_ep = sustain([n for n in epiano if n['t'] < tA], gap=0.010, cap=0.85)
    outro_ep = sustain([n for n in epiano if n['t'] >= tA], gap=0.012, cap=0.24)
    epiano = sorted(intro_ep + outro_ep, key=lambda n: (n['t'], n['m']))
    intro_gt = sustain([n for n in guitar if n['t'] < tA], gap=0.010, cap=0.42)
    outro_gt = sustain([n for n in guitar if n['t'] >= tA], gap=0.012, cap=0.26)
    guitar = sorted(intro_gt + outro_gt, key=lambda n: (n['t'], n['m']))
    violin = sustain(violin, gap=0.020, cap=0.50)

    bass = legato(bass)
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    print('lead %d / horn %d+%d / piano %d+%d / epiano %d / guitar %d / violin %d / bass %d'
          % (len(lead), len(horn_pad), len(horn_lead), len(piano_lead), len(piano_acc),
             len(epiano), len(guitar), len(violin), len(bass)))

    e_bar = 60.0 / bpm * 4.0
    e16 = e_bar / 16.0
    nbar = int(round(duration / e_bar))

    def sect(b):
        if b < BAR_A:
            return 'intro'
        if b < BAR_B:
            return 'A'
        if b < BAR_C:
            return 'B'
        if b < BAR_BRIDGE:
            return 'C'
        if b < BAR_CODA:
            return 'bridge'
        return 'coda'

    if args.drums == 'orig':
        # 音源只有 5 种鼓（36 底 / 38 军 / 42 闭镲 / 46 开镲 / 49 吊镲），原谱的落地嗵 41/45/48 无处可去，
        # 硬塞进军鼓会把过门变成机关枪，所以整条丢掉（原曲的过门靠底鼓+军鼓的力度区分撑住）
        kind_of = {36: 0, 38: 1, 40: 1, 42: 2, 44: 2, 46: 3, 49: 4, 51: 3}
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
        thin = {0: 0.060, 1: 0.075, 2: args.hat_thin, 3: 0.28, 4: 0.0}
        drums, last = [], {}
        for t, k, v in raw:
            g = thin.get(k, 0.0)
            # 重音（v>=100）不参与抽稀
            if g and v < 100 and (t - last.get(k, -1e9)) < g:
                continue
            last[k] = t
            drums.append([t, k, int(max(20, min(127, round(v))))])
    else:
        # 原谱 ch9 是扒谱出来的鼓：每小节 kick 9 下、闭镲 7 下，落点 2/3/5/6/7/9/11/13/15 参差，
        # 中间还夹着落地嗵 41/45/48 —— 直接照搬会听成「卡」（节奏一直在断、一直在偏）。
        # 所以鼓按原曲的摇滚骨架重铺一套贴网格的稳态律动：每拍都有东西撑着，段落之间只换密度。
        GROOVE = {
            'intro':  dict(kick=(0, 8), snare=(), hat='8', ohat=()),
            'A':      dict(kick=(0, 6, 8), snare=(4, 12), hat='8', ohat=(14,)),
            'B':      dict(kick=(0, 8, 14), snare=(4, 12), hat='8', ohat=(6,)),
            'C':      dict(kick=(0, 4, 8, 12), snare=(4, 12), hat='16', ohat=(14,)),
            'bridge': dict(kick=(0, 8), snare=(12,), hat='8', ohat=()),
            'coda':   dict(kick=(0, 8), snare=(4, 12), hat='8', ohat=()),
        }
        drums = []
        for b in range(1, nbar + 1):
            t0 = (b - 1) * e_bar
            s = sect(b)
            g = GROOVE[s]
            for st in g['kick']:
                drums.append([round(t0 + st * e16, 3), 0, 112 if st == 0 else 94])
            for st in g['snare']:
                drums.append([round(t0 + st * e16, 3), 1, 116])
            steps = range(0, 16, 2) if g['hat'] == '8' else range(0, 16)
            for st in steps:
                v = 96 if st % 4 == 0 else (66 if g['hat'] == '8' else 50)
                drums.append([round(t0 + st * e16, 3), 2, v])
            for st in g['ohat']:
                drums.append([round(t0 + st * e16, 3), 3, 76])
            # 每 4 小节末尾一个 16 分军鼓过门（原曲的过门本来就在这个位置）
            if b % 4 == 0 and s in ('A', 'B', 'C'):
                for i, st in enumerate((13, 14, 15)):
                    drums.append([round(t0 + st * e16, 3), 1, 100 + i * 8])
            # 段落起点吊镲
            if b in (1, BAR_A, BAR_B, BAR_C, BAR_BRIDGE, BAR_CODA):
                drums.append([round(t0, 3), 4, 96])
    drums.append([0.0, 4, 84])
    drums.sort(key=lambda x: (x[0], x[1]))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s（%.1f 击/秒）' % (len(drums), cnt, len(drums) / duration))

    def clip(ns):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - 0.10]

    (lead, horn_pad, horn_lead, piano_lead, piano_acc, epiano, guitar, violin, bass, sub) = (
        clip(x) for x in (lead, horn_pad, horn_lead, piano_lead, piano_acc, epiano,
                          guitar, violin, bass, sub))
    left = [d for d in drums if d[0] < duration - 0.02]

    print('段落（相对成品）: A %.2fs / B %.2fs-%.2fs / C %.2fs-%.2fs / 尾奏 %.2fs'
          % (tA, tB, tC, tC, sec_of_bar(BAR_BRIDGE) - off, sec_of_bar(BAR_CODA) - off))
    for b in range(1, 54, 4):
        t0, t1 = sec_of_bar(b) - off, sec_of_bar(b + 4) - off
        if t1 < 0:
            continue
        print('  bar %2d-%2d  t %6.1f-%6.1f  lead %2d  piano %2d  drums %3d' % (
            b, b + 4, t0, t1,
            sum(1 for n in lead if t0 <= n['t'] < t1),
            sum(1 for n in piano_lead if t0 <= n['t'] < t1),
            sum(1 for d in left if t0 <= d[0] < t1)))
    if args.check:
        return

    k = args.trim
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=spec_bpm(bpm),
                tracks=[dict(wave='square', gain=round(args.lead_gain * k, 3), notes=lead),
                        dict(wave='triangle', gain=round(args.horn_pad_gain * k, 3), notes=horn_pad),
                        dict(wave='triangle', gain=round(args.horn_lead_gain * k, 3), notes=horn_lead),
                        dict(wave='triangle', gain=round(args.piano_lead_gain * k, 3), notes=piano_lead),
                        dict(wave='triangle', gain=round(args.piano_acc_gain * k, 3), notes=piano_acc),
                        dict(wave='square', gain=round(args.epiano_gain * k, 3), notes=epiano),
                        dict(wave='square', gain=round(args.guitar_gain * k, 3), notes=guitar),
                        dict(wave='triangle', gain=round(args.violin_gain * k, 3), notes=violin),
                        dict(wave='sawtooth', gain=round(args.bass_gain * k, 3), notes=bass),
                        dict(wave='sine', gain=round(args.sub_gain * k, 3), notes=sub)],
                drums=left)
    data['reasons'] = [
        '照原曲直译：ZUN 谱 MIDI 的原始顺序 1:1 搬谱（bar1-53 / 86.86s），不重写旋律、不改段落',
        '主旋律按原曲换乐器：A 段小号 ch5 -> B 段圆号 ch3 -> C 段钢琴 ch6（右手，力度 100 以上）',
        '伴奏全部取原谱：ch6 钢琴左手琶音、ch4 电钢流动线、ch10 钢弦吉他切分、ch7 小提琴副旋律、ch1 无品贝斯',
        '鼓 = 原曲 ch9 真鼓抽稀；开头 2.4s 谱面空拍已裁掉，从第一个鼓点起算',
    ]
    head = """/**
 * 一面道中《ほおずきみたいに紅い魂》—— 照原曲直译版。
 * 素材 = ZUN 原曲 TH06 扒谱 MIDI，按原文真实秒数 1:1 搬谱，主旋律与伴奏全部是原谱音符；
 * tools/pre1_honou.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


def spec_bpm(bpm):
    return int(round(bpm))


if __name__ == '__main__':
    main()
