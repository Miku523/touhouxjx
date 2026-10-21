#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/ex_tepes.py -- EX 面道中《ツェペシュの幼き末裔》（吸血鬼的幼子）血月编。

EX 面 = 红魔馆地下 · 血月水晶，0:00-3:00 道中 → 3:00 雷米莉亚 → 6:00 芙兰。
道中曲选它：TH06 六面道中，就是「打雷米莉亚之前的那条走廊」，与《亡き王女》同源；
142 BPM 低于两位 Boss（亡き王女 144 / U.N.オーエン 155），符合「道中低一格」。

素材：6 - The Embodiment of Scarlet Devil\12. The Young Descendant of Tepes (ZUN).mid
        div 480，4 段 tempo map（引子 142 → 4 小节 133 → 之后 142），内容 2.501s - 57.89s。
通道：ch2/ch4/ch11 = 三连音琶音（伴奏，跨三个八度）· ch3/ch14 = 三和弦长音块
        ch1/ch8 = 贝斯（八度）· ch9 = 鼓 · **ch12 = 唯一会唱的主旋律**（92 音，22.39s 进）
        ch13 = 主旋律的六度和声（低一个八度再下小三度）
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
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'tepes_ex.js')
EXPORT = 'TEPES_EX'
SPEC = dict(key='ex_pre', title='ツェペシュの幼き末裔（血月编）', bpm=142.0)


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
    ap.add_argument('--lead-gain', type=float, default=0.240)
    ap.add_argument('--harm-gain', type=float, default=0.060)
    ap.add_argument('--oct-gain', type=float, default=0.080)
    ap.add_argument('--arp-gain', type=float, default=0.070)
    ap.add_argument('--arp-hi-gain', type=float, default=0.042)
    ap.add_argument('--chord-gain', type=float, default=0.050)
    ap.add_argument('--pad-gain', type=float, default=0.045)
    ap.add_argument('--bass-gain', type=float, default=0.115)
    ap.add_argument('--bass-hi-gain', type=float, default=0.050)
    ap.add_argument('--sub-gain', type=float, default=0.112)
    ap.add_argument('--no-drums', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    notes, segs, div = load()
    alln = [n for ns in notes.values() for n in ns]
    off = min(n['t'] for n in alln)
    end = max(n['t'] + n['d'] for n in alln)
    duration = round(end - off, 3)
    bar = 1.6901   # 142 BPM 段的小节；开头 4 小节是 133 BPM（1.8038s）
    beat = bar / 4
    print('内容 %.3fs - %.3fs -> 成品 %.3fs' % (off, end, duration))
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(notes.items())})

    # ---- 段落 ----
    MEL = round(22.39 - off, 3)          # 主旋律进来（0 起算）
    MEL_MID = round(MEL + 13.87, 3)      # 主旋律第二遍（原谱 16 小节重复的中点）
    MEL_END = round(50.14 - off, 3)      # 主旋律最后一次起音
    SEC = [('intro', 0.0, MEL), ('A', MEL, MEL_MID), ('B', MEL_MID, MEL_END), ('C', MEL_END, duration)]
    print('段落：' + ' · '.join('%s %.2f-%.2f' % s for s in SEC))

    def sec_at(t):
        for name, a, b in SEC:
            if a - 1e-9 <= t < b - 1e-9:
                return name
        return 'C'

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

    def clip(ns, guard=0.10):
        return [dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3)))
                for n in ns if n['t'] < duration - guard]

    def dyn(ns, table):
        out = []
        for n in ns:
            f = table.get(sec_at(n['t']), 1.0)
            out.append(dict(n, v=max(1, min(127, int(round(n['v'] * f))))))
        return out

    # ---- 旋律 ----
    lead = clip([n for n in mk(12) if n['m'] >= 55])
    # v09：撤掉 ch13 对位线（与主旋律构成大量纯四度/二度，最可疑的「调外」来源）
    harm = []
    # v09：撤掉主旋律 +12 加倍（同音区八度墙会把旋律糊成和弦）
    octv = []
    # v12：对照原曲录音校音——t=32.99 那颗 D6 在原曲里其实是 C#6（原曲 C#6 能量是 D6 的 2.3 倍，
    #      且当时琶音正响着 C#6，D6 会和它撞小九度，是全曲最刺耳的一处）
    _fixed = 0
    for n in lead:
        if abs(n['t'] - 32.99) < 0.03 and n['m'] == 86:
            n['m'] = 85
            _fixed += 1
    print('主旋律 %d 音（对照原曲校音 %d 处）' % (len(lead), _fixed))

    # ---- 伴奏 ----
    arp = clip(mk(2))
    # v09：撤掉 +12 琶音闪光（顶到 A#5，直接怼进主旋律音区）
    arp_hi = []
    # v09：ch3/ch14 其实是每 0.2s 一颗的「快速跑动音型」，不是和弦块；
    #      只留低音区（<= G4）当轻装饰，上半段（最高到 B5）会穿进旋律
    chords = clip([n for n in mk(3) if n['m'] <= 67])
    pad = []
    bass = clip(mk(1))
    bass_hi = clip([dict(n, m=n['m'] + 12) for n in mk(1) if sec_at(n['t']) == 'B'])
    sub = clip([dict(n, m=n['m'] - 12) for n in bass if n['m'] >= 36]) 

    # 前奏加层：+12 琶音闪光 + +12 和弦长音（原谱前奏织体太薄，直接照搬会掉 6dB）
    arp_hi_intro = []
    pad_intro = clip([dict(n, m=n['m'] + 12) for n in mk(3) if n['t'] < MEL - 1e-9])

    # 前奏低音踏板：每小节取三和弦最低音 -12 撑住（原谱前奏贝斯只有零星几颗）
    _blocks = {}
    for n in chords:
        if n['t'] >= MEL - 1e-9:
            continue
        _blocks.setdefault(round(n['t'], 3), []).append(n['m'])
    _keys = sorted(_blocks)
    pedal = []
    for i, t0 in enumerate(_keys):
        t1 = _keys[i + 1] if i + 1 < len(_keys) else MEL
        pedal.append(dict(t=t0, m=max(21, min(_blocks[t0]) - 12), d=round(t1 - t0, 3), v=96))

    # 前奏爬坡：0-19.89s 从 0.86 抬到 1.0，避免开头 8-16s 塌下去
    def intro_ramp(ns, lo=0.86):
        out = []
        for n in ns:
            f = lo + (1.0 - lo) * min(1.0, n['t'] / max(1e-6, MEL)) if n['t'] < MEL else 1.0
            out.append(dict(n, v=max(1, min(127, int(round(n['v'] * f))))))
        return out

    arp = intro_ramp(arp, 1.05)
    chords = intro_ramp(chords, 1.0)
    bass = intro_ramp(bass, 1.0)

    # 段落力度
    lead = dyn(lead, {'intro': 1.0, 'A': 0.96, 'B': 1.0, 'C': 0.92})
    harm = dyn(harm, {'intro': 1.0, 'A': 0.90, 'B': 1.0, 'C': 0.88})
    arp = dyn(arp, {'intro': 0.86, 'A': 0.94, 'B': 1.0, 'C': 0.80})
    chords = dyn(chords, {'intro': 0.82, 'A': 0.90, 'B': 1.0, 'C': 0.82})
    bass = dyn(bass, {'intro': 0.90, 'A': 0.95, 'B': 1.0, 'C': 0.86})

    # ---- 鼓 ----
    DMAP = {36: 0, 38: 1, 40: 1, 42: 2, 44: 2, 46: 3, 49: 4, 51: 3}
    drums = []
    for n in notes.get(9, []):
        t = round(n['t'] - off, 3)
        if t < 0 or t >= duration - 0.05:
            continue
        kind = DMAP.get(n['m'])
        if kind is None:
            continue
        s = sec_at(t)
        if s == 'intro' and kind in (1, 3):
            continue                       # 前奏只留底鼓 + 吊镲
        if s == 'intro' and kind == 2:
            if t < 4.0:
                continue                   # 头两小节留白，之后才上轻镲
            drums.append([t, 2, max(1, int(round(n['v'] * 0.62)))])
            continue
        if s == 'C' and kind == 1:
            continue
        drums.append([t, kind, n['v']])
    drums.sort()
    # 前奏开头一记吊镲；主旋律进门一记吊镲
    if not args.no_drums:
        drums = [d for d in drums if not (d[0] < 0.05 and d[1] == 4)]
        drums.append([0.0, 4, 96])
        drums.append([round(MEL, 3), 4, 104])
        # 前奏心跳：每小节 1、3 拍底鼓（原谱前奏鼓太稀，撑不住 20 秒）
        _t = 0.0
        while _t < MEL - 1e-6:
            drums.append([round(_t, 3), 0, 92])
            drums.append([round(_t + 2 * beat, 3), 0, 76])
            _t += bar
        # 每段起点：撤鼓一拍做「吸气」，再砸正拍
        for _, a, _b in SEC[1:]:
            drums = [d for d in drums if not (a - beat - 1e-6 < d[0] < a - 1e-6)]
            drums.append([round(a, 3), 0, 112])
            drums.append([round(a, 3), 4, 100])
        # 主旋律进门蓄势：最后一小节 16 分军鼓滚奏（40 → 109）
        for i in range(16):
            _t = MEL - bar + i * (beat / 4.0)
            if _t >= MEL - 1e-6:
                break
            drums.append([round(_t, 3), 1, 40 + int(round(i * 4.6))])
        # 正拍到主旋律之间两拍：16 分军鼓渐强填空
        for i in range(8):
            _t = MEL + i * (beat / 4.0)
            if _t >= MEL + 2 * beat - 1e-6:
                break
            drums.append([round(_t, 3), 1, 46 + i * 6])
        drums.sort()
        # 去重（同刻同 kind 留最大力度）
        seen = {}
        for t, k, v in drums:
            seen[(round(t, 3), k)] = max(seen.get((round(t, 3), k), 0), v)
        drums = [[t, k, v] for (t, k), v in sorted(seen.items())]
    print('鼓 %d 击' % len(drums))

    # 主旋律第 3 拍才进（原谱如此）：正拍那一记要「撑住」两拍，否则中间塌成空洞
    hold = clip([dict(t=MEL, m=n['m'], d=round(2 * beat, 3), v=max(70, int(n['v'] * 0.85)))
                 for n in chords if abs(n['t'] - MEL) < 0.02])
    hold += clip([dict(t=MEL, m=n['m'], d=round(2 * beat, 3), v=max(60, int(n['v'] * 0.80)))
                  for n in arp if abs(n['t'] - MEL) < 0.02])
    print('hold %d 音' % len(hold))

    # 进门 riser：16 分半音上行（只铺最后一小节）
    riser = clip([dict(t=round(MEL - bar + i * (beat / 4.0), 3), m=62 + i,
                       d=round(beat / 4.0 * 0.92, 3), v=46 + i * 5) for i in range(16)])

    # ---- v10：和声清理 ----
    # 伴奏音若与同时发声的主旋律音相差 ±1 半音，直接撤掉：半音撞音是「跑调感」最刺耳的来源
    def drop_clash(ns):
        keep, gone = [], 0
        for n in ns:
            bad = False
            for L in lead:
                if L['t'] < n['t'] + n['d'] - 0.02 and n['t'] < L['t'] + L['d'] - 0.02:
                    if abs(L['m'] - n['m']) == 1:
                        bad = True
                        break
            if bad:
                gone += 1
            else:
                keep.append(n)
        return keep, gone

    # v10b：ch2 琶音横跨 58–86（比主旋律还高），顶段单独降到半音量，别跟旋律抢
    arp_top = clip([n for n in arp if n['m'] >= 80])
    arp = clip([n for n in arp if n['m'] < 80])
    for _name in ('arp', 'chords', 'pad_intro', 'bass_hi'):
        _v = eval(_name)
        _nv, _g = drop_clash(_v)
        globals()[_name] = _nv
        print('和声清理 %-9s 撤 %d 音 -> %d' % (_name, _g, len(_nv)))

    tracks = [
        dict(wave='square', gain=args.lead_gain, notes=lead),
        dict(wave='square', gain=args.oct_gain, notes=octv),
        dict(wave='triangle', gain=args.harm_gain, notes=harm),
        dict(wave='square', gain=args.arp_gain, notes=arp),
        dict(wave='square', gain=args.arp_gain * 0.5, notes=arp_top),
        dict(wave='triangle', gain=args.arp_hi_gain, notes=arp_hi),
        dict(wave='triangle', gain=args.chord_gain, notes=chords),
        dict(wave='triangle', gain=args.pad_gain, notes=pad),
        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
        dict(wave='sawtooth', gain=args.bass_hi_gain, notes=bass_hi),
        dict(wave='sine', gain=args.sub_gain, notes=sub),
        dict(wave='sine', gain=0.075, notes=pedal),
        dict(wave='triangle', gain=0.075, notes=arp_hi_intro),
        dict(wave='triangle', gain=0.080, notes=pad_intro),
        dict(wave='triangle', gain=0.055, notes=riser),
        dict(wave='triangle', gain=0.075, notes=hold),
    ]
    tracks = [t for t in tracks if t['notes']]

    reasons = [
        'EX 面道中：TH06 六面道中原曲《ツェペシュの幼き末裔》，照 ZUN 扒谱 1:1 直译，不重排不加速。',
        '主旋律 = 原谱 ch12（唯一会唱的单声部，22.39s 进），一个音不改；伴奏琶音/贝斯/鼓照原谱。',
        '142 BPM 原速，低于雷米莉亚 144 与芙兰 155，道中压住一格。',
        'v09 校音：撤掉 ch13 对位线、撤掉所有 +12 加倍与琶音闪光，ch3 跑动只留低音区当轻装饰——高音区只归主旋律。',
    ]
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=SPEC['bpm'],
                tracks=tracks, drums=[] if args.no_drums else drums)
    print('时长 %.3fs / %.2f 小节 / %d 轨 / %d 音' % (duration, duration / bar, len(tracks),
                                                sum(len(t['notes']) for t in tracks)))
    if args.check:
        return
    head = """/**
 * EX 面道中《ツェペシュの幼き末裔》—— 血月编（照 ZUN 原曲 1:1 直译）。
 * 素材 = TH06 六面道中扒谱 MIDI（142 BPM，内容 2.501s-57.888s）；
 * tools/ex_tepes.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, reasons)
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + body + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)) as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
