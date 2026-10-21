#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/pre4_fall.py —— 08 四面道中《フォールオブフォール ～ 秋めく滝》瀑布动机编。

主旋律 = 原曲开头的电钢「瀑布」动机（Samidare 扒谱 ch0，4.05 秒起），
不是 ch2 那条（ch2 是后半的副线，用户 m01940 否掉）。

蓝本：
  ref4a Marble Records 編（~110 BPM，0–120Hz 36–43%，RMS 0.245）
  ref4b Foxtail-Grass Studio《ささぶね》（106 BPM，120–500Hz 占 65%）
  ref4c Alstroemeria Records《Bad Apple》（138 BPM，0–120Hz 37–65%，压缩到头）
  原曲 ZUN TH10（163 BPM）

取法：旋律保持原速 163 BPM（用户确认），鼓做半速感（1、3 拍底鼓 + 2、4 军鼓）
      贴两条慢蓝本 ~106–110 的呼吸；和风木质层（尼龙吉他 / 弦乐）+ 电子重低频（saw + sub）。

用法：
    python tools/pre4_fall.py --check
    python tools/pre4_fall.py --src-bars 36 --intro-bars 4 --tail-bars 4
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
                   '10 - Mountain of Faith', '8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'fall_pre4.js')
EXPORT = 'FALL_PRE4'

SPEC = dict(key='pre4', title='フォールオブフォール ～ 秋めく滝（秋瀑编）', bpm=163.0,
            src_t0=27.61, intro_t0=4.05, tail_src_t0=0.0, src_bars=32, intro_bars=4, tail_bars=8)


def to_dict(n):
    return n if isinstance(n, dict) else dict(t=n[0], m=n[1], d=n[2], v=n[3])


def window(notes, t0, t1):
    out = [dict(t=round(n['t'] - t0, 3), m=int(n['m']), d=round(n['d'], 3), v=int(n['v']))
           for n in (to_dict(x) for x in notes) if t0 <= n['t'] < t1]
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def shift(notes, dt):
    out = [dict(t=round(n['t'] + dt, 3), m=n['m'], d=n['d'], v=n['v']) for n in notes]
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def fade_in(notes, seconds, floor=0.30):
    out = []
    for n in notes:
        k = min(1.0, n['t'] / seconds) if seconds > 0 else 1.0
        out.append(dict(t=n['t'], m=n['m'], d=n['d'], v=max(1, int(round(n['v'] * (floor + (1 - floor) * k))))))
    return out


def half_drums(bars, bar, beat, kick=108, snare=100, hat=46, hat16=30, open_hat=70, crash=88):
    """半速感：底鼓 1、3 拍，军鼓 2、4 拍，八分闭镲，反拍开镲，每 8 小节吊镲。"""
    d = []
    for b in range(bars):
        base = b * bar
        for k in (0, 2):
            d.append((round(base + k * beat, 3), 0, kick + (6 if k == 0 else 0)))
        for k in (1, 3):
            d.append((round(base + k * beat, 3), 1, snare))
        for k in range(8):
            d.append((round(base + k * beat / 2.0, 3), 2, hat if k % 2 == 0 else int(hat * 0.78)))
        for k in (1, 3):
            d.append((round(base + k * beat + beat / 2.0, 3), 3, open_hat))
        if b % 8 == 0:
            d.append((round(base, 3), 4, crash))
        if b % 8 == 7:
            for k in (2.5, 2.75, 3.0, 3.25, 3.5, 3.75):
                d.append((round(base + k * beat, 3), 1, int(snare * 0.66)))
    return sorted(d)


def sub_copy(notes, drop=12):
    return [dict(t=n['t'], m=max(21, n['m'] - drop), d=n['d'], v=n['v']) for n in notes]


def chord_pad(bars, bar, beat, chord, gain_hint):
    """前奏用的持续和弦垫：chord 是三个 MIDI 音高。"""
    out = []
    for b in range(bars):
        for k in range(4):
            v = 40 + 8 * k + gain_hint
            for m in chord:
                out.append(dict(t=round(b * bar + k * beat, 3), m=m, d=round(beat * 0.95, 3), v=v))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=SPEC['bpm'])
    ap.add_argument('--src-bars', type=int, default=SPEC['src_bars'])
    ap.add_argument('--body-t0', type=float, default=0.0, help='主体素材起点（秒）；0=用默认')
    ap.add_argument('--tail-src-t0', type=float, default=0.0, help='尾声素材起点（秒）；0=用默认 15.83')
    ap.add_argument('--lead-mode', choices=['ch2', 'merged'], default='ch2')
    ap.add_argument('--intro-bars', type=int, default=SPEC['intro_bars'])
    ap.add_argument('--tail-bars', type=int, default=SPEC['tail_bars'])
    ap.add_argument('--lead-gain', type=float, default=0.20)
    ap.add_argument('--flute-gain', type=float, default=0.05)
    ap.add_argument('--sparkle-gain', type=float, default=0.06)
    ap.add_argument('--bass-gain', type=float, default=0.13)
    ap.add_argument('--sub-gain', type=float, default=0.15)
    ap.add_argument('--pad-gain', type=float, default=0.10)
    ap.add_argument('--strings-gain', type=float, default=0.09)
    ap.add_argument('--guitar-gain', type=float, default=0.05)
    ap.add_argument('--koto-gain', type=float, default=0.04)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    src_bpm = M.bpm_of(segs)
    bar = 4 * 60.0 / args.bpm
    beat = 60.0 / args.bpm
    t0 = args.body_t0 or SPEC['src_t0']   # 主体起点；默认 15.83s = ch2 主旋律前 8 小节处
    t0_intro = SPEC['intro_t0']    # 开头电钢「瀑布」动机 4.05s
    span = args.src_bars * bar
    bars = args.intro_bars + args.src_bars + args.tail_bars
    duration = bars * bar
    print('原曲 %.1f BPM；目标 %.1f BPM；%d 小节 / %.3fs（前奏 %d + 主体 %d + 尾声 %d）'
          % (src_bpm, args.bpm, bars, duration, args.intro_bars, args.src_bars, args.tail_bars))

    # 主旋律分两段（与原曲结构一致）：
    #   0–16 小节 = 开头电钢瀑布动机（ch0 主 + ch1 内声部，合成一条单音线）
    #   16 小节之后 = 27.61s 进的主旋律（ch2），笛子（ch3）叠八度
    # 主旋律来源（--lead-mode）：
    #   ch2    = v15 那版（用户 m02046 认可的主体），27.61s 起的主音线
    #   merged = 电钢(ch0/ch1) + 主音(ch2) + 笛(ch3) 合成的连续顶声部（旋律更满，但会改变 v15 的织体）
    if args.lead_mode == 'merged':
        mel_pool = (list(chans[0]['notes']) + list(chans[1]['notes'])
                    + list(chans[2]['notes']) + list(chans[3]['notes']))
    else:
        mel_pool = list(chans[2]['notes'])
    # 主体开头的两小节 ch2 还没进（原曲 30.55s 才起长音），先用电钢顶声部垫住，
    # 避免接缝后面立刻出现「没旋律」的空档（用户 m02046 的衔接问题之一）
    split_rel = max(0.0, 30.55 - t0)
    lead_a = [n for n in window(M.mono_ize(list(chans[0]['notes']) + list(chans[1]['notes']), keep='high'),
                                t0, t0 + span) if n['t'] < split_rel]
    lead_b = [n for n in window(M.mono_ize(mel_pool, keep='high'), t0, t0 + span) if n['t'] >= split_rel]
    lead = sorted(lead_a + lead_b, key=lambda x: (x['t'], x['m']))
    flute = [dict(t=n['t'], m=n['m'], d=n['d'], v=int(n['v'] * 0.85))
             for n in window(M.cap_poly(chans[3]['notes'], 2), t0, t0 + span)]
    intro_lead = window(M.mono_ize(list(chans[0]['notes']) + list(chans[1]['notes']), keep='high'),
                        t0_intro, t0_intro + args.intro_bars * bar)
    print('主旋律两段：钢琴瀑布 %d 音（0–%.2fs）+ ch2 主线 %d 音（%.2fs 起）；前奏另取 %d 音'
          % (len(lead_a), split_rel, len(lead_b), split_rel, len(intro_lead)))
    # pad/strings 在原曲里就是「把主旋律再加倍一次」，同音区铺着会把旋律糊成和弦 → 整体降八度
    pad = [dict(t=n['t'], m=n['m'] - 12, d=n['d'], v=n['v'])
           for n in window(M.cap_poly(chans[5]['notes'], 2), t0, t0 + span)]
    strings = [dict(t=n['t'], m=n['m'] - 12, d=n['d'], v=n['v'])
               for n in window(M.cap_poly(chans[7]['notes'], 2), t0, t0 + span)]
    guitar = window(M.cap_poly(chans[6]['notes'], 2), t0, t0 + span)
    koto = window(chans[6]['notes'], t0, t0 + span)
    bass = window(M.mono_ize(chans[8]['notes'], keep='low'), t0, t0 + span)
    print('素材：lead %d / pad %d / strings %d / guitar %d / guitar-all %d / bass %d'
          % (len(lead), len(pad), len(strings), len(guitar), len(koto), len(bass)))

    # 琴：把吉他琶音抽成 16 分华彩（每 0.06s 最多一音）
    gem = []
    last = -1e9
    for n in sorted((to_dict(x) for x in koto), key=lambda x: (x['t'], -x['m'])):
        if n['t'] - last < 0.055:
            continue
        m = n['m']
        while m < 64: m += 12
        while m > 91: m -= 12
        gem.append(dict(t=n['t'], m=m, d=min(0.22, max(0.08, n['d'])), v=min(96, 40 + int(n['v'] * 0.6))))
        last = n['t']

    off = args.intro_bars * bar
    lead = sorted(shift(lead, off) + intro_lead, key=lambda x: (x['t'], x['m']))
    # 主旋律高八度「铃」：只跟长音起头，帮旋律从和声里切出来
    sparkle = [dict(t=n['t'], m=min(96, n['m'] + 12), d=min(0.30, n['d']), v=int(n['v'] * 0.7)) for n in lead]
    flute = shift(flute, off)
    pad = shift(pad, off)
    strings = shift(strings, off)
    guitar = shift(guitar, off)
    gem = shift(gem, off)
    bass = shift(bass, off)

    # 尾声：复制主体开头 tail 小节（有旋律的那段）挪到末尾，循环时自然接回前奏
    # 尾声 = 原曲 15.83s 起的钢琴变奏段（用户 m02046：v15 几处衔接强硬）
    # 这样「主体 → 尾声 → 前奏」是一条连续的乐句流，不会在结尾突然重复开头
    dst = (bars - args.tail_bars) * bar
    # 尾声默认「接着主体往下走」——这样主体→尾声根本不是接缝，是同一段音乐的延续；
    # 走到 74.73+8 小节 = 86.51s 时，正好是原曲里与前奏（4.05s）同和弦（B-G-D-A）同旋律（74）的位置，循环回前奏等于原曲自己接自己
    tail_src = args.tail_src_t0 or SPEC['tail_src_t0'] or (t0 + args.src_bars * bar)
    tail_span = args.tail_bars * bar - 0.02
    tail_tracks = {
        'lead': window(M.mono_ize(list(chans[0]['notes']) + list(chans[1]['notes']) + mel_pool, keep='high'),
                       tail_src, tail_src + tail_span),
        'pad': [dict(t=n['t'], m=n['m'] - 12, d=n['d'], v=n['v'])
                for n in window(M.cap_poly(chans[5]['notes'], 2), tail_src, tail_src + tail_span)],
        'strings': [dict(t=n['t'], m=n['m'] - 12, d=n['d'], v=n['v'])
                    for n in window(M.cap_poly(chans[7]['notes'], 2), tail_src, tail_src + tail_span)],
        'guitar': window(M.cap_poly(chans[6]['notes'], 2), tail_src, tail_src + tail_span),
        'bass': window(M.mono_ize(chans[8]['notes'], keep='low'), tail_src, tail_src + tail_span),
    }
    tail_tracks['gem'] = [dict(t=n['t'], m=min(91, max(64, n['m'])), d=min(0.22, max(0.08, n['d'])), v=n['v'])
                          for n in tail_tracks['guitar']]
    tail_tracks['sparkle'] = [dict(t=n['t'], m=min(96, n['m'] + 12), d=min(0.30, n['d']), v=int(n['v'] * 0.7))
                              for n in tail_tracks['lead']]
    tail_tracks['flute'] = [dict(t=n['t'], m=n['m'], d=n['d'], v=int(n['v'] * 0.85))
                            for n in window(M.cap_poly(chans[3]['notes'], 2), tail_src, tail_src + tail_span)]
    for tr, seg in ((lead, tail_tracks['lead']), (sparkle, tail_tracks['sparkle']),
                    (flute, tail_tracks['flute']), (pad, tail_tracks['pad']),
                    (strings, tail_tracks['strings']), (guitar, tail_tracks['guitar']),
                    (gem, tail_tracks['gem']), (bass, tail_tracks['bass'])):
        tr.extend(shift(seg, dst))
        tr.sort(key=lambda x: (x['t'], x['m']))
    print('尾声取自原曲 %.2fs 的钢琴变奏 %d 音（放在 %.2fs）'
          % (tail_src, len(tail_tracks['lead']), dst))

    # 前奏：用主体第一小节的和弦做垫 + 琴，主旋律第 4 小节进
    first_bar_pad = [n for n in pad if off <= n['t'] < off + bar]
    pcs = []
    for n in first_bar_pad:
        if n['m'] % 12 not in pcs:
            pcs.append(n['m'] % 12)
    chord = [48 + pc for pc in pcs[:3]] or [48, 52, 55]
    intro = chord_pad(args.intro_bars, bar, beat, chord, gain_hint=0)
    intro += [dict(t=round(b * bar + k * beat, 3), m=chord[0] - 12, d=round(beat * 0.9, 3), v=96)
              for b in range(args.intro_bars) for k in range(4)]
    pad = sorted(pad + intro, key=lambda x: (x['t'], x['m']))

    # 收尾裁剪：任何越过循环终点的音都截断（否则循环接缝会多出半个音）
    def clip(track):
        out = []
        for n in track:
            if n['t'] >= duration - 0.10:      # 贴边的残音直接丢掉，别截半口气
                continue
            d = min(n['d'], duration - n['t'])
            out.append(dict(t=n['t'], m=n['m'], d=max(0.05, round(d, 3)), v=n['v']))
        return out
    lead, sparkle, flute, pad, strings, guitar, gem, bass = (clip(x) for x in (lead, sparkle, flute, pad, strings, guitar, gem, bass))

    lead = fade_in(lead, 4.0, floor=0.45)

    # 前奏本来只有垫子和前奏旋律，5.89s 主体一进 RMS 从 0.05 跳到 0.13（+8dB，硬）
    # → 前奏的伴奏层整体抬 35%，主体第一小节把琴/吉他/铃压到 30% 再渐入
    def boost_before(track, t_lim, k):
        return [dict(t=n['t'], m=n['m'], d=n['d'], v=min(127, int(round(n['v'] * k)))) if n['t'] < t_lim else n
                for n in track]

    pad = boost_before(pad, off, 1.35)
    strings = boost_before(strings, off, 1.35)
    guitar = boost_before(guitar, off, 1.3)
    bass = boost_before(bass, off, 1.25)
    def _ramp(tr, t0_, t1_, lo):
        return [dict(t=n['t'], m=n['m'], d=n['d'],
                     v=max(1, int(round(n['v'] * (lo + (1 - lo) * (n['t'] - t0_) / max(1e-6, t1_ - t0_))))))
                if t0_ <= n['t'] < t1_ else n for n in tr]

    gem = _ramp(gem, off, off + 1.5 * bar, 0.30)
    guitar = _ramp(guitar, off, off + 1.5 * bar, 0.55)
    sub = sub_copy(bass)

    def seam_fill(t, vel=92):
        """接缝：t 前两拍十六分军鼓渐强 + t 正拍吊镲。"""
        out = []
        for i in range(8):
            tt = t - beat * 2 + i * beat / 4.0
            if tt >= 0:
                out.append((round(tt, 3), 1, int(vel * 0.42 + i * vel * 0.07)))
        out.append((round(t, 3), 4, 96))
        return out

    drums = half_drums(bars, bar, beat)
    # 前两小节只留底鼓，第 3 小节起加军鼓/镲
    drums = [d for d in drums if d[0] >= 2 * bar or d[1] == 0]
    drums = sorted(drums + seam_fill(off) + [(0.0, 4, 86)])

    def soft_entry(track, t0_, t1_, lo=0.45):
        """接缝处让伴奏层在两小节内渐入，避免所有层同一拍砸进来。"""
        out = []
        for n in track:
            if t0_ <= n['t'] < t1_:
                k = lo + (1.0 - lo) * (n['t'] - t0_) / max(1e-6, t1_ - t0_)
                out.append(dict(t=n['t'], m=n['m'], d=n['d'], v=max(1, int(round(n['v'] * k)))))
            else:
                out.append(n)
        return out

    for tr_name in ('pad', 'strings', 'guitar', 'gem', 'flute', 'sparkle'):
        pass
    pad = soft_entry(pad, off, off + 2 * bar)
    strings = soft_entry(strings, off, off + 2 * bar)
    guitar = soft_entry(guitar, off, off + 2 * bar)
    gem = soft_entry(gem, off, off + 2 * bar)
    flute = soft_entry(flute, off + bar, off + 3 * bar, lo=0.55)
    sparkle = soft_entry(sparkle, off + bar, off + 3 * bar, lo=0.55)
    # 尾声不再是换段（连续乐句），不做渐入
    print('成品：lead %d / flute %d / bass %d / sub %d / pad %d / strings %d / guitar %d / gem %d / drums %d'
          % (len(lead), len(flute), len(bass), len(sub), len(pad), len(strings), len(guitar), len(gem), len(drums)))
    if max(n['t'] for n in lead) >= duration:
        print('!! 主旋律超出长度')
    if args.check:
        return
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=round(duration, 3), bpm=int(round(args.bpm)),
                tracks=[dict(wave='square', gain=args.lead_gain, notes=lead),
                        dict(wave='triangle', gain=args.sparkle_gain, notes=sparkle),
                        dict(wave='triangle', gain=args.flute_gain, notes=flute),
                        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
                        dict(wave='sine', gain=args.sub_gain, notes=sub),
                        dict(wave='triangle', gain=args.pad_gain, notes=pad),
                        dict(wave='triangle', gain=args.strings_gain, notes=strings),
                        dict(wave='triangle', gain=args.guitar_gain, notes=guitar),
                        dict(wave='triangle', gain=args.koto_gain, notes=gem)],
                drums=drums)
    data['reasons'] = ['主旋律 = 原曲开头的电钢瀑布动机（Samidare 扒谱 ch0，4.05s 起），163 BPM 原速不转调',
                       '蓝本：Marble Records ~110BPM 重低频 + Foxtail-Grass ささぶね 106BPM 木质中低 + Alstroemeria Bad Apple 138BPM 重 sub',
                       '半速感鼓型（1、3 底鼓 / 2、4 军鼓）+ 和风尼龙吉他/弦乐/琴 + 电子 saw 贝斯与正弦 sub']
    head = """/**
 * 四面道中《フォールオブフォール ～ 秋めく滝》—— 瀑布动机 × 和风 × 重低频。
 * 旋律取 TH10 原曲开头的电钢动机（Samidare 扒谱 ch0），163 BPM；
 * tools/pre4_fall.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
