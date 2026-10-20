#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/yuuhei_pre3.py —— 06 三面道中《ルーネイトエルフ》按幽閉サテライト风重编。

蓝本：幽閉サテライト「夜桜に君を隠して」（with senya）/ 幻想万華鏡 第3話 ED / 254s
实测：128.3 BPM；RMS 0.108（人声版）/ 0.261（Instrumental）；频段 0–120Hz 7–27%、
120–500Hz 45–72%（中低超厚）、500–2k 14–31%、2–6k 6–15%、6–16k <5%；质心 460–1190Hz
→ 温和的中低频摇滚编制（吉他/贝斯/鼓），高频克制。

原曲：ZUN《ルーネイトエルフ》(TH06 2面主题) MIDI，144 BPM / 86.24s / 51.7 小节
  ch1 Acoustic Bass(32) 231 音；ch2 Flute(73) 305 音 = 主旋律；
  ch3 Acoustic Grand(1) 325 音 = 钢琴和声；ch6 Pad(88) 97 音。

做法：取原曲第 1–32 小节为素材，前 8 小节再后移一遍当第 33–40 小节回环尾声；
统一到 128 BPM（蓝本实测速度）→ 40 小节 / 75.0s。
主旋律 ch2（锯齿 0.13）、贝斯 ch1（三角 0.16）、钢琴 ch3（方波 0.04，复音≤2）；
鼓用乐队型：1、3 拍底鼓 + 2、4 拍军鼓 + 八分闭镲 + 反拍开镲 + 每 8 小节吊镲。

用法：
    python tools/yuuhei_pre3.py --check
    python tools/yuuhei_pre3.py
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

MIDI_COLLECTION = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
MID = os.path.join(MIDI_COLLECTION, '6 - The Embodiment of Scarlet Devil',
                   '4. Lunate Elf (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'yuuhei_pre3.js')
EXPORT = 'YUUHEI_PRE3'

SPEC = dict(
    key='pre3',
    title='ルーネイトエルフ（夜桜编）',
    target_bpm=144.0,   # 与原曲同速（ZUN 原曲 144 BPM）
    src_bars=32,      # 素材小节
    tail_bars=8,      # 回环尾声（把前 8 小节后移）
    lead_ch=2,
    bass_ch=1,
    harm_ch=3,
)


def retime(notes, scale, duration):
    out = []
    for n in notes:
        t = round(n['t'] * scale, 3)
        if t >= duration:
            continue
        d = round(min(4.0, max(0.06, n['d'] * scale)), 3)
        out.append(dict(t=t, m=int(n['m']), d=d, v=int(min(120, n['v']))))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def band_drums(bars, bar, beat, kick=100, snare=94, hat=44, hat16=30, open_hat=72, crash=84):
    d = []
    for b in range(bars):
        base = b * bar
        for k in (0, 2):
            d.append((round(base + k * beat, 3), 0, kick + (6 if k == 0 else 0)))
        for k in (1, 3):
            d.append((round(base + k * beat, 3), 1, snare))
        for k in range(8):
            d.append((round(base + k * beat / 2.0, 3), 2, hat if k % 2 == 0 else int(hat * 0.8)))
        for k in range(16):
            if k % 4 == 3:
                d.append((round(base + k * beat / 4.0, 3), 2, hat16))
        d.append((round(base + 3.5 * beat, 3), 3, open_hat))
        if b % 4 == 0:
            d.append((round(base + 3.5 * beat, 3), 1, int(snare * 0.82)))   # 过门小军鼓
        if b % 8 == 0:
            d.append((round(base, 3), 4, crash))
    return sorted(d)


def intro_pad(harm, bars_n, bar, beat, lo=52, hi=74):
    """开头两小节的持续和弦垫：给「3 秒渐强」一个能听见的底，不至于只有鼓。"""
    out = []
    # 前两小节和声常常是空的：先找后面第一个有和声的小节借和弦
    fallback = {}
    for start in range(bars_n, bars_n + 8):
        for n in harm:
            if start * bar <= n['t'] < (start + 1) * bar:
                fallback[n['m'] % 12] = fallback.get(n['m'] % 12, 0.0) + n['d']
        if fallback:
            break
    if not fallback:   # 和声轨可能很晚才进（本曲 18.7s），直接借最早的几个音
        for n in sorted(harm, key=lambda x: x['t'])[:8]:
            fallback[n['m'] % 12] = fallback.get(n['m'] % 12, 0.0) + n['d']
    for b in range(bars_n):
        t0 = b * bar
        h = {}
        for n in harm:
            if t0 <= n['t'] < t0 + bar:
                h[n['m'] % 12] = h.get(n['m'] % 12, 0.0) + n['d']
        if not h:
            h = dict(fallback)
        if not h:
            continue
        pcs = [pc for pc, _ in sorted(h.items(), key=lambda kv: -kv[1])[:3]]
        root = pcs[0]
        m = lo + ((root - lo) % 12)
        chord = [m]
        for pc in pcs[1:]:
            q = m + ((pc - root) % 12)
            if q <= hi:
                chord.append(q)
        for j, mm in enumerate(chord):
            out.append(dict(t=round(t0, 3), m=mm, d=round(bar * 0.96, 3), v=88 - j * 6))
    return sorted(out, key=lambda x: (x['t'], x['m']))


def fade_in(notes, seconds, floor=0.30):
    """开头 seconds 秒内把所有音力度从 floor 线性推到 1.0（做一个真正的渐强进场）。"""
    out = []
    for n in notes:
        t = n['t']
        if t < seconds:
            f = floor + (1.0 - floor) * (t / seconds)
            n = dict(n)
            n['v'] = max(1, int(round(n['v'] * f)))
        out.append(n)
    return out


def fade_in_drums(drums, seconds, floor=0.10):
    out = []
    for d in drums:
        t = d[0]
        if t < seconds:
            f = floor + (1.0 - floor) * (t / seconds)
            out.append((d[0], d[1], max(1, int(round(d[2] * f)))))
        else:
            out.append(d)
    return out


def counter_line(lead, harm, bars, bar, beat, lo=64, hi=82):
    """在「主旋律只剩长音」的空档小节里补一条八分对句（只走该小节的和弦音）。"""
    out = []
    last_pc = None
    for b in range(bars):
        t0 = b * bar
        bar_lead = [n for n in lead if t0 <= n['t'] < t0 + bar]
        if len(bar_lead) > 2:   # 只补最空的那几小节
            continue
        bar_harm = [n for n in harm if t0 <= n['t'] < t0 + bar]
        pcs = sorted({n['m'] % 12 for n in bar_harm})
        if not pcs:
            pcs = last_pc or []
        last_pc = pcs
        if not pcs:
            continue
        pool = []
        for m in range(lo, hi + 1):
            if m % 12 in pcs:
                pool.append(m)
        if len(pool) < 3:
            continue
        step = 0
        for k in range(8):
            t = round(t0 + k * beat / 2.0, 3)
            m = pool[step % len(pool)] + 12 * ((step // len(pool)) % 2)
            while m > hi:
                m -= 12
            out.append(dict(t=t, m=m, d=round(beat * 0.42, 3), v=82))
            step += 1
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=SPEC['target_bpm'])
    ap.add_argument('--src-bars', type=int, default=SPEC['src_bars'])
    ap.add_argument('--tail-bars', type=int, default=SPEC['tail_bars'])
    ap.add_argument('--lead-wave', default='sawtooth')
    ap.add_argument('--lead-gain', type=float, default=0.13)
    ap.add_argument('--bass-gain', type=float, default=0.12)
    ap.add_argument('--bass-wave', default='sawtooth')
    ap.add_argument('--harm-gain', type=float, default=0.05)
    ap.add_argument('--hat', type=int, default=44)
    ap.add_argument('--hat16', type=int, default=30)
    ap.add_argument('--open-hat', type=int, default=72)
    ap.add_argument('--counter-gain', type=float, default=0.06)   # 空档小节的八分对句，0 = 不要
    ap.add_argument('--fade-in', type=float, default=3.0)          # 开头渐强秒数，0 = 不要
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    src_bpm = M.bpm_of(segs)
    bar_src = 4 * 60.0 / src_bpm
    bars = args.src_bars + args.tail_bars
    duration = bars * 4 * 60.0 / args.bpm
    scale = src_bpm / args.bpm
    print('原曲 %.1f BPM / 小节 %.3fs；取 %d 小节 + %d 小节尾声 → %.3fs @ %.1f BPM'
          % (src_bpm, bar_src, args.src_bars, args.tail_bars, duration, args.bpm))

    lead_src = M.mono_ize(chans[SPEC['lead_ch']]['notes'], keep='high')
    bass_src = M.mono_ize(chans[SPEC['bass_ch']]['notes'], keep='low')
    harm_src = M.cap_poly(chans[SPEC['harm_ch']]['notes'], 2)

    t_cut = args.src_bars * bar_src
    def crop(notes):
        return [n for n in notes if n['t'] < t_cut]
    def extend(notes):
        shift = t_cut
        extra = [dict(t=round(n['t'] + shift, 3), m=n['m'], d=n['d'], v=n['v'])
                 for n in notes if n['t'] < args.tail_bars * bar_src and n['t'] + shift < duration]
        return sorted(crop(notes) + extra, key=lambda x: (x['t'], x['m']))

    lead = retime(extend(lead_src), scale, duration)
    bass = retime(extend(bass_src), scale, duration)
    harm = retime(extend(harm_src), scale, duration)
    print('音符：lead %d / bass %d / harm %d' % (len(lead), len(bass), len(harm)))

    bar = 4 * 60.0 / args.bpm
    beat = bar / 4.0
    counter = counter_line(lead, harm, bars, bar, beat) if args.counter_gain > 0 else []
    pad = intro_pad(harm, 2, bar, beat)
    if args.fade_in > 0:
        lead = fade_in(lead, args.fade_in)
        bass = fade_in(bass, args.fade_in)
        harm = fade_in(harm, args.fade_in)
        counter = fade_in(counter, args.fade_in)
        pad = fade_in(pad, args.fade_in)
    print('补的对句：%d 音（%d 个空档小节）' % (len(counter), len({round(n['t'] / bar) for n in counter})))
    drums = band_drums(bars, bar, beat, hat=args.hat, hat16=args.hat16, open_hat=args.open_hat)
    if args.fade_in > 0:
        drums = fade_in_drums(drums, args.fade_in, floor=0.30)
    tracks = [dict(wave=args.lead_wave, gain=args.lead_gain, notes=lead),
              dict(wave=args.bass_wave, gain=args.bass_gain, notes=bass),
              dict(wave='square', gain=args.harm_gain, notes=harm)]
    if counter:
        tracks.append(dict(wave='triangle', gain=args.counter_gain, notes=counter))
    if pad:
        tracks.append(dict(wave='triangle', gain=0.055, notes=pad))
    data = dict(key=SPEC['key'], title=SPEC['title'], duration=round(duration, 3),
                bpm=int(args.bpm), tracks=tracks, drums=drums)
    data['reasons'] = [
        '蓝本 幽閉サテライト「夜桜に君を隠して」——实测 128.3 BPM，中低频超厚、高频克制',
        '原曲 ZUN《ルーネイトエルフ》%d BPM，重定时到 %d BPM' % (int(src_bpm), int(args.bpm)),
        '主旋律/贝斯/钢琴都取原曲 MIDI，只换编制与速度（%d 小节 / %.1fs）' % (bars, duration),
        '乐队型鼓：1、3 拍底鼓 + 2、4 拍军鼓 + 八分闭镲 + 反拍开镲 + 每 8 小节吊镲',
    ]
    print('%d 小节 / %.2fs / lead %d / bass %d / harm %d / drums %d'
          % (bars, duration, len(lead), len(bass), len(harm), len(drums)))
    if args.check:
        return

    body = M.render_song_js(data, data['reasons'])
    head = """/**
 * 三面道中《ルーネイトエルフ》—— 幽閉サテライト「夜桜に君を隠して」风重编。
 * tools/yuuhei_pre3.py 生成，勿手改。
 */
"""
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
