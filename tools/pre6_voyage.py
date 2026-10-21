#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/pre6_voyage.py -- 12 六面道中《ヴォヤージュ1970》旅人编（照 ZUN 原曲 1:1 直译）。

主人 m02769：「6面・道中ヴォヤージュ 1970 蓝图：refA/refB/refC 三条链接，**严格按照第一首主旋律改**」。
=> 主旋律 100% 取 refA（ZUN 原曲）扒谱 MIDI 的顶线 ch3；伴奏全部照原谱；
   原谱没有鼓通道（机器转谱），鼓按 162 BPM 摇滚编制自己编（八分闭镲、军鼓 2/4、底鼓 1/3 + 切分）。

素材：8 - Imperishable Night\16. Voyage 1970 (ZUN).mid（单 tempo 162，division 480，bar 1.48148s）
内容 bar 2.0 - bar 54.03（2.963s - 80.05s），全部音符时值都是 16 分格。

用法：
    python tools/pre6_voyage.py --check
    python tools/pre6_voyage.py
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
                   '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'voyage_pre6.js')
EXPORT = 'VOYAGE_PRE6'
SPEC = dict(key='pre6', title='ヴォヤージュ1970（旅人编）', bpm=162.0)

# 段落（按输出时间轴的 bar 号，bar 2 = 0.0s）
SEC_INTRO0, SEC_INTRO1 = 2.0, 9.0      # 钢琴琶音瀑布前奏
SEC_A0, SEC_A1 = 9.0, 25.0             # 主旋律 A
SEC_B0, SEC_B1 = 25.0, 32.0            # B
SEC_C0, SEC_C1 = 32.0, 38.0            # C（最密）
SEC_D0, SEC_D1 = 38.0, 44.0            # D（抽稀段）
SEC_E0, SEC_E1 = 44.0, 54.0            # 尾声再现


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
    ap.add_argument('--lead-gain', type=float, default=0.17)      # 主旋律 square
    ap.add_argument('--piano-gain', type=float, default=0.080)    # ch0 钢琴（主旋律低八度 + 和弦）
    ap.add_argument('--piano-intro-gain', type=float, default=0.150)  # 前奏：ch3 也用三角波弹
    ap.add_argument('--strings-gain', type=float, default=0.050)  # ch6+ch7 弦乐垫
    ap.add_argument('--bass-gain', type=float, default=0.108)     # ch9 十六分贝斯
    ap.add_argument('--sub-gain', type=float, default=0.130)
    ap.add_argument('--guitar-gain', type=float, default=0.030)   # ch15 尾声过载吉他
    ap.add_argument('--trim', type=float, default=1.25)           # 整体电平（对齐 house style：RMS ~0.13）
    ap.add_argument('--kick', type=int, default=104)
    ap.add_argument('--snare', type=int, default=96)
    ap.add_argument('--hat', type=int, default=32)
    ap.add_argument('--open-hat', type=int, default=56)
    ap.add_argument('--crash', type=int, default=84)
    ap.add_argument('--valley', type=float, default=0.50)   # D 段（谷底）伴奏力度系数
    ap.add_argument('--peak', type=float, default=1.0)      # C/E 段（高潮）伴奏力度系数
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    q = 4.0 * div
    sec_of_bar = lambda b: M.tick_to_sec(segs, div, int(round(b * q)))
    off = sec_of_bar(SEC_INTRO0)
    end_sec = sec_of_bar(54.03)
    duration = round(end_sec - off, 3)
    bar = sec_of_bar(3.0) - sec_of_bar(2.0)
    beat = bar / 4.0
    print('tempo map 段数 %d；bar=%.5fs；内容 %.3fs - %.3fs -> 成品 %.3fs (%.2f 小节)'
          % (len(segs), bar, off, end_sec, duration, duration / bar))
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(notes.items())})

    def mk(ch, transpose=0, vscale=1.0, dscale=1.0, only_above=None, only_below=None):
        out = []
        for n in notes.get(ch, []):
            t = round(n['t'] - off, 3)
            if t < 0:
                continue
            m = n['m'] + transpose
            if only_above is not None and m <= only_above:
                continue
            if only_below is not None and m >= only_below:
                continue
            out.append(dict(t=t, m=m, d=round(min(n['d'] * dscale, 8.0), 3),
                            v=max(1, min(127, int(round(n['v'] * vscale))))))
        out.sort(key=lambda n: (n['t'], n['m']))
        return out

    def win(ns, t0, t1):
        return [n for n in ns if t0 - 1e-9 <= n['t'] < t1 - 1e-9]

    def clip(ns, guard=0.10):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - guard]
    # ---- 段落起伏（m02944：调子反差跌宕再大一点）----
    def sec_at(t):
        b = SEC_INTRO0 + t / bar
        if b < SEC_INTRO1:
            return 'intro'
        if b < SEC_A1:
            return 'A'
        if b < SEC_B1:
            return 'B'
        if b < SEC_C1:
            return 'C'
        if b < SEC_D1:
            return 'D'
        return 'E'

    def dyn(ns, table):
        out = []
        for n in ns:
            f = table.get(sec_at(n['t']), 1.0)
            out.append(dict(n, v=max(1, min(127, int(round(n['v'] * f))))))
        return out

    # D 段头两小节 = 全曲最低点：撤鼓、撤贝斯/sub、钢琴只留最高一根
    _d_break = ((SEC_D0 - SEC_INTRO0) * bar, (SEC_D0 + 2 - SEC_INTRO0) * bar)

    def in_break(t):
        return _d_break[0] - 1e-6 <= t < _d_break[1] - 1e-6

    # 结尾两小节把伴奏收一点，循环回前奏才有落差
    _tail_t = (SEC_E1 - 2 - SEC_INTRO0) * bar

    def tail_ease(t):
        if t < _tail_t:
            return 1.0
        k = (t - _tail_t) / max(1e-6, duration - _tail_t)
        return 1.0 - 0.14 * k

    theme_t = sec_of_bar(SEC_INTRO1) - off

    top = mk(3)
    intro_top = [n for n in top if n['t'] < theme_t]
    lead = [n for n in top if n['t'] >= theme_t]
    piano = mk(0)
    print('顶线 ch3 %d 音（前奏 %d / 主体 %d）' % (len(top), len(intro_top), len(lead)))

    # 弦乐：ch6 + ch7，去掉完全重复的音，每人最多 3 声部
    st = []
    seen = set()
    for ch in (6, 7):
        for n in mk(ch):
            k = (round(n['t'], 3), n['m'])
            if k in seen:
                continue
            seen.add(k)
            st.append(n)
    st.sort(key=lambda n: (n['t'], n['m']))
    strings = M.cap_poly(st, 3)
    print('弦乐 %d 音（合并前 %d）' % (len(strings), len(st)))

    bass = M.mono_ize(mk(9), keep='low')
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    guitar = M.cap_poly(mk(15), 3)
    print('贝斯 %d / sub %d / 吉他 %d' % (len(bass), len(sub), len(guitar)))

    # ---- 鼓：162 BPM 摇滚型，按段落分三档密度 ----
    kick_pat = [0, 6, 8]           # 16 分格：1 拍、3 拍反拍、3 拍
    snare_pat = [4, 12]            # 2 / 4 拍
    drums = []

    # 前奏：最后一小节 16 分军鼓滚奏（40 -> 112），前面一小节 8 分轻滚
    for i in range(8):
        tt = round((SEC_INTRO1 - 2 - SEC_INTRO0) * bar + i * (bar / 4.0), 3)
        drums.append([tt, 1, int(34 + i * 3)])
    for i in range(16):
        tt = round((SEC_INTRO1 - 1 - SEC_INTRO0) * bar + i * (bar / 16.0), 3)
        drums.append([tt, 1, int(40 + i * 4.8)])
    drums.append([round((SEC_INTRO1 - 1 - SEC_INTRO0) * bar, 3), 0, 96])
    drums.append([round((SEC_INTRO1 - 1 - SEC_INTRO0) * bar + 2 * beat, 3), 0, 92])

    sections = [('A', SEC_A0, SEC_A1), ('B', SEC_B0, SEC_B1), ('C', SEC_C0, SEC_C1),
                ('D', SEC_D0, SEC_D1), ('E', SEC_E0, SEC_E1)]
    for name, s0, s1 in sections:
        b0, b1 = int(round(s0)), int(round(s1))
        for b in range(b0, b1):
            t0 = (b - SEC_INTRO0) * bar
            idx = b - b0
            if name == 'D' and idx < 2:
                continue                        # 谷底：头两小节整段撤鼓
            peak = (name == 'C') or (name == 'E' and idx < (b1 - b0) - 2)
            half = (name == 'D') or (name == 'E' and idx >= (b1 - b0) - 2)
            b_half = (name == 'B')           # B 段：半速律动，把 A 的摇滚拍拉开
            for i in range(16):
                tt = round(t0 + i * beat / 4.0, 3)
                if tt >= duration - 0.02:
                    continue
                # 闭镲：高潮 16 分 / 谷底四分 / B 与常规 8 分
                if peak:
                    drums.append([tt, 2, args.hat - 6 + (5 if i % 4 == 0 else 0)])
                elif half:
                    if name != 'D' and i % 4 == 0:
                        drums.append([tt, 2, args.hat - 14])
                elif b_half:
                    if i % 2 == 0:
                        drums.append([tt, 2, args.hat - 6])
                elif i % 2 == 0:
                    drums.append([tt, 2, args.hat - 2 if i % 4 else args.hat + 2])
                # 底鼓
                if peak:
                    if i % 4 == 0:
                        drums.append([tt, 0, args.kick + 6])
                elif half:
                    if i == 0:
                        drums.append([tt, 0, args.kick - 12])
                elif b_half:
                    if i == 0:
                        drums.append([tt, 0, args.kick - 2])
                    if i == 10:
                        drums.append([tt, 0, args.kick - 16])
                else:
                    if i in kick_pat:
                        drums.append([tt, 0, args.kick])
                    if b % 4 == 3 and i == 14:
                        drums.append([tt, 0, args.kick - 10])
                # 军鼓
                if half or b_half:
                    if i == 8:
                        drums.append([tt, 1, args.snare - (10 if half else 4)])
                elif i in snare_pat:
                    drums.append([tt, 1, args.snare + (5 if peak else 0)])
            # 开镲
            if peak:
                drums.append([round(t0 + 7 * beat / 4.0, 3), 3, args.open_hat + 8])
            elif name in ('A', 'B') and b % 2 == 1:
                drums.append([round(t0 + 7 * beat / 4.0, 3), 3, args.open_hat])
            # 段落起点吊镲
            if idx == 0 and name != 'D':
                drums.append([round(t0, 3), 4, args.crash + (10 if peak else 0)])
            # 高潮每两小节一记吊镲
            if peak and idx % 2 == 0 and idx > 0:
                drums.append([round(t0, 3), 4, args.crash + 6])
            # 每 8 小节末拍补一个过门（16 分军鼓）
            if b % 8 == 7 and name != 'D':
                for i in range(4):
                    drums.append([round(t0 + 12 * beat / 4.0 + i * beat / 4.0, 3), 1,
                                  int(args.snare - 22 + i * 7)])
        if name == 'D':
            # 谷底两小节后回场：最后一拍半的军鼓渐强把空档接起来
            for i in range(8):
                drums.append([round((SEC_D0 + 2 - SEC_INTRO0) * bar - beat + i * beat / 4.0, 3),
                              1, int(40 + i * 8)])
            # 谷底两小节后回场：正拍吊镲 + 底鼓
            re_t = (SEC_D0 + 2 - SEC_INTRO0) * bar
            drums.append([round(re_t, 3), 4, args.crash - 4])
            drums.append([round(re_t, 3), 0, args.kick + 2])
            # D 段最后一小节：16 分军鼓爬升 → 推进 E
            tb = (b1 - 1 - SEC_INTRO0) * bar
            for i in range(16):
                drums.append([round(tb + i * beat / 4.0, 3), 1, int(36 + i * 5.6)])
            drums.append([round((b1 - SEC_INTRO0) * bar, 3), 4, min(127, args.crash + 22)])

    # 主题进门正拍：吊镲 + 底鼓（与 A 段起点重复的只留一个）
    drums.append([round(theme_t, 3), 4, min(120, args.crash + 16)])
    drums.append([round(theme_t, 3), 0, min(124, args.kick + 8)])
    _dsc = {'C': args.peak * 0.94, 'E': args.peak * 1.06}
    drums = [[d[0], d[1], max(1, min(127, int(round(d[2] * _dsc.get(sec_at(d[0]), 1.0)))))] for d in drums]
    dedup = {}
    for d in drums:
        k = (d[0], d[1])
        if k not in dedup or d[2] > dedup[k][2]:
            dedup[k] = d
    drums = sorted(dedup.values(), key=lambda x: (x[0], x[1]))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s' % (len(drums), cnt))

    piano, intro_top, lead, strings, bass, sub, guitar = (
        clip(x) for x in (piano, intro_top, lead, strings, bass, sub, guitar))
    piano_raw = [dict(n) for n in piano]

    # ---- 谷底（D 段头两小节）：撤贝斯/sub，钢琴只留最高一根 ----
    # 谷底头两小节：钢琴只留最高一根（撤掉和弦），不整段撤，避免主旋律休止处变成空洞
    # 谷底头两小节：钢琴留完整和弦（只压力度），避免主旋律休止处塌成空洞
    bass = [n for n in bass if not in_break(n['t'])]
    sub = [n for n in sub if not in_break(n['t']) and sec_at(n['t']) != 'intro']

    # ---- 段落力度：前奏收 / 谷底压 / 高潮顶 ----
    def _dpc(t, f_brk=0.42):
        return f_brk if in_break(t) else args.valley

    piano = [dict(n, m=max(12, n['m'] - 12)) if sec_at(n['t']) == 'B' else n for n in piano]
    _piano_dyn = {'intro': 0.80, 'A': 0.90, 'B': 0.88, 'C': args.peak * 0.92, 'E': args.peak * 1.02}
    _piano_out = []
    for _n in piano:
        _s = sec_at(_n['t'])
        _f = _dpc(_n['t']) if _s == 'D' else _piano_dyn[_s]
        _piano_out.append(dict(_n, v=max(1, min(127, int(round(_n['v'] * _f))))))
    piano = _piano_out
    strings = [n for n in strings if sec_at(n['t']) != 'A']   # A 段只留骨架，C/E 再进弦乐
    strings = dyn(strings, {'intro': 0.72, 'B': 0.92, 'C': args.peak * 0.96, 'D': 1.06, 'E': args.peak * 1.06})
    _low = {'intro': 0.85, 'A': 0.92, 'B': 0.82, 'C': args.peak * 0.92, 'D': 0.70, 'E': args.peak * 1.04}
    bass = dyn(bass, _low)
    sub = dyn(sub, _low)

    def ease(ns):
        return [dict(n, v=max(1, min(127, int(round(n['v'] * tail_ease(n['t'])))))) for n in ns]

    piano, strings, bass, sub = (ease(x) for x in (piano, strings, bass, sub))

    # ---- 高潮加倍：主旋律 +12 只出现在 C / E ----
    def oct_f(t):
        s = sec_at(t)
        if s == 'C':
            return 0.55 if t < (SEC_C0 + 2 - SEC_INTRO0) * bar else 0.78
        return 0.92

    lead_oct = [dict(n, m=min(120, n['m'] + 12), v=max(1, min(127, int(round(n['v'] * oct_f(n['t']))))))
                for n in lead if sec_at(n['t']) in ('C', 'E') and n['t'] < _tail_t]

    # 弦乐高八度：只在高潮段给亮度
    strings_hi = [dict(n, m=min(120, n['m'] + 12), v=max(1, min(127, int(round(n['v'] * 0.85)))))
                  for n in strings if sec_at(n['t']) in ('C', 'E') and n['t'] < _tail_t]

    # 主旋律力度：音符一个不动，只做段落强弱（谷底压到 0.62，高潮顶满）
    _lead_dyn = {'A': 0.94, 'B': 0.86, 'C': 1.00, 'D': 0.56, 'E': 1.00}

    def _lead_f(t):
        return 0.55 if in_break(t) else _lead_dyn[sec_at(t)]

    lead = [dict(n, v=max(1, min(127, int(round(n['v'] * _lead_f(n['t'])))))) for n in lead]

    # 谷底铺持续和弦：原曲抽稀段有几处半秒休止，本引擎没有混响，会塌成空洞
    pad = []
    for _b in range(int(SEC_D0), int(SEC_D1) + 1):
        _t0 = (_b - SEC_INTRO0) * bar
        _grp = [n for n in piano_raw if _t0 - 1e-6 <= n['t'] < _t0 + bar - 1e-6]
        if not _grp:
            continue
        for _m in sorted({n['m'] for n in _grp})[:3]:
            _pv = 102 if in_break(_t0 + 1e-6) else 72
            pad.append(dict(t=round(_t0, 3), m=_m, d=round(min(bar * 0.99, duration - _t0), 3), v=_pv))
    pad = clip(pad)
    pad_sub = [dict(n, m=max(21, n['m'] - 12), v=max(1, min(127, int(round(n['v'] * 0.9)))),
                    d=round(n['d'] * 0.98, 3)) for n in pad if n['m'] >= 40]

    for _nm, _ns in (('lead', lead), ('oct', lead_oct), ('str_hi', strings_hi), ('piano', piano), ('pad', pad), ('str', strings),
                     ('bass', bass), ('sub', sub), ('intro', intro_top)):
        _c = {}
        for _n in _ns:
            _c[sec_at(_n['t'])] = _c.get(sec_at(_n['t']), 0) + 1
        print('  %-5s %4d 音  %s' % (_nm, len(_ns), _c))

    left = [d for d in drums if d[0] < duration - 0.02]

    if args.check:
        for b in range(int(SEC_INTRO0), int(SEC_E1)):
            t0, t1 = (b - SEC_INTRO0) * bar, (b + 1 - SEC_INTRO0) * bar
            print('  bar %2d  t %6.2f-%6.2f  lead %2d  piano %3d  drums %2d' % (
                b, t0, t1, sum(1 for n in lead if t0 <= n['t'] < t1),
                sum(1 for n in piano if t0 <= n['t'] < t1),
                sum(1 for d in left if t0 <= d[0] < t1)))
        return

    # 进主题前的短爬升（chromatic riser，独立轨）
    _r0 = (SEC_INTRO1 - 1 - SEC_INTRO0) * bar
    riser = [dict(t=round(_r0 + i * (bar / 16.0), 3), m=69 + i,
                  d=round(bar / 16.0 * 0.92, 3), v=int(40 + i * 4.6)) for i in range(16)]
    riser = clip(riser)

    tracks = [
        dict(wave='square', gain=args.lead_gain, notes=lead),
        dict(wave='square', gain=args.lead_gain * 0.42, notes=lead_oct),
        dict(wave='triangle', gain=args.piano_gain, notes=piano),
        dict(wave='triangle', gain=args.piano_intro_gain, notes=intro_top),
        dict(wave='triangle', gain=args.strings_gain * 0.70, notes=strings_hi),
        dict(wave='triangle', gain=args.strings_gain, notes=strings),
        dict(wave='triangle', gain=0.055, notes=pad),
        dict(wave='sine', gain=0.030, notes=pad_sub),
        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
        dict(wave='sine', gain=args.sub_gain, notes=sub),
        dict(wave='sawtooth', gain=args.guitar_gain, notes=guitar),
        dict(wave='triangle', gain=0.050, notes=riser),
    ]
    tracks = [t for t in tracks if t['notes']]
    for t in tracks:
        t['gain'] = round(min(0.30, t['gain'] * args.trim), 3)

    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=SPEC['bpm'],
                tracks=tracks, drums=left)
    data['reasons'] = [
        '照原曲直译：ZUN 原谱 bar 2.0-54.03（80.05s）整段按 162 BPM 原速搬过来，不重排、不转调',
        '主旋律 = 原谱唯一单声部轨 ch3 顶线（前奏段落交给三角波钢琴，square 主音从主题正拍 %.2fs 进）' % theme_t,
        '伴奏全部取原谱：ch0 钢琴（主旋律低八度 + 和弦）、ch6+ch7 弦乐长音、ch9 十六分贝斯、ch15 尾声过载吉他',
        '原谱无鼓通道（机器转谱，全部音符都是 16 分格），鼓按 162 BPM 摇滚编制补：常规段八分闭镲、高潮段（C 32-38 小节 / E 44-52 小节）16 分闭镲 + 四踩 + 每两小节吊镲、谷底段（D 38-44 小节）头两小节整段撤鼓后转半速',
        '段落起伏（m02944）：前奏只留三角波钢琴 + 弦乐；A 段进 square 主旋律；B 段弦乐加厚；C 段主旋律 +12 加倍 + 16 分镲；D 段谷底撤鼓撤贝斯、钢琴只留最高一根；E 段全编制收回再顶一次，最后两小节收力接回前奏',
        '蓝图分工：refA 原曲 = 主旋律与织体；refB さ～くる虹川家 = 配器厚度的旁证；refC 神楽庭園 = 强四踩的旁证',
    ]
    head = """/**
 * 六面道中《ヴォヤージュ1970》—— 旅人编（照 ZUN 原曲 1:1 直译）。
 * 素材 = ZUN 原曲 TH08 扒谱 MIDI（单 tempo 162 BPM），主旋律 100% 原曲顶线；
 * tools/pre6_voyage.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
