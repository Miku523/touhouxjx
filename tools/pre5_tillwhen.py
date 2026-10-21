#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/pre5_tillwhen.py —— 10 五面道中《広有射怪鳥事 ～ Till When?》（原曲主打编）。

蓝本（用户 m02206 指定三首，第一首原曲要占大头主旋律）：
  refA 上海アリス幻樂団《広有射怪鳥事 ～ Till When?》237s / 155 BPM（= 原曲本尊，主旋律来源）
  refB 来夢緑《広有射怪鳥事》152s / 150.25 BPM（真鼓摇滚，kick 能量弱、snare 强）
  refC TAMUSIC《広有射怪鳥事》258s / 167.75 BPM（小提琴主奏、A 小调）
取法：主旋律 100% 用 ZUN 原曲 ch0（含前奏的 F/A 踏板和音），155 BPM 原速不转调；
伴奏织体取摇滚（ch2 八分贝斯 + ch9 真鼓）+ 弦乐铺底 + 琶音。

素材：7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid
原曲时间轴：1.548s = bar 1，bar = 1.5484s，主题在 32.516s（bar 21）进，106.84s 结束（68 小节）。

用法：
    python tools/pre5_tillwhen.py --check
    python tools/pre5_tillwhen.py                  # 完整原曲 68 小节 / 105.29s
    python tools/pre5_tillwhen.py --intro-cut 8    # 前奏砍成 8 小节，56 小节 / 86.71s
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
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'tillwhen_pre5.js')
EXPORT = 'TILLWHEN_PRE5'

SPEC = dict(key='pre5', title='広有射怪鳥事 ～ Till When?（妖鳥编）', bpm=155.0,
            src_t0=1.548, theme_t0=32.516, src_end=106.84, bars=68, theme_bar=20)


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


def sub_copy(notes, drop=12):
    return [dict(t=n['t'], m=max(21, n['m'] - drop), d=n['d'], v=n['v']) for n in notes]


def gate(notes, t_hi, k):
    return [dict(t=n['t'], m=n['m'], d=n['d'], v=max(1, int(round(n['v'] * k)))) if n['t'] < t_hi else n
            for n in notes]


def ramp(notes, t0_, t1_, lo):
    out = []
    for n in notes:
        if t0_ <= n['t'] < t1_:
            k = lo + (1.0 - lo) * (n['t'] - t0_) / max(1e-6, t1_ - t0_)
            out.append(dict(t=n['t'], m=n['m'], d=n['d'], v=max(1, int(round(n['v'] * k)))))
        else:
            out.append(n)
    return out


def drums_from_midi(chans, t0, t1, thin_hat=0.155, thin_snare=0.10, thin_kick=0.075,
                    snare_floor=52, ride_gain=0.55):
    """ch9 映射到引擎鼓：36→0 kick、38/40→1 snare、42/44→2 闭镲、46→3 开镲、49→4 吊镲、51→3 ride。
    道中化：同 kind 贴太近的抽掉（16 分鼓点抽成八分感），低力度 ghost snare 直接丢。"""
    kind_of = {36: 0, 38: 1, 40: 1, 42: 2, 44: 2, 46: 3, 49: 4, 51: 3}
    thin = {0: thin_kick, 1: thin_snare, 2: thin_hat, 3: 0.0, 4: 0.0}
    raw = []
    for n in (to_dict(x) for x in chans[9]['notes']):
        if not (t0 <= n['t'] < t1) or n['m'] not in kind_of:
            continue
        k = kind_of[n['m']]
        v = float(n['v'])
        if k == 1 and v < snare_floor:
            continue
        if n['m'] == 51:
            v *= ride_gain
        raw.append((n['t'], k, v))
    raw.sort()
    out, last = [], {}
    for t, k, v in raw:
        gap = thin.get(k, 0.0)
        if gap and (t - last.get(k, -1e9)) < gap:
            continue
        last[k] = t
        out.append([round(t - t0, 3), k, int(max(20, min(127, round(v))))])
    out.sort(key=lambda x: (x[0], x[1]))
    return out


def shape_drums(drums, bar, beat, duration, theme_bar):
    """道中编制：前两小节只留底鼓、第 5 小节才进镲；主题进来（theme_bar）、转调段（+16）、
    回踏板段（+32）各补一记吊镲，段前一小节补十六分军鼓 fill，倒数两拍渐强收尾
    （循环回开头由 0.0 的吊镲接手）。"""
    out = []
    for t, k, v in drums:
        b = t / bar
        if b < 2.0 and k != 0:
            continue
        if b < 5.0 and k in (2, 3):
            continue
        out.append([t, k, v])
    for b, acc in ((theme_bar, 96), (theme_bar + 16, 92), (theme_bar + 32, 88)):
        if b * bar < duration - 0.5:
            out.append([round(b * bar, 3), 4, acc])
    for b in (theme_bar - 1, theme_bar + 15, theme_bar + 31):
        if b < 0 or b * bar >= duration - 1.0:
            continue
        base = b * bar + 3 * beat
        for i in range(4):
            out.append([round(base + i * beat / 4.0, 3), 1, 46 + i * 14])
    base = duration - 2 * beat
    for i in range(8):
        out.append([round(base + i * beat / 4.0, 3), 1, 40 + i * 10])
    out.append([0.0, 4, 88])
    return sorted(out, key=lambda x: (x[0], x[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=SPEC['bpm'])
    ap.add_argument('--bars', type=int, default=SPEC['bars'])
    ap.add_argument('--intro-cut', type=int, default=0,
                    help='>0 时前奏只保留原曲开头 N 小节，然后直接跳进主题（0 = 完整原曲）')
    ap.add_argument('--lead-gain', type=float, default=0.19)
    ap.add_argument('--sparkle-gain', type=float, default=0.05)
    ap.add_argument('--pad-gain', type=float, default=0.065)
    ap.add_argument('--strings-gain', type=float, default=0.055)
    ap.add_argument('--arp-gain', type=float, default=0.05)
    ap.add_argument('--run-gain', type=float, default=0.032)
    ap.add_argument('--bass-gain', type=float, default=0.125)
    ap.add_argument('--sub-gain', type=float, default=0.15)
    ap.add_argument('--hat-thin', type=float, default=0.155)
    ap.add_argument('--snare-thin', type=float, default=0.10)
    ap.add_argument('--no-write', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    src_bpm = M.bpm_of(segs)
    beat = 60.0 / args.bpm
    bar = 4 * beat
    if args.intro_cut:
        # 前奏留 N 小节，然后从主题（32.516s = bar 21）一路到原曲结束
        src_segs = [(SPEC['src_t0'], SPEC['src_t0'] + args.intro_cut * bar),
                    (SPEC['theme_t0'], SPEC['src_end'])]
        theme_bar = args.intro_cut
    else:
        src_segs = [(SPEC['src_t0'], SPEC['src_t0'] + args.bars * bar)]
        theme_bar = SPEC['theme_bar']
    spans = [b - a for a, b in src_segs]
    duration = round(sum(spans), 3)
    print('原曲 %.1f BPM；目标 %.1f BPM；%d 小节 / %.3fs；素材段 %s；主题在 bar %d (%.2fs)'
          % (src_bpm, args.bpm, int(round(duration / bar)), duration,
             ['%.2f-%.2fs' % s for s in src_segs], theme_bar, theme_bar * bar))

    def build(ch, poly=1, mono=None, transpose=0, lo=None, hi=None):
        src = list(ch['notes'])
        if mono:
            src = M.mono_ize(src, keep=mono)
        if poly:
            src = M.cap_poly(src, poly)
        out, off = [], 0.0
        for a, b in src_segs:
            for n in window(src, a, b):
                m = n['m'] + transpose
                if lo is not None:
                    m = max(lo, m)
                if hi is not None:
                    m = min(hi, m)
                out.append(dict(t=round(n['t'] + off, 3), m=m, d=n['d'], v=n['v']))
            off += (b - a)
        out.sort(key=lambda x: (x['t'], x['m']))
        return out

    # 主旋律：ch0 原样（前奏的 F/A 踏板和音就是原曲味道，不拆）
    lead = build(chans[0], poly=2)
    # 「铃」：ch6 = ch0+12 的加倍，只取短音、压到 55% 力度，给旋律加一层金属光泽
    sparkle = [dict(t=n['t'], m=n['m'], d=min(0.24, n['d']), v=n['v'])
               for n in build(chans[6], poly=1, transpose=12, hi=103) if n['d'] <= 0.42]
    sparkle = [dict(n, v=int(n['v'] * 0.55)) for n in sparkle]
    # 伴奏织体
    pad = build(chans[3], poly=2, transpose=-12, lo=28)       # 长音铺底 + 十六分琶音
    strings = build(chans[1], poly=2, transpose=-12, lo=28)   # 长音和弦（弦乐）
    arp = build(chans[5], poly=1)                             # F#-D-A 八分琶音
    run = build(chans[4], poly=1)                             # 前奏尾的高音十六分跑动
    bass = build(chans[2], mono='low')                        # 八分驱动贝斯
    print('素材：lead %d / sparkle %d / pad %d / strings %d / arp %d / run %d / bass %d'
          % (len(lead), len(sparkle), len(pad), len(strings), len(arp), len(run), len(bass)))

    # 收尾裁剪：越过循环终点的贴边残音丢掉，其余截断
    def clip(track):
        out = []
        for n in track:
            if n['t'] >= duration - 0.10:
                continue
            d = min(n['d'], duration - n['t'])
            out.append(dict(t=n['t'], m=n['m'], d=max(0.05, round(d, 3)), v=n['v']))
        return out

    lead, sparkle, pad, strings, arp, run, bass = (clip(x) for x in (lead, sparkle, pad, strings, arp, run, bass))

    # 段落呼吸：前奏本来就弱一档，主体进来再全开
    lead = fade_in(lead, 2.5, floor=0.55)
    lead = gate(lead, theme_bar * bar, 0.78)
    pad = gate(pad, min(6 * bar, theme_bar * bar), 0.74)
    strings = gate(strings, min(6 * bar, theme_bar * bar), 0.70)
    bass = gate(bass, min(4 * bar, theme_bar * bar), 0.82)
    sub = ramp(sub_copy(bass), min(4 * bar, theme_bar * bar), min(12 * bar, theme_bar * bar + 2 * bar), 0.42)

    drums, off = [], 0.0
    for a, b in src_segs:
        for d in drums_from_midi(chans, a, b, thin_hat=args.hat_thin, thin_snare=args.snare_thin):
            drums.append([round(d[0] + off, 3), d[1], d[2]])
        off += (b - a)
    drums = shape_drums(drums, bar, beat, duration, theme_bar)

    # 主题进门前的「吸气」：最后两拍撤鼓、最后一拍撤贝斯/sub，正拍吊镲+全军进 → 段落抬升听得出来
    T = theme_bar * bar
    def drop_window(track, a, b, kinds=None):
        out = []
        for x in track:
            t = x['t'] if isinstance(x, dict) else x[0]
            k = x.get('kind') if isinstance(x, dict) else (x[1] if kinds is not None else None)
            if a <= t < b and (kinds is None or k in kinds):
                continue
            out.append(x)
        return out
    drums = [d for d in drums if not (T - 2 * beat <= d[0] < T)]
    bass = drop_window(bass, T - beat, T)
    sub = drop_window(sub, T - beat, T)
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('成品：lead %d / sparkle %d / pad %d / strings %d / arp %d / run %d / bass %d / sub %d / drums %d %s'
          % (len(lead), len(sparkle), len(pad), len(strings), len(arp), len(run), len(bass), len(sub), len(drums), cnt))
    if max(n['t'] for n in lead) >= duration:
        print('!! 主旋律超出长度')
    if args.check:
        return
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=int(round(args.bpm)),
                tracks=[dict(wave='square', gain=args.lead_gain, notes=lead),
                        dict(wave='triangle', gain=args.sparkle_gain, notes=sparkle),
                        dict(wave='triangle', gain=args.pad_gain, notes=pad),
                        dict(wave='triangle', gain=args.strings_gain, notes=strings),
                        dict(wave='triangle', gain=args.arp_gain, notes=arp),
                        dict(wave='triangle', gain=args.run_gain, notes=run),
                        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
                        dict(wave='sine', gain=args.sub_gain, notes=sub)],
                drums=drums)
    data['reasons'] = ['主旋律 = ZUN 原曲 ch0 全部（含前奏 F/A 踏板和音），155 BPM 原速不转调',
                       '蓝本：refA 上海アリス幻樂団原曲 155BPM（占大头）+ refB 来夢緑 150BPM 真鼓摇滚 + refC TAMUSIC 167BPM 小提琴长音',
                       '伴奏 = ch2 八分贝斯 + ch9 真鼓抽稀 + ch1 弦乐铺底 + ch5 琶音 + ch3 十六分垫']
    head = """/**
 * 五面道中《広有射怪鳥事 ～ Till When?》—— 妖鳥编（摇滚乐队编制，原曲主旋律占大头）。
 * 素材 = ZUN 原曲 TH07 扒谱 MIDI（155 BPM 原速），主旋律 100% 原曲；
 * tools/pre5_tillwhen.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
