#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/ateam_stage3.py —— 07 三面 Boss《おてんば恋娘》Ateam 重低频编 + 琪露诺的完美教室。

蓝本：Ateam「おてんば恋娘」/ 酷狗 album_id 190818027 / 180s
实测：半速 75.7 BPM → 本速 **151.4 BPM**；RMS 0.139、频段 0–120Hz 48–67%（超重低频）、
120–500 14–32%、500–2k 3–17%、2–6k 3–10%、6–16k 1–6%；质心 428–1143Hz
→ 低频被推到极致、中频收紧的电子编制（底鼓+sub 贝斯主导）。

素材（三首琪露诺）：
  A 段 = TH06《おてんば恋娘》ZUN 版（游戏内 stage3 现曲，148 BPM / 86.5s，E 小调）
  B 段 = TH09《おてんば恋娘の冒険》ZUN 版 MIDI（155 BPM，D# 小调 → +1 半音到 E 小调）
  C 段 = IOSYS《チルノのパーフェクトさんすう教室》MIDI（175 BPM，D 小调 → +2 半音到 E 小调）
  尾声 = A 段副歌再走一遍

做法：全部重定时到 151 BPM；A 24 + B 16 + C 16 + 尾声 8 = 64 小节 / 101.7s
  主旋律 square；贝斯 三角+锯齿叠层；正下方正弦 sub；和声 square（复音≤2）；
  鼓 = 四踩底鼓 + 2/4 拍军鼓 + 16 分闭镲 + 反拍开镲 + 每 8 小节吊镲。

用法：
    python tools/ateam_stage3.py --check
    python tools/ateam_stage3.py
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
import preview_song as PS

SRC_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
MIDI_COLLECTION = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID_B = os.path.join(MIDI_COLLECTION, '1 - Shooter Games', '9 - Phantasmagoria of Flower View',
                     '7. Adventure of the Lovestruck Tomboy (ZUN).mid')
MID_C = os.path.join(MIDI_COLLECTION, '6 - Arranges',
                     "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'ateam_stage3.js')
EXPORT = 'ATEAM_STAGE3'

BPM = 151.0
BARS_A, BARS_B, BARS_C, BARS_OUT = 24, 16, 16, 8


def obj(n):
    if isinstance(n, dict):
        return n['t'], n['m'], n['d'], n['v']
    return n[0], n[1], n[2], n[3]


def as_dicts(notes):
    return [dict(t=obj(n)[0], m=obj(n)[1], d=obj(n)[2], v=obj(n)[3]) for n in notes]


def split_voice(notes, keep='high'):
    """把复音轨拆成「每个时刻一条主声部」+「剩下的和弦音」。"""
    groups = {}
    for n in notes:
        groups.setdefault(n['t'], []).append(dict(n))
    picked, rest = [], []
    for t, g in groups.items():
        g.sort(key=lambda n: n['m'])
        top = g[-1] if keep == 'high' else g[0]
        picked.append(top)
        rest.extend(x for x in g if x is not top)
    picked.sort(key=lambda n: n['t'])
    rest.sort(key=lambda n: (n['t'], n['m']))
    for i in range(len(picked) - 1):
        max_d = picked[i + 1]['t'] - picked[i]['t'] - 0.005
        if picked[i]['d'] > max_d:
            picked[i]['d'] = max(0.05, round(max_d, 3))
    return picked, rest


def shift(notes, t0, scale, t_off, lim):
    """把 [t0, t0+lim) 的素材按 scale 重定时，再整体后移 t_off。"""
    out = []
    for n in notes:
        t, m, d, v = obj(n)
        if not (t0 <= t < t0 + lim):
            continue
        nt = round((t - t0) * scale + t_off, 3)
        nd = round(min(4.0, max(0.05, d * scale)), 3)
        if nt < t_off + lim - 0.01:
            out.append(dict(t=nt, m=int(m), d=nd, v=int(min(120, v))))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def tr(notes, delta):
    return [dict(t=n['t'], m=max(12, min(120, n['m'] + delta)), d=n['d'], v=n['v']) for n in notes]


def fold(notes, lo=62, hi=88):
    out = []
    for n in notes:
        m = n['m']
        while m > hi:
            m -= 12
        while m < lo:
            m += 12
        if lo <= m <= hi:
            out.append(dict(t=n['t'], m=m, d=n['d'], v=n['v']))
    return out


def sub_copy(notes, drop=12):
    return [dict(t=n['t'], m=max(12, n['m'] - drop), d=n['d'], v=int(n['v'] * 0.9)) for n in notes]


def edm_drums(bars, bar, beat, kick=110, snare=98, hat=38, hat16=26, open_hat=58, crash=84):
    d = []
    for b in range(bars):
        base = b * bar
        for k in range(4):
            d.append((round(base + k * beat, 3), 0, kick + (4 if k == 0 else 0)))
        for k in (1, 3):
            d.append((round(base + k * beat, 3), 1, snare))
        for k in range(0, 16, 2):          # 闭镲只走八分，16 分留给渐强段
            d.append((round(base + k * beat / 4.0, 3), 2, hat if k % 4 == 0 else int(hat * 0.72)))
        if b % 2 == 0:
            for k in (1,):
                d.append((round(base + k * beat + beat / 2.0, 3), 3, open_hat))
        if b % 8 == 0:
            d.append((round(base, 3), 4, crash))
        if b % 8 == 7:
            for k in (2.5, 2.75, 3.0, 3.25, 3.5, 3.75):
                d.append((round(base + k * beat, 3), 1, int(snare * 0.7)))
    return sorted(d)


def ramp_vel(notes, t0, t1, lo=0.35, hi=1.0):
    """t0→t1 区间内把力度从 lo 线性推到 hi（做渐强）。"""
    out = []
    for n in notes:
        if t0 <= n['t'] < t1:
            k = (n['t'] - t0) / max(1e-6, t1 - t0)
            n = dict(n)
            n['v'] = max(1, int(round(n['v'] * (lo + (hi - lo) * k))))
        out.append(n)
    return out


def riser(bar, beat, b_from, b_to, scale=(52, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88)):
    """渐强段的上行音节（E 小调音阶爬到高音），每格一个音。"""
    t0, t1 = b_from * bar, b_to * bar
    step = (t1 - t0) / len(scale)
    out = []
    for i, m in enumerate(scale):
        out.append(dict(t=round(t0 + i * step, 3), m=m, d=round(step * 1.4, 3),
                        v=58 + int(50 * i / (len(scale) - 1))))
    return out


def build_arp(bar, beat, b_from, b_to, scale=(52, 55, 59, 62, 64, 67, 71, 74, 76, 79, 83, 86, 88, 91)):
    """渐强段的 16 分琶音：音高与力度一起往上爬，做真正的「渐强」。"""
    out = []
    n = int(round((b_to - b_from) * 4)) * 4   # 每小节 16 个 16 分
    for i in range(n):
        t = b_from * bar + i * beat / 4.0
        m = scale[min(len(scale) - 1, int(i * len(scale) / n))]
        vel = int(62 + 55 * i / max(1, n - 1))
        out.append(dict(t=round(t, 3), m=m, d=round(beat * 0.22, 3), v=vel))
    return out


def snare_roll(bar, beat, b_from, b_to):
    """渐强段的军鼓滚奏：每小节 16 分，力度一路推上去。"""
    out = []
    total = (b_to - b_from) * 16
    for b in range(b_from, b_to):
        for k in range(16):
            idx = (b - b_from) * 16 + k
            out.append((round(b * bar + k * beat / 4.0, 3), 1, int(42 + 70 * idx / total)))
    return out


def bass_follow(mel, harm, bar, beat, b_from, b_to, lo=33, hi=45):
    """B/C/尾声 的贝斯改成「跟着和声与主旋律走」：每半小节取和弦根音，八分滚动，
    并在主旋律换音的拍点上补齐，避免贝斯自己跑一套。"""
    def root_of(t0, t1):
        h = {}
        for n in harm:
            if t0 <= n['t'] < t1:
                h[n['m'] % 12] = h.get(n['m'] % 12, 0.0) + n['d']
        for n in mel:
            if t0 <= n['t'] < t1:
                h[n['m'] % 12] = h.get(n['m'] % 12, 0.0) + n['d'] * 0.8
        if not h:
            return None
        return max(h.items(), key=lambda kv: kv[1])[0]

    out = []
    for b in range(b_from, b_to):
        for half in (0, 1):
            t0 = b * bar + half * (bar / 2)
            pc = root_of(t0, t0 + bar / 2)
            if pc is None:
                continue
            m = pc + 12 * max(0, (lo - pc) // 12)
            while m < lo:
                m += 12
            while m > hi:
                m -= 12
            for k, iv in enumerate((0, 0, 12, 7)):
                mm = m + iv
                if mm > 55:
                    mm -= 12
                out.append(dict(t=round(t0 + k * beat / 2.0, 3), m=mm,
                                d=round(beat * 0.42, 3), v=104))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def fill_bass_edm(bass, harm, bars, bar, beat, lo=33, hi=45):
    """贝斯空掉的小节按和声根音补八分滚动（EDM 底），保证低频不断。"""
    out = []
    for b in range(bars):
        t0 = b * bar
        if len([n for n in bass if t0 <= n['t'] < t0 + bar]) >= 6:
            continue
        h = {}
        for n in harm:
            if t0 <= n['t'] < t0 + bar:
                h[n['m'] % 12] = h.get(n['m'] % 12, 0.0) + n['d']
        if not h:
            continue
        root = max(h.items(), key=lambda kv: kv[1])[0]
        m = root + 12 * max(0, (lo - root) // 12)
        while m < lo:
            m += 12
        while m > hi:
            m -= 12
        pat = (0, 0, 12, 7, 0, 0, 7, 12)
        for k, iv in enumerate(pat):
            mm = m + iv
            if mm > 55:
                mm -= 12
            out.append(dict(t=round(t0 + k * beat / 2.0, 3), m=mm, d=round(beat * 0.42, 3), v=100))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def chord_arp(harm, bars_n, bar, beat, lo=62, hi=86):
    """过渡段琶音：第 18–21 小节八分、第 22–23 小节十六分，力度逐小节抬升。"""
    out = []
    for b in bars_n:
        t0 = b * bar
        pcs = sorted({n['m'] % 12 for n in harm if t0 <= n['t'] < t0 + bar})
        if len(pcs) < 2:
            continue
        pool = [m for m in range(lo, hi + 1) if m % 12 in pcs]
        if len(pool) < 3:
            continue
        step = beat / 4.0 if b >= 22 else beat / 2.0
        k = 0
        t = t0
        while t < t0 + bar - 1e-6:
            out.append(dict(t=round(t, 3), m=pool[k % len(pool)], d=round(step * 0.62, 3),
                            v=min(112, 54 + (b - 18) * 9 + (4 if k % 2 == 0 else 0))))
            t += step
            k += 1
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def chord_stabs(bass, bar, beat, b0, b1, lo=52, hi=76):
    """后半段没有和声的地方，按贝斯根音补 1、3 拍的三和弦短音。"""
    out = []
    for b in range(b0, b1):
        t0 = b * bar
        ns = [n for n in bass if t0 <= n['t'] < t0 + bar]
        if not ns:
            continue
        root = ns[0]['m']
        while root < lo:
            root += 12
        while root > hi:
            root -= 12
        for k in (0, 2):
            for iv, vv in ((0, 54), (3, 46), (7, 46)):
                m = root + iv
                if m > 88:
                    m -= 12
                out.append(dict(t=round(t0 + k * beat, 3), m=m, d=round(beat * 0.85, 3), v=vv))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def bridge_melody(bar, beat):
    """第 18–23 小节（28.6–38.15s）的过渡段旋律：手写，与全曲同为 C# 小调，
    和声走向 Amaj7 – C#m – F#m – Amaj – G# – G#，终点落在属音 G# 推向 B 段。
    每项 (小节序号, 拍位, MIDI, 拍长)。不再重复主旋律。"""
    table = [
        (18, 0, 73, 1.0), (18, 1, 68, 1.0), (18, 2, 64, 2.0),
        (19, 0, 76, 1.0), (19, 1, 73, 1.0), (19, 2, 68, 2.0),
        (20, 0, 69, 0.5), (20, 0.5, 66, 0.5), (20, 1, 69, 0.5), (20, 1.5, 73, 0.5),
        (20, 2, 76, 1.0), (20, 3, 73, 1.0),
        (21, 0, 78, 1.0), (21, 1, 76, 1.0), (21, 2, 73, 1.0), (21, 3, 71, 1.0),
        (22, 0, 68, 0.5), (22, 0.5, 71, 0.5), (22, 1, 75, 0.5), (22, 1.5, 80, 0.5),
        (22, 2, 75, 1.0), (22, 3, 73, 1.0),
        (23, 0, 76, 0.25), (23, 0.25, 78, 0.25), (23, 0.5, 80, 0.25), (23, 0.75, 83, 0.25),
        (23, 1, 80, 1.0), (23, 2, 76, 1.0), (23, 3, 73, 1.0),
    ]
    out = []
    for b, k, m, d in table:
        out.append(dict(t=round(b * bar + k * beat, 3), m=m, d=round(d * beat * 0.92, 3), v=96))
    return out


def bridge_pad(bar):
    """过渡段的持续和弦垫：每小节一个三和弦，整小节长音。"""
    chords = {18: (57, 61, 64), 19: (61, 64, 68), 20: (54, 57, 61),
              21: (57, 61, 64), 22: (56, 60, 63), 23: (56, 60, 63)}
    out = []
    for b, ch in chords.items():
        for m in ch:
            out.append(dict(t=round(b * bar, 3), m=m, d=round(bar * 0.98, 3), v=46))
    return out


def arp_layer(harm, bass, bars_n, bar, beat, lo=60, hi=84, v=44):
    """后半段（C 段）铺一层轻的八分琶音，补住「少拍」的空隙。"""
    out = []
    for b in bars_n:
        t0 = b * bar
        pcs = sorted({n['m'] % 12 for n in list(harm) + list(bass) if t0 <= n['t'] < t0 + bar})
        if len(pcs) < 2:
            continue
        pool = [m for m in range(lo, hi + 1) if m % 12 in pcs]
        if len(pool) < 3:
            continue
        for k in range(8):
            out.append(dict(t=round(t0 + k * beat / 2.0, 3), m=pool[k % len(pool)],
                            d=round(beat * 0.40, 3), v=v))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def counter_line(lead, harm, bars, bar, beat, lo=64, hi=86, max_notes=5):
    """主旋律稀（每小节 < max_notes）的地方补八分对句，只走该小节的和弦音。"""
    out = []
    last_pc = None
    for b in range(bars):
        t0 = b * bar
        if len([n for n in lead if t0 <= n['t'] < t0 + bar]) >= max_notes:
            continue
        pcs = sorted({n['m'] % 12 for n in harm if t0 <= n['t'] < t0 + bar})
        if not pcs:
            pcs = last_pc or []
        last_pc = pcs
        if len(pcs) < 2:
            continue
        pool = [m for m in range(lo, hi + 1) if m % 12 in pcs]
        if len(pool) < 3:
            continue
        for k in range(8):
            idx = k % len(pool)
            m = pool[idx]
            out.append(dict(t=round(t0 + k * beat / 2.0, 3), m=m, d=round(beat * 0.42, 3), v=78))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=BPM)
    ap.add_argument('--lead-gain', type=float, default=0.19)
    ap.add_argument('--desc-gain', type=float, default=0.045)
    ap.add_argument('--bass-gain', type=float, default=0.17)
    ap.add_argument('--bass2-gain', type=float, default=0.10)
    ap.add_argument('--sub-gain', type=float, default=0.20)
    ap.add_argument('--harm-gain', type=float, default=0.022)
    ap.add_argument('--riser-gain', type=float, default=0.09)
    ap.add_argument('--counter-gain', type=float, default=0.075)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    # ---- A 段：游戏内 stage3（TH06 おてんば恋娘）----
    a_song = PS.load_song(SRC_FILE, 'BOSS_SONGS', 'stage3')
    bpm_a = float(a_song['bpm'])
    bar_a = 4 * 60.0 / bpm_a
    # 游戏内的 stage3 里，真正的《おてんば恋娘》主旋律在 track2（square，gain 0.05，几乎听不见）；
    # track0 只是高八度的装饰声部（= track3 - 12）。这里把主旋律拆出来当 lead。
    _t2 = as_dicts(a_song['tracks'][2]['notes'])
    lead_a, harm_a = split_voice(_t2, keep='high')
    lead_a = M.mono_ize(lead_a, keep='high')
    bass_a = as_dicts(a_song['tracks'][1]['notes'])
    desc_a = as_dicts(a_song['tracks'][0]['notes'])

    # ---- B 段：TH09 冒険 ----
    chans_b, segs_b, _ = M.extract_channels(M.parse_midi(MID_B))
    bpm_b = M.bpm_of(segs_b)
    bar_b = 4 * 60.0 / bpm_b
    # TH09《おてんば恋娘の冒険》与 TH06 同为 C# 小调 → 不转调（之前误判为 D# 小调 +1，导致 B 段跑调到 D 小调）
    mel_b = tr(M.mono_ize(chans_b[10]['notes'], keep='high'), 0)
    bass_b = tr(M.mono_ize(chans_b[5]['notes'], keep='low'), 0)
    harm_b = tr(M.cap_poly(chans_b[4]['notes'], 2), 0)

    # ---- C 段：IOSYS チルノのパーフェクトさんすう教室（D 小调，-1 → C# 小调，与 A 段同调）----
    chans_c, segs_c, _ = M.extract_channels(M.parse_midi(MID_C))
    bpm_c = M.bpm_of(segs_c)
    bar_c = 4 * 60.0 / bpm_c
    mel_c = tr(fold(M.mono_ize(chans_c[2]['notes'], keep='high')), -1)
    bass_c = tr(M.mono_ize(chans_c[1]['notes'], keep='low'), -1)
    harm_c = tr(M.cap_poly(chans_c[4]['notes'], 2), -1)

    bar = 4 * 60.0 / args.bpm
    beat = bar / 4.0
    bars = BARS_A + BARS_B + BARS_C + BARS_OUT
    duration = bars * bar
    d_a = BARS_A * bar
    d_b = BARS_B * bar
    d_c = BARS_C * bar
    t_b, t_c, t_out = d_a, d_a + d_b, d_a + d_b + d_c
    print('A %.1f / B %.1f / C %.1f BPM → 统一 %.1f；%d 小节 / %.1fs（A %d · B %d · C %d · 尾声 %d）'
          % (bpm_a, bpm_b, bpm_c, args.bpm, bars, duration, BARS_A, BARS_B, BARS_C, BARS_OUT))
    print('段落起点：B %.2fs / C %.2fs / 尾声 %.2fs' % (t_b, t_c, t_out))

    lead = shift(lead_a, 0, bpm_a / args.bpm, 0.0, d_a)
    desc = []   # 高八度装饰线（原 track0）与主旋律抢高音区，整条撤掉
    bass = shift(bass_a, 0, bpm_a / args.bpm, 0.0, d_a)
    harm = shift(harm_a, 0, bpm_a / args.bpm, 0.0, d_a)
    lead += shift(mel_b, 24 * bar_b, bpm_b / args.bpm, t_b, d_b)
    bass += shift(bass_b, 24 * bar_b, bpm_b / args.bpm, t_b, d_b)
    harm += shift(harm_b, 24 * bar_b, bpm_b / args.bpm, t_b, d_b)
    lead += shift(mel_c, 56 * bar_c, bpm_c / args.bpm, t_c, d_c)
    bass += shift(bass_c, 56 * bar_c, bpm_c / args.bpm, t_c, d_c)
    harm += shift(harm_c, 56 * bar_c, bpm_c / args.bpm, t_c, d_c)
    lead += shift(lead_a, 8 * bar_a, bpm_a / args.bpm, t_out, BARS_OUT * bar)   # 尾声改成主旋律再现，不再空着
    bass += shift(bass_a, 24 * bar_a, bpm_a / args.bpm, t_out, BARS_OUT * bar)
    harm += shift(harm_a, 24 * bar_a, bpm_a / args.bpm, t_out, BARS_OUT * bar)
    print('音符：lead %d / bass %d / harm %d' % (len(lead), len(bass), len(harm)))

    # ---- 24s 开始渐强、28.6s 接回主曲，并补掉后面缺拍的地方 ----
    t_build0, t_build1 = 15 * bar, 18 * bar          # 23.84s → 28.61s
    # 第 18–23 小节（28.6–38.15s）：不再整段重复主旋律，改成「歇 → 蓄 → 推」的过渡段，
    # 由和弦琶音 + 军鼓滚奏把人声推到 38.15s 的 B 段，避免「重复」和「骤升」
    lead = [n for n in lead if not (18 * bar <= n['t'] < 24 * bar)]
    lead.sort(key=lambda x: (x['t'], x['m']))
    lead = ramp_vel(lead, t_build0, t_build1, lo=1.0)
    bass = ramp_vel(bass, t_build0, t_build1, lo=1.0)
    harm = ramp_vel(harm, t_build0, t_build1, lo=1.0)
    riser_notes = riser(bar, beat, 15, 18)          # 渐强只留一条上行音节
    bridge = bridge_melody(bar, beat)                       # 28.6–38.15s 过渡段旋律（手写）
    lead = sorted(lead + bridge, key=lambda x: (x['t'], x['m']))
    pad = bridge_pad(bar)                                    # 同段的和弦垫
    riser_notes = sorted(riser_notes + pad, key=lambda n: n['t'])
    print('过渡段：手写旋律 %d 音 + 和弦垫 %d 音' % (len(bridge), len(pad)))
    counter = counter_line(lead, harm, bars, bar, beat, max_notes=3)
    counter += arp_layer(harm, bass, list(range(BARS_A, BARS_A + BARS_B + BARS_C)), bar, beat, v=58)  # C 段补八分琶音
    counter.sort(key=lambda x: (x['t'], x['m']))
    print('渐强段：上行音节 %d 音；补齐缺拍的八分对句 %d 音（%d 小节）'
          % (len(riser_notes), len(counter), len({round(n['t'] / bar) for n in counter})))

    # 后半段（B/C/尾声）的贝斯全部换成跟着和声+主旋律走的线
    b_from, b_to = BARS_A, BARS_A + BARS_B + BARS_C + BARS_OUT
    bass = [n for n in bass if n['t'] < b_from * bar]
    bass += bass_follow(lead, harm, bar, beat, b_from, b_to)
    bass.sort(key=lambda x: (x['t'], x['m']))
    bass_fill = fill_bass_edm(bass, harm, bars, bar, beat)
    bass = sorted(bass + bass_fill, key=lambda x: (x['t'], x['m']))
    print('补的贝斯：%d 音（%d 小节）' % (len(bass_fill), len({round(n['t'] / bar) for n in bass_fill})))
    # 后半段（C 段 + 尾声）原本一条和声都没有，按贝斯根音补 1、3 拍三和弦
    harm_bars = {b for b in range(bars) if len([n for n in harm if b * bar <= n['t'] < (b + 1) * bar]) < 2}
    empty_runs = sorted(harm_bars)
    stabs = chord_stabs(bass, bar, beat, BARS_A, bars)
    stabs = [n for n in stabs if round(n['t'] / bar) in harm_bars]
    harm = sorted(harm + stabs, key=lambda n: (n['t'], n['m']))
    print('后半段补和弦：%d 音（%d 小节）' % (len(stabs), len({round(n['t'] / bar) for n in stabs})))
    # ---- 全面优化：28.6–31.8s（第 18–19 小节）做「减配呼吸」 ----
    light0, light1 = 18 * bar, 24 * bar        # 整个过渡段（18–23 小节）都自己写，不沿用 A 段的和声/贝斯
    drums = edm_drums(bars, bar, beat)
    n_cut = sum(1 for d in drums if light0 <= d[0] < 20 * bar and d[1] in (2, 3))
    drums = [d for d in drums if not (light0 <= d[0] < 20 * bar and d[1] in (2, 3))]   # 18–19 小节撤闭镲/开镲
    harm = [n for n in harm if not (light0 <= n['t'] < light1)]                        # 撤 A 段和弦，改由 bridge_pad 撑
    bass = [n for n in bass if not (light0 <= n['t'] < light1)]                        # 撤 A 段贝斯，改由下面的踏板/爬升
    for _b, _root in ((18, 37), (19, 37), (20, 42), (21, 42)):                         # C# → F# 低音踏板（四分）
        for _k in range(4):
            bass.append(dict(t=round(_b * bar + _k * beat, 3), m=_root, d=round(beat * 0.9, 3), v=100))
    # 锯齿贝斯只在 B/C/尾声 出场，A 段低频只留三角贝斯 + 正弦 sub
    bass_saw = [dict(n) for n in bass if n['t'] >= t_b + bar]      # 锯齿贝斯晚一小节进，避免 38s 骤升
    harm = [dict(n, v=max(1, int(n['v'] * (0.62 if n['t'] < t_b + 2 * bar else 1.0)))) for n in harm]
    print('减配呼吸：第 18–19 小节撤 %d 次镲、贝斯八分改四分；锯齿贝斯 %d 音（只在 B 段之后）'
          % (n_cut, len(bass_saw)))
    drums = sorted(drums + snare_roll(bar, beat, 15, 18)
                   + [(round(18 * bar, 3), 4, 95), (round(t_b, 3), 4, 92)])
    # 第 22–23 小节只留底鼓+军鼓，把 38.15s 的进入留成「空档 → 落」
    drums = [d for d in drums if not (22 * bar <= d[0] < 24 * bar and d[1] in (2, 3))]

    # ---- 36.6–38.15s 到 B 段的衔接：上行音节 + 渐强滚奏 + 贝斯爬升 + 最后半拍全空 ----
    t_p = 22 * bar
    riser_notes = sorted(riser_notes + riser(bar, beat, 22, 24), key=lambda n: n['t'])   # 上行音节铺满两小节
    pad = []
    for k in range(4):                                                                    # 第 23 小节持续 Em 和弦垫
        for m in (40, 47, 52, 59):
            pad.append(dict(t=round(23 * bar + k * beat, 3), m=m, d=round(beat * 0.95, 3), v=40 + 14 * k))
    riser_notes = sorted(riser_notes + pad, key=lambda n: n['t'])
    drums = [d for d in drums if not (t_p <= d[0] < t_b and d[1] == 1)]                    # 撤掉旧的一小节滚奏
    drums = sorted(drums + snare_roll(bar, beat, 22, 24))                                  # 换成两小节渐强滚奏
    drums = [d for d in drums if not (t_b - beat * 0.5 <= d[0] < t_b)]                     # 最后半拍抽空
    bass = [n for n in bass if not (t_p <= n['t'] < t_b)]                                  # 贝斯改爬升
    for b, k, m in ((22, 0.0, 44), (22, 0.5, 44), (22, 1.0, 44), (22, 1.5, 44), (22, 2.0, 45), (22, 2.5, 45),
                    (22, 3.0, 47), (22, 3.5, 47),
                    (23, 0.0, 44), (23, 0.5, 45), (23, 1.0, 47), (23, 1.5, 49),
                    (23, 2.0, 51), (23, 2.5, 52), (23, 3.0, 54)):
        bass.append(dict(t=round(b * bar + k * beat, 3), m=m, d=round(beat * 0.46, 3), v=104 + 4 * k))
    bass = [n for n in bass if not (t_b - beat * 0.5 <= n['t'] < t_b)]
    bass.sort(key=lambda x: (x['t'], x['m']))
    sub = sub_copy(bass)

    # ---- 38.15s 的「落地」：正拍上必须有旋律与和弦，不能只靠鼓撑 1.5 拍 ----
    lead.append(dict(t=round(t_b - beat * 0.25, 3), m=75, d=round(beat * 0.24, 3), v=100))   # 最后一个 16 分做上行引子
    lead.append(dict(t=round(t_b, 3), m=68, d=round(beat * 1.45, 3), v=112))                  # 正拍 G#4 长音，正好是 B 段第一个音
    lead.sort(key=lambda x: (x['t'], x['m']))
    harm += [dict(t=round(t_b + k * beat, 3), m=m, d=round(beat * 0.9, 3), v=64)
             for k in range(2) for m in (61, 64, 68)]                                          # 正拍 C# 小三和弦
    harm.sort(key=lambda x: (x['t'], x['m']))
    counter = [n for n in counter if not (t_b <= n['t'] < t_b + bar)]                          # 琶音让位给旋律
    drums = [d for d in drums if not (abs(d[0] - t_b) < 1e-6 and d[1] == 4)]                   # 去掉重复吊镲
    drums = sorted(drums + [(round(t_b, 3), 4, 92)])
    data = dict(key='stage3', title='おてんば恋娘（Ateam 低频编 + 完美教室）', duration=round(duration, 3),
                bpm=int(args.bpm),
                tracks=[dict(wave='square', gain=args.lead_gain, notes=lead),
                        dict(wave='triangle', gain=args.bass_gain, notes=bass),
                        dict(wave='sawtooth', gain=args.bass2_gain, notes=bass_saw),
                        dict(wave='sine', gain=args.sub_gain, notes=sub),
                        dict(wave='triangle', gain=args.riser_gain, notes=riser_notes),
                        dict(wave='triangle', gain=args.counter_gain, notes=counter),
                        dict(wave='square', gain=args.harm_gain, notes=harm)],
                drums=drums)
    data['reasons'] = [
        '蓝本 Ateam「おてんば恋娘」（酷狗 album 190818027，180s）—— 实测 151.4 BPM、0–120Hz 占 48–67%% 的超重低频',
        'A TH06(148→%d) · B TH09(155→%d，+1 半音到 E 小调) · C IOSYS 完美教室(175→%d，+2 半音到 E 小调)' % (int(args.bpm), int(args.bpm), int(args.bpm)),
        '%d 小节 / %.1fs：A %d + B %d + C %d + 尾声 %d' % (bars, duration, BARS_A, BARS_B, BARS_C, BARS_OUT),
        '三角+锯齿贝斯叠层、正弦 sub、四踩底鼓 / 2·4 拍军鼓 / 16 分闭镲 / 反拍开镲',
    ]
    print('%d 小节 / %.2fs / lead %d / bass %d / sub %d / harm %d / drums %d'
          % (bars, duration, len(lead), len(bass), len(sub), len(harm), len(drums)))
    if args.check:
        return

    body = M.render_song_js(data, data['reasons'])
    head = """/**
 * 三面 Boss《おてんば恋娘》—— Ateam 重低频编 + チルノのパーフェクトさんすう教室。
 * A 段 TH06、B 段 TH09《おてんば恋娘の冒険》、C 段 IOSYS 完美教室，全部 151 BPM / E 小调。
 * tools/ateam_stage3.py 生成，勿手改。
 */
"""
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
