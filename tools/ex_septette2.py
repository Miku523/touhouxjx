#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/ex_septette2.py -- EX 中段（雷米莉亚拦路）《亡き王女の為のセプテット》血月圆舞编 v2。

口径（主人 m03618）：
  主旋律大纲 = 原曲（TH06 ZUN）—— 主旋律 100% 取扒谱 ch3 小号顶线，音符不动。
  蓝图 = 194s 那版 —— 开场即满、现场乐队式重量、更快的圆舞曲（160 BPM）。
做法：
  1) 用 tick（拍）而不是秒：整曲重排到 160 BPM 的 3/4 网格，节奏型原样保留；
  2) 整体 −1 半音，落到原曲的 D 小调；
  3) 在扒谱原有编制上加重：锯齿节奏吉他、军鼓过门、吊镲、高潮段主旋律 +12 加倍。

用法：
    python tools/ex_septette2.py --check
    python tools/ex_septette2.py
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
SPEC = dict(key='ex_mid', title='亡き王女の為のセプテット（血月圆舞编）', bpm=160.0)
BPM = 160.0
BEAT = 60.0 / BPM
BAR = 3 * BEAT
OFF_BEATS = 6.0     # 内容从第 2 小节起（鼓 5.92 拍）
TRANS = -1          # 扒谱比原曲高半音

# 段落（按扒谱的小节号，3/4）
SEC = dict(intro=(2, 12), A=(12, 33), B=(33, 66), C=(66, 88), D=(88, 110))


def load():
    midi = M.parse_midi(MID)
    div = midi['division'] or 480
    notes = {}
    pending = {}
    for tr in midi['tracks']:
        for ev in tr['events']:
            if ev[1] == 'on' and ev[4] > 0:
                pending.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
            elif ev[1] == 'off':
                st = pending.get((ev[2], ev[3]))
                if st:
                    on, vel = st.pop(0)
                    notes.setdefault(ev[2], []).append(
                        (on, max(ev[0], on + 1), ev[3], vel))
    out = {}
    for ch, ns in notes.items():
        lst = []
        for on, offt, m, v in ns:
            b0 = on / div - OFF_BEATS
            b1 = offt / div - OFF_BEATS
            if b1 <= 0:
                continue
            t0 = max(0.0, b0 * BEAT)
            t1 = b1 * BEAT
            lst.append(dict(t=round(t0, 3), d=round(min(8.0, max(0.05, t1 - t0)), 3),
                            m=m, v=v, b=round(max(0.0, b0), 3)))
        lst.sort(key=lambda n: (n['t'], n['m']))
        out[ch] = lst
    return out, div


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


def transpose(ns, k=TRANS):
    return [dict(n, m=n['m'] + k) for n in ns]


def sec_of_bar(bar):
    for name, (a, b) in SEC.items():
        if a <= bar < b:
            return name
    return 'D'


def math2(x):
    return max(1, min(127, int(round(x))))


def dyn(ns, table):
    for n in ns:
        bar = n['b'] / 3.0
        n['v'] = max(1, min(127, int(round(n['v'] * table.get(sec_of_bar(bar), 1.0)))))
    return ns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lead-gain', type=float, default=0.225)
    ap.add_argument('--lead-lo-gain', type=float, default=0.050)
    ap.add_argument('--oct-gain', type=float, default=0.062)
    ap.add_argument('--piano-gain', type=float, default=0.100)
    ap.add_argument('--intro-gain', type=float, default=0.076)
    ap.add_argument('--guitar-gain', type=float, default=0.052)
    ap.add_argument('--strings-gain', type=float, default=0.062)
    ap.add_argument('--organ-gain', type=float, default=0.044)
    ap.add_argument('--counter-gain', type=float, default=0.032)
    ap.add_argument('--gtr-gain', type=float, default=0.038)
    ap.add_argument('--power-gain', type=float, default=0.045)
    ap.add_argument('--bass-gain', type=float, default=0.115)
    ap.add_argument('--sub-gain', type=float, default=0.140)
    ap.add_argument('--intro-pad-gain', type=float, default=0.072)
    ap.add_argument('--hat-thin', type=float, default=0.155)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, div = load()
    end_t = max(n['t'] + n['d'] for ns in notes.values() for n in ns)
    duration = round(end_t + 0.08, 3)
    print('内容 %.3fs（%.1f 小节 @160bpm，3/4）' % (duration, duration / BAR))

    lead = M.mono_ize(transpose(notes.get(3, [])), keep='high')
    lead_lo = M.mono_ize(transpose(notes.get(10, [])), keep='high')

    # 0:25.5–0:33 原谱 melody 整段休止（只有钢琴 vamp）→ 手写连接句把空档补上：
    # A 小调骨架（= 扒谱 Bb 小调整体 −1），句子从 76 爬到 83 再落回 74，接回 29.31 小节原句的 81。
    FILL = [(67.92, 76, 0.50), (68.42, 79, 0.50),
            (69.00, 81, 0.70), (69.70, 79, 0.35), (70.05, 77, 0.35), (70.40, 76, 0.55),
            (72.00, 74, 1.40),
            (75.00, 76, 0.70), (75.70, 77, 0.35), (76.05, 79, 0.35), (76.40, 81, 0.55),
            (78.00, 84, 1.40),   # 峰值用 C（Bb 和弦的九音），不用 B♮（和 Bb 差半音会打架）
            (81.00, 81, 0.70), (81.70, 79, 0.35), (82.05, 77, 0.35), (82.40, 76, 0.55),
            (84.00, 74, 0.90), (84.90, 72, 0.45), (85.35, 74, 0.45), (85.80, 76, 0.90),
            (86.70, 77, 0.40), (87.10, 79, 0.45)]
    lead = lead + [dict(t=round(b * BEAT, 3), d=round(db * BEAT, 3), m=m,
                        v=106 if db >= 0.8 else 96, b=b) for b, m, db in FILL]
    lead.sort(key=lambda n: (n['t'], n['m']))
    piano = top_k(transpose(notes.get(2, [])), 2)
    intro = transpose(notes.get(8, []))
    intro.sort(key=lambda n: (n['t'], n['m']))
    guitar = transpose(notes.get(5, []))
    strings = M.cap_poly(transpose(notes.get(4, []) + notes.get(12, [])), 2)
    organ = M.cap_poly(transpose(notes.get(14, [])), 2)
    counter = transpose(notes.get(7, []))
    counter = [n for n in counter if n['m'] > 70]
    for n in counter:
        n['v'] = max(1, int(round(n['v'] * 0.62)))
    # ch1（prog36）从第 10 小节才进；前奏的低音在 ch13（prog35，0–107 小节全程）
    INTRO_BEATS = 30.33
    bass = M.mono_ize(transpose(notes.get(1, [])), keep='low') + \
        M.mono_ize(transpose([n for n in notes.get(13, []) if n['b'] < INTRO_BEATS]), keep='low')
    bass.sort(key=lambda n: (n['t'], n['m']))
    sub = [dict(n, m=max(21, n['m'] - 12)) for n in bass]
    gtr = M.cap_poly(transpose(notes.get(11, [])), 2)

    # 高潮段主旋律 +12 加倍
    oct_up = []
    for n in lead:
        bar = n['b'] / 3.0
        if sec_of_bar(bar) in ('C', 'D') and n['m'] + 12 <= 108:
            oct_up.append(dict(n, m=n['m'] + 12, v=max(40, int(round(n['v'] * 0.78)))))
    oct_up.sort(key=lambda n: (n['t'], n['m']))

    # 分段力度：蓝图式「开场即满、副歌再抬」
    dyn(lead, dict(intro=0.92, A=0.97, B=0.93, C=1.0, D=1.0))
    dyn(piano, dict(intro=0.90, A=1.0, B=0.92, C=1.0, D=1.0))
    dyn(strings, dict(intro=0.80, A=0.86, B=0.92, C=1.0, D=1.06))
    dyn(guitar, dict(intro=0.86, A=0.92, B=0.95, C=1.0, D=1.0))
    dyn(bass, dict(intro=0.95, A=1.0, B=0.96, C=1.0, D=1.02))

    # 锯齿节奏吉他：每小节 2、3 拍 power chord（根音+五度），只在 B/C/D
    power = []
    bass_by_bar = {}
    for n in bass:
        bar = int(round(n['b'] / 3.0 - 0.5))
        prev = bass_by_bar.get(bar)
        if prev is None or n['b'] < prev['b']:
            bass_by_bar[bar] = n
    bars = int(duration / BAR) + 1
    for bar in range(bars):
        name = sec_of_bar(bar + 2)
        if name not in ('B', 'C', 'D'):
            continue
        root = bass_by_bar.get(bar + 2)
        if root is None:
            continue
        m0 = root['m']
        while m0 < 45:
            m0 += 12
        for beat in (1, 2):
            t = bar * BAR + beat * BEAT
            for k in (0, 7):
                power.append(dict(t=round(t, 3), d=round(BEAT * 0.42, 3), m=m0 + k,
                                  v=96 if beat == 1 else 88, b=t / BEAT))
    power.sort(key=lambda n: (n['t'], n['m']))
    if args.check:
        print('vamp 和声（bar 22-30，贝斯根音 + 钢琴琶音顶音）：')
        _bybar = {}
        for n in bass:
            bar = int(n['b'] // 3)
            if 21 <= bar < 31:
                _bybar.setdefault(bar, []).append(('B', n['m']))
        for n in notes.get(2, []):
            bar = int(n['b'] // 3)
            if 21 <= bar < 31:
                _bybar.setdefault(bar, []).append(('P', n['m']))
        for bar in sorted(_bybar):
            g = _bybar[bar]
            bs = [m for k, m in g if k == 'B']
            ps = sorted(set(m for k, m in g if k == 'P'))
            print('  bar %2d  bass %s  piano %s' % (bar, bs[:6], ps))
        print('ch2 顶声部 bar 22.6-29.4：')
        _top = {}
        for n in notes.get(2, []):
            bar = n['b'] / 3.0
            if 22.0 <= bar < 30.0:
                _top.setdefault(round(n['b'], 2), []).append(n)
        for b in sorted(_top)[:40]:
            g = sorted(_top[b], key=lambda n: n['m'])
            print('  b %7.2f bar %5.2f  %s' % (b, b / 3.0, ' '.join('%d/%.2f' % (n['m'], n['d']) for n in g)))
        print('A 段 melody 分段：')
        for n in notes.get(3, []):
            bar = n['b'] / 3.0
            if 20 <= bar < 34:
                print('  bar %6.2f m=%3d d=%.2f v=%d' % (bar, n['m'], n['d'], n['v']))
    print('lead %d(+12 %d) / piano %d / intro %d / guitar %d / strings %d / organ %d / counter %d / bass %d / gtr %d / power %d'
          % (len(lead), len(oct_up), len(piano), len(intro), len(guitar), len(strings),
             len(organ), len(counter), len(bass), len(gtr), len(power)))

    # 前奏满编（蓝图 bp 是「开场即满」：194s 版从 2s 起 RMS 就 0.22，没有弱前奏）
    INTRO_END = 30.33           # 主旋律第一拍（拍数）= 11.37s
    for tr in (piano, strings, intro, guitar, bass, sub):
        for n in tr:
            if n['b'] < INTRO_END:
                n['v'] = max(1, min(127, int(round(n['v'] * 1.45))))

    # 前奏和声墙：每小节从贝斯根音起 power chord（根+五+八度），走 1、3 拍
    p_intro = []
    _roots = [(n['b'] // 3, n['m']) for n in bass if n['b'] < INTRO_END]
    _seen = set()
    for bar, m in _roots:
        if bar in _seen or bar > 10:
            continue
        _seen.add(bar)
        _r = m if m <= 52 else m - 12
        for _beat in (0, 2):
            _t = bar * 3 + _beat
            for _dt, _iv in ((0, 0), (0, 7), (0, 12)):
                p_intro.append(dict(t=round(_t * BEAT, 3), m=max(24, min(90, _r + _iv)),
                                    d=round(BEAT * 1.75, 3), v=math2(86 if _iv == 0 else 72),
                                    b=_t))
    p_intro.sort(key=lambda n: (n['t'], n['m']))
    power = power + p_intro
    power.sort(key=lambda n: (n['t'], n['m']))

    # 前奏专用加厚层（gain 是唯一有效的杠杆：velocity 只影响 0.4–1.0 的包络）
    intro_pad = [dict(n, m=max(24, n['m'] - 12), v=math2(n['v'] * 0.72))
                 for n in piano if n['b'] < INTRO_END]
    intro_pad.sort(key=lambda n: (n['t'], n['m']))
    intro_stab = [dict(n, v=math2(n['v'] * 0.66)) for n in strings if n['b'] < INTRO_END]
    intro_stab.sort(key=lambda n: (n['t'], n['m']))

    # 前奏持续和声垫（每小节一根，撑住空隙）
    intro_hold = []
    for bar, m in _roots:
        if bar > 10:
            continue
        _r = (m if m <= 52 else m - 12) + 12
        intro_hold.append(dict(t=round(bar * 3 * BEAT, 3), m=max(30, min(92, _r)),
                               d=round(BAR * 0.94, 3), v=82, b=bar * 3.0))
    intro_hold.sort(key=lambda n: (n['t'], n['m']))

    # A 段钢琴 vamp（扒谱 bar 22.6–29.4 主旋律整段休止）：垫一层薄和弦，别像断电
    _vamp = sorted(set((int(n['b'] // 3), n['m']) for n in bass if 22 <= n['b'] / 3.0 < 30.0))
    vamp_pad = []
    for bar, m in _vamp:
        _r = (m if m <= 52 else m - 12) + 12
        vamp_pad.append(dict(t=round(bar * 3 * BEAT, 3), m=max(30, min(92, _r)),
                             d=round(BAR * 0.95, 3), v=70, b=bar * 3.0))
    vamp_pad.sort(key=lambda n: (n['t'], n['m']))

    # 前奏高八度加倍 + 吊镲补点
    oct_intro = [dict(n, m=min(108, n['m'] + 12), v=max(20, int(n['v'] * 0.55)))
                 for n in piano if n['b'] < INTRO_END]
    oct_up = oct_up + oct_intro
    oct_up.sort(key=lambda n: (n['t'], n['m']))

    # 鼓：扒谱 ch9 抽稀 + 段落吊镲 + 过门
    kind_of = {35: 0, 36: 0, 37: 0, 38: 1, 40: 1, 41: 1, 42: 2, 44: 2, 45: 2,
               46: 3, 48: 3, 49: 4, 51: 3, 57: 4, 59: 4}
    raw = []
    for n in notes.get(9, []):
        k = kind_of.get(n['m'])
        if k is None:
            continue
        raw.append((round(n['t'], 3), k, float(n['v'])))
    raw.sort()
    thin = {0: 0.06, 1: 0.085, 2: args.hat_thin, 3: 1.2, 4: 0.0}
    drums, last = [], {}
    for t, k, v in raw:
        g = thin.get(k, 0.0)
        if g and (t - last.get(k, -1e9)) < g:
            continue
        last[k] = t
        drums.append([t, k, int(max(20, min(127, round(v))))])
    # 进场 build：第 9 小节起 16 分军鼓滚奏 + 半音上行 riser
    _A0 = 30.33 * BEAT       # 主旋律第一拍 = 11.37s
    riser = []
    for i in range(24):
        t = _A0 - (24 - i) * BEAT * 0.25
        if t > 0:
            drums.append([round(t, 3), 1, int(34 + i * 3.8)])
            riser.append(dict(t=round(t, 3), d=round(BEAT * 0.24, 3),
                              m=62 + i, v=int(38 + i * 3.6), b=t / BEAT))
    riser.sort(key=lambda n: (n['t'], n['m']))

    # 段落重击
    for bar in (12, 21, 33, 45, 55, 66, 77, 88, 99, 109):
        t = (bar - 2) * BAR
        if 0 <= t < duration - 0.05:
            drums.append([round(t, 3), 4, 104])
            drums.append([round(t, 3), 0, 116])
    # 每 8 小节末尾一拍军鼓过门（B/C/D）
    for bar in range(10, bars, 8):
        name = sec_of_bar(bar)
        if name not in ('B', 'C', 'D'):
            continue
        t0 = bar * BAR
        for i in range(6):
            t = t0 + i * BEAT * 0.25
            if t < duration - 0.3:
                drums.append([round(t, 3), 1, int(54 + i * 9)])
    # C/D 段底鼓加密（第 3 拍后半）
    for bar in range(66, bars):
        t = (bar - 2) * BAR + 2.5 * BEAT
        if 0 < t < duration - 0.3:
            drums.append([round(t, 3), 0, 92])
    drums.sort(key=lambda x: (x[0], x[1]))
    dedup = {}
    for t, k, v in drums:
        key = (round(t, 3), k)
        dedup[key] = max(dedup.get(key, 0), v)
    drums = [[t, k, v] for (t, k), v in sorted(dedup.items())]
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('鼓 %d 击 %s' % (len(drums), cnt))

    def clip(ns):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t'] - 0.02), 3)))
                for n in ns if n['t'] < duration - 0.10]

    lead, lead_lo, oct_up, piano, intro, guitar, strings, organ, counter, bass, sub, gtr, power, riser, intro_pad, intro_stab, intro_hold, vamp_pad = (
        clip(x) for x in (lead, lead_lo, oct_up, piano, intro, guitar, strings, organ,
                          counter, bass, sub, gtr, power, riser, intro_pad, intro_stab,
                          intro_hold, vamp_pad))
    drums = [d for d in drums if d[0] < duration - 0.02]
    print('主旋律 %d 音，止于 %.2fs / 全长 %.2fs' % (len(lead), max(n['t'] for n in lead), duration))
    for b in range(0, 112, 8):
        t0, t1 = b * BAR, (b + 8) * BAR
        print('  小节 %3d-%3d  t %6.1f-%6.1f  lead %2d  鼓 %3d' % (
            b, b + 8, t0, t1, sum(1 for n in lead if t0 <= n['t'] < t1),
            sum(1 for d in drums if t0 <= d[0] < t1)))
    if args.check:
        return

    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=SPEC['bpm'],
                tracks=[dict(wave='square', gain=args.lead_gain, notes=lead),
                        dict(wave='square', gain=args.lead_lo_gain, notes=lead_lo),
                        dict(wave='square', gain=args.oct_gain, notes=oct_up),
                        dict(wave='triangle', gain=args.piano_gain, notes=piano),
                        dict(wave='triangle', gain=args.intro_gain, notes=intro),
                        dict(wave='triangle', gain=args.guitar_gain, notes=guitar),
                        dict(wave='triangle', gain=args.strings_gain, notes=strings),
                        dict(wave='triangle', gain=args.organ_gain, notes=organ),
                        dict(wave='triangle', gain=args.counter_gain, notes=counter),
                        dict(wave='sawtooth', gain=args.gtr_gain, notes=gtr),
                        dict(wave='sawtooth', gain=args.power_gain, notes=power),
                        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
                        dict(wave='sine', gain=args.sub_gain, notes=sub),
                        dict(wave='triangle', gain=0.058, notes=riser),
                        dict(wave='triangle', gain=args.intro_pad_gain, notes=intro_pad),
                        dict(wave='square', gain=0.028, notes=intro_stab),
                        dict(wave='triangle', gain=0.050, notes=intro_hold),
                        dict(wave='triangle', gain=0.045, notes=vamp_pad)],
                drums=drums)
    data['reasons'] = [
        '主旋律大纲 = 原曲：扒谱 ch3 小号顶线一个音不改（585 音）',
        '蓝图 = 194s 那版：开场即满、乐队式重量 —— 重排到 160 BPM 的 3/4 圆舞网格，节奏型照搬',
        '整体 −1 半音落到原曲的 D 小调；扒谱的 −12 加倍（ch10）留作厚度',
        '加重：锯齿 power chord 每小节 2、3 拍（B/C/D 段）、高潮段主旋律 +12 加倍、段落吊镲、8 小节一次军鼓过门、C/D 段底鼓加密',
        '伴奏仍取扒谱原声部：ch2 钢琴圆舞琶音、ch8 前奏钢琴、ch5 吉他分解、ch4/ch12 弦乐、ch14 管风琴、ch7 高音对句、ch11 失真吉他',
    ]
    head = '''/**
 * EX 中段《亡き王女の為のセプテット》—— 血月圆舞编 v2（主旋律照原曲 / 编制照 194s 蓝本）。
 * tools/ex_septette2.py 生成，勿手改。
 */
'''
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()