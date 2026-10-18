#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/build_medley.py —— 生成标题曲《Chronicle of Gensokyo》13 作 medley。

读 tools/build/themes.json（title_theme.py 输出，单位=拍），
按 SCORE 指定的乐句窗口/移调/和声，生成
  src/engine/songs/title_chronicle.js
  tools/build/title_chronicle_preview.wav（离线试听）

用法:
    python tools/build_medley.py --dry     # 只打印选句/移调/和声分析
    python tools/build_medley.py           # 生成 js + wav
"""
import os
import sys
import json
import math
import wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES = os.path.join(ROOT, 'tools', 'build', 'themes.json')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'title_chronicle.js')
OUT_WAV = os.path.join(ROOT, 'tools', 'build', 'title_chronicle_preview.wav')

BPM = 150
SEC_PER_BEAT = 60.0 / BPM          # 0.4
SEC_PER_STEP = SEC_PER_BEAT / 4    # 0.1
BAR_BEATS = 4

INTRO_BARS = 4
OUTRO_BARS = 4
SEC_BARS = 4

# 目标调域（都落在 D 自然小调 / F 大调 关系圈内）
KEYS = {
    'Dm':  (2, 'minor'),
    'F':   (5, 'major'),
    'Gm':  (7, 'minor'),
    'Bb':  (10, 'major'),
    'C':   (0, 'major'),
    'Am':  (9, 'minor'),
}
SCALE = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10]}

# game: (start_bar, 备注, 小节数)；start_bar 为 0 起
# 顺序：TH16 / TH12 与 TH18 / TH06 换位后的编排；TH03 作为 2 小节客串插在终曲前。
SCORE = [
    (16, 17, 'The Sky Where Cherry Blossoms Flutter Down', 4),
    (7, 19, 'Ghostly Dream ~ Snow or Cherry Petal', 4),
    (8, 6, 'Eternal Night Vignette ~ Eastern Night', 4),
    (9, 13, 'Flower Viewing Mound ~ Higan Retour', 4),
    (10, 16, 'Sealed Gods', 4),
    (11, 24, 'Awakening of the Earth Spirits', 4),
    (6, 12, 'A Dream that is More Scarlet than Red', 4),
    (13, 32, 'Spirit of Avarice', 4),
    (14, 93, 'Mysterious Purification Rod', 4),
    (15, 71, 'The Space Shrine Maiden Appears', 4),
    (12, 5, 'A Shadow in the Blue Sky', 4),
    (17, 0, 'Entrusting this World to Idols ~ Idolatrize World（代替缺失的标题曲）', 4),
    (3, 8, 'A Dream Transcending Space-Time（梦时空客串 2 小节）', 2),
    (18, 21, 'A Rainbow Spanning Gensokyo', 4),
]

# 手工覆盖（跑 --dry 看过自动结果后填）：game -> (transpose, key)
OVERRIDE = {}

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nn(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def scale_pcs(key):
    tonic, mode = KEYS[key]
    return [(tonic + x) % 12 for x in SCALE[mode]]


def triads(key):
    pcs = scale_pcs(key)
    out = []
    for i in range(7):
        out.append((pcs[i], [pcs[i], pcs[(i + 2) % 7], pcs[(i + 4) % 7]]))
    return out


def fit_score(notes, key):
    pcs = set(scale_pcs(key))
    w = sum(n[2] for n in notes) or 1
    inside = sum(n[2] for n in notes if n[1] % 12 in pcs)
    return inside / w


def choose(notes, prev_key=None):
    """选 (transpose, key, octave_shift)：最大化调内比例 + 音区合理。"""
    best = None
    for t in range(-6, 7):
        shifted = [[n[0], n[1] + t, n[2]] for n in notes]
        med = np.median([n[1] for n in shifted]) if shifted else 60
        oct_shift = 0
        while med + oct_shift * 12 < 74:
            oct_shift += 1
        while med + oct_shift * 12 > 80:
            oct_shift -= 1
        for key in KEYS:
            f = fit_score([[n[0], n[1] + oct_shift * 12, n[2]] for n in shifted], key)
            score = f * 10 - abs(t) * 0.18 - abs(oct_shift) * 0.05
            if prev_key and key == prev_key:
                score += 0.35
            if key in ('Dm', 'F'):
                score += 0.25
            if best is None or score > best[0]:
                best = (score, t, key, oct_shift, f, med + oct_shift * 12)
    return best


def clean_phrase(notes, key):
    """让主旋律更清晰：合并同音反复、去掉经过性 16 分、半音外音归位、尾音拉长。"""
    pcs = set(scale_pcs(key))
    merged = []
    for b, m, d in sorted(notes):
        if merged and m == merged[-1][1] and b - (merged[-1][0] + merged[-1][2]) <= 0.26:
            merged[-1][2] = round(max(merged[-1][2], b + d - merged[-1][0]), 3)
        else:
            merged.append([b, m, d])
    out = []
    for i, (b, m, d) in enumerate(merged):
        if d <= 0.26 and 0 < i < len(merged) - 1:
            pv, nx = merged[i - 1][1], merged[i + 1][1]
            if abs(m - pv) <= 2 and abs(nx - m) <= 2:
                continue
        out.append([b, m, d])
    for n in out:
        if n[1] % 12 in pcs or n[2] > 0.5:
            continue
        for off in (1, -1, 2, -2):
            if (n[1] + off) % 12 in pcs:
                n[1] += off
                break
    if out:
        med = float(np.median([n[1] for n in out]))
        for n in out:
            while n[1] - med > 9:
                n[1] -= 12
            while med - n[1] > 9:
                n[1] += 12
        out[-1][2] = max(out[-1][2], 1.0)
    for n in out:
        n[2] = round(min(4.0, max(0.25, n[2])), 3)
    return out

def chord_for_bar(bar_notes, key, prev_root):
    best = None
    for root, pcs in triads(key):
        sc = 0.0
        for n in bar_notes:
            pc = n[1] % 12
            if pc in pcs:
                sc += 3 * n[2]
            elif pc in set(scale_pcs(key)):
                sc += 1 * n[2]
        if prev_root is not None and root == prev_root:
            sc += 0.6
        if best is None or sc > best[0]:
            best = (sc, root)
    return best[1]


def root_midi(pc, lo=36, hi=47):
    m = pc + 36
    while m < lo:
        m += 12
    while m > hi:
        m -= 12
    return m


def build():
    themes = json.load(open(THEMES, encoding='utf-8'))
    sections = []
    prev_key = 'Dm'
    cursor = INTRO_BARS
    for game, start, note, bars in SCORE:
        th = themes[str(game)]
        b0 = start * BAR_BEATS
        b1 = b0 + bars * BAR_BEATS
        raw = [n for n in th['notes'] if b0 <= n[0] < b1 and n[1] >= 24]
        if not raw:
            print('!! TH%d 在 %d 小节没有音符' % (game, start + 1))
            continue
        if game in OVERRIDE:
            t, key = OVERRIDE[game]
            shifted = [[n[0], n[1] + t, n[2]] for n in raw]
            med = np.median([n[1] for n in shifted])
            oct_shift = 0
            while med + oct_shift * 12 < 74:
                oct_shift += 1
            while med + oct_shift * 12 > 80:
                oct_shift -= 1
            f = fit_score([[n[0], n[1] + oct_shift * 12, n[2]] for n in shifted], key)
            pick = (0, t, key, oct_shift, f, med + oct_shift * 12)
        else:
            pick = choose(raw, prev_key)
        _, t, key, oct_shift, f, med = pick
        notes = [[n[0] - b0, n[1] + t + oct_shift * 12,
                  min(4.0, max(0.25, n[2]))] for n in raw]
        notes.sort()
        notes = clean_phrase(notes, key)
        if notes:
            m2 = float(np.median([n[1] for n in notes]))
            sh = 0
            while m2 + sh * 12 < 74:
                sh += 1
            while m2 + sh * 12 > 81:
                sh -= 1
            if sh:
                notes = [[n[0], n[1] + sh * 12, n[2]] for n in notes]
        # 每小节和弦
        chords = []
        prev_root = None
        for bar in range(bars):
            bn = [n for n in notes if bar * 4 <= n[0] < (bar + 1) * 4]
            r = chord_for_bar(bn, key, prev_root) if bn else (prev_root if prev_root is not None else KEYS[key][0])
            chords.append(r)
            prev_root = r
        sections.append(dict(game=game, name=note, key=key, t=t, oct=oct_shift,
                             fit=f, med=med, notes=notes, chords=chords, bars=bars,
                             start_bar=cursor))
        cursor += bars
        prev_key = key
    return sections


def emit(sections):
    sec_bars = sum(s['bars'] for s in sections)
    total_bars = INTRO_BARS + sec_bars + OUTRO_BARS
    duration = round(total_bars * BAR_BEATS * SEC_PER_BEAT, 6)
    lead, lead2, bass, arp, drums, link = [], [], [], [], [], []

    def add(track, beat, midi, dur_beats, vel):
        track.append([round(beat * SEC_PER_BEAT, 6), int(midi),
                      round(dur_beats * SEC_PER_BEAT, 6), int(vel)])

    # ---------- 引子：Dm 上行，进入第一段 ----------
    intro = [
        (0, 0, 62, 2), (0, 2, 65, 2), (1, 0, 69, 2), (1, 2, 67, 2),
        (2, 0, 65, 2), (2, 2, 62, 2), (3, 0, 69, 2), (3, 2, 74, 2),
    ]
    for bar, beat, m, d in intro:
        add(lead, bar * 4 + beat, m, d, 84)
    for bar, root in enumerate([2, 10, 5, 0]):  # Dm Bb F C
        add(bass, bar * 4, root_midi(root), 2, 92)
        add(bass, bar * 4 + 2, root_midi(root), 2, 86)
        for i in range(8):
            pc = [root, (root + 7) % 12, (root + 12) % 12, (root + 3) % 12][i % 4]
            add(arp, bar * 4 + i * 0.5, pc + 60, 0.45, 62)
        if bar >= 2:
            for b in (0, 2):
                add(drums, bar * 4 + b, 0, 0.25, 92)
            for b in (1, 3):
                add(drums, bar * 4 + b, 1, 0.25, 78)
            for i in range(8):
                add(drums, bar * 4 + i * 0.5, 2, 0.2, 60)

    # ---------- 13 段 ----------
    for si, sec in enumerate(sections):
        sbar = sec['start_bar']
        base = sbar * 4
        lvl = si // 4 + 1   # 1..4
        for n in sec['notes']:
            add(lead, base + n[0], n[1], n[2], 100)
            if si >= 8 and sec['game'] != 3:
                add(lead2, base + n[0], n[1] + 12, n[2], 74)
        for bar in range(sec['bars']):
            root = sec['chords'][bar]
            fifth = (root + 7) % 12
            third = (root + (3 if KEYS[sec['key']][1] == 'minor' else 4)) % 12
            # 修正三度：用调内三度
            pcs = scale_pcs(sec['key'])
            if root in pcs:
                idx = pcs.index(root)
                third = pcs[(idx + 2) % 7]
            bbeat = base + bar * 4
            add(bass, bbeat, root_midi(root), 2, 96)
            add(bass, bbeat + 2, root_midi(root), 1.5, 90)
            add(bass, bbeat + 3.5, root_midi(fifth), 0.5, 84)
            seq = [root, fifth, (root + 12) % 12, third]
            busy = len([n for n in sec['notes'] if bar * 4 <= n[0] < (bar + 1) * 4])
            div = 4 if busy >= 6 else 8
            for i in range(div):
                add(arp, bbeat + i * (4.0 / div), seq[i % 4] + 60,
                    3.6 / div, 58 + lvl * 4)
            # 鼓
            add(drums, bbeat, 0, 0.25, 100)
            add(drums, bbeat + 2, 0, 0.25, 100)
            if lvl >= 2:
                add(drums, bbeat + 2.5, 0, 0.25, 90)
            if lvl >= 3:
                add(drums, bbeat + 3.5, 0, 0.25, 92)
            add(drums, bbeat + 1, 1, 0.25, 96)
            add(drums, bbeat + 3, 1, 0.25, 100)
            for i in range(8):
                add(drums, bbeat + i * 0.5, 2, 0.2, 62 + lvl * 4)
            if lvl >= 4:
                for i in range(4, 8):
                    add(drums, bbeat + i * 0.5, 2, 0.2, 58)
        # 段首吊镲 / 段尾过门
        if si > 0:
            add(drums, base, 4, 1.6, 92)
        if si < len(sections) - 1:
            for i in range(4):
                add(drums, base + 15 + i * 0.25, 1, 0.2, 70 + i * 8)
            add(drums, base + 3.5, 3, 0.5, 80)

    # ---------- 段间连接：上行音阶 / 琶音，把两段焊起来 ----------
    def run_into(end_beat, prev_pitch, target, key, next_root=None, mode='scale'):
        """在 end_beat 前 1.5 拍铺一条上行（音阶或下一段和弦琶音），末音落在下一段首音上。"""
        while target - prev_pitch > 10:
            target -= 12
        while prev_pitch - target > 10:
            target += 12
        pcs = scale_pcs(key)
        pool = set(pcs)
        floor = target - 13
        if mode == 'arp' and next_root in pcs:
            i = pcs.index(next_root)
            pool = {pcs[i], pcs[(i + 2) % 7], pcs[(i + 4) % 7]}
            floor = target - 13
        seq = []
        m = target
        while m > floor and len(seq) < 6:
            m -= 1
            if m % 12 in pool:
                seq.append(m)
        seq.reverse()
        seq.append(target)
        step = 1.5 / len(seq)
        for i, mm in enumerate(seq):
            add(link, end_beat - 1.5 + i * step, mm, step - 0.02, 58 + i * 4)

    # 引子 → 第一段
    if sections:
        run_into(INTRO_BARS * 4, 74,
                 sections[0]['notes'][0][1] if sections[0]['notes'] else 74,
                 sections[0]['key'], sections[0]['chords'][0], 'scale')
    # 各段之间：音阶与琶音交替，避免每次都是同一条音阶
    for si, sec in enumerate(sections[:-1]):
        end = sec['start_bar'] * 4 + sec['bars'] * 4
        prev = sec['notes'][-1][1] if sec['notes'] else 74
        nxt = sections[si + 1]
        tgt = nxt['notes'][0][1] if nxt['notes'] else prev
        run_into(end, prev, tgt, nxt['key'], nxt['chords'][0],
                 'arp' if si % 2 else 'scale')
        add(bass, end - 0.25, root_midi(nxt['chords'][0]), 0.45, 78)
    # 最后一段 → 尾声
    if sections:
        sec = sections[-1]
        end = sec['start_bar'] * 4 + sec['bars'] * 4
        prev = sec['notes'][-1][1] if sec['notes'] else 74
        run_into(end, prev, 78, 'Dm', 2, 'arp')

    # ---------- 尾声：回到 Dm，引用 TH18 轮廓 ----------
    obar = INTRO_BARS + sec_bars
    obase = obar * 4
    outro_lead = [
        (0, 78, 2), (0.5, 76, 2), (1, 74, 2), (1.5, 72, 2),
        (2, 74, 4), (3, 77, 2), (3.5, 74, 2),
        (4, 72, 2), (4.5, 74, 2), (5, 76, 2), (5.5, 74, 2),
        (6, 72, 4), (7, 69, 4),
        (8, 74, 2), (8.5, 72, 2), (9, 70, 2), (9.5, 69, 2),
        (10, 67, 4), (11, 69, 2), (11.5, 72, 2),
        (12, 74, 8), (14, 72, 4), (15, 69, 4),
    ]
    for beat, m, d in outro_lead:
        add(lead, obase + beat, m, d, 96)
    outro_chords = [10, 0, 2, 2]  # Bb C Dm Dm
    for bar in range(OUTRO_BARS):
        root = outro_chords[bar]
        bbeat = obase + bar * 4
        add(bass, bbeat, root_midi(root), 2, 96)
        add(bass, bbeat + 2, root_midi(root), 2, 90)
        for i in range(8):
            pc = [root, (root + 7) % 12, (root + 12) % 12, (root + 3) % 12][i % 4]
            add(arp, bbeat + i * 0.5, pc + 60, 0.45, 66)
        add(drums, bbeat, 0, 0.25, 100)
        add(drums, bbeat + 2, 0, 0.25, 100)
        add(drums, bbeat + 1, 1, 0.25, 96)
        add(drums, bbeat + 3, 1, 0.25, 96)
        for i in range(8):
            add(drums, bbeat + i * 0.5, 2, 0.2, 66)
    add(drums, obase, 4, 2.0, 100)
    add(drums, obase + 12, 4, 2.0, 100)

    for tr in (lead, lead2, bass, arp, link):
        tr.sort()
    drums.sort()
    song = dict(title='東方新紀行 ～ Chronicle of Gensokyo (13th Anniversary Medley)',
                duration=duration, bpm=BPM,
                tracks=[dict(wave='square', gain=0.155, notes=lead),
                        dict(wave='square', gain=0.05, notes=lead2),
                        dict(wave='triangle', gain=0.125, notes=bass),
                        dict(wave='square', gain=0.04, notes=arp),
                        dict(wave='triangle', gain=0.075, notes=link)],
                drums=drums)
    return song, total_bars


def write_js(song):
    def arr(notes):
        return ',\n'.join('  [%s,%d,%s,%d]' % (fmt(t), m, fmt(d), v) for t, m, d, v in notes)

    def fmt(x):
        return ('%.6f' % x).rstrip('0').rstrip('.')

    js = ['/**',
          ' * 标题曲：東方新紀行 ～ Chronicle of Gensokyo（14 作 medley）。',
          ' * 由 tools/build_medley.py 生成，勿手改。',
          ' * 顺序：TH16 → TH07 → TH08 → TH09 → TH10 → TH11 → TH06 → TH13 → TH14', 
          ' *       → TH15 → TH12 → TH17 → TH03（2 小节客串）→ TH18；',
          ' * 素材取自各作标题曲（TH17 标题曲 MIDI 缺失，用《Idolatrize World》代）；',
          ' * 统一 150 BPM，旋律移调到 D 自然小调 / F 大调关系圈，伴奏/鼓由脚本重写。',
          ' */',
          '',
          'export const TITLE_CHRONICLE = {',
          "  title: '%s'," % song['title'],
          '  duration: %s,' % fmt(song['duration']),
          '  bpm: %d,' % song['bpm'],
          '  tracks: [']
    for tr in song['tracks']:
        js.append("    { wave: '%s', gain: %s, notes: [" % (tr['wave'], tr['gain']))
        js.append(arr(tr['notes']))
        js.append('    ] },')
    js.append('  ],')
    js.append('  drums: [')
    js.append(',\n'.join('  [%s,%d,%d]' % (fmt(t), k, v) for t, k, _d, v in song['drums']))
    js.append('  ],')
    js.append('};')
    open(OUT_JS, 'w', encoding='utf-8').write('\n'.join(js) + '\n')


# ---------------- WAV 预览 ----------------
def synth(song):
    sr = 44100
    n = int(song['duration'] * sr) + sr
    buf = np.zeros(n, dtype=np.float64)
    for tr in song['tracks']:
        wave_type = tr['wave']
        for t, m, d, v in tr['notes']:
            d = max(0.03, min(d, 4))
            peak = max(0.0004, min(0.2, tr['gain'] * (0.4 + 0.6 * v / 127)))
            i0 = int(t * sr)
            ln = int(d * sr)
            if ln < 2 or i0 >= n:
                continue
            tt = np.arange(ln) / sr
            f = 440.0 * 2 ** ((m - 69) / 12)
            ph = 2 * np.pi * f * tt
            if wave_type == 'square':
                w = np.sign(np.sin(ph))
            elif wave_type == 'triangle':
                w = 2 / np.pi * np.arcsin(np.sin(ph))
            else:
                w = np.sin(ph)
            atk = min(0.012, d * 0.3)
            hold = max(atk, d * 0.66)
            env = np.ones_like(tt)
            env = np.where(tt < atk, tt / max(atk, 1e-6) * 0.999 + 0.001, env)
            env = np.where(tt >= hold, np.exp(-(tt - hold) / max(0.02, (d - hold) / 4.6)), env)
            env[0] = 0.0
            ln = min(ln, len(buf) - i0)
        if ln <= 0:
            continue
        buf[i0:i0 + ln] += w[:ln] * env[:ln] * peak
    # 鼓
    rng = np.random.default_rng(7)
    for t, kind, _dur, v in song['drums']:
        i0 = int(t * sr)
        if i0 >= n:
            continue
        amp = (0.12 if kind != 4 else 0.10) * (0.45 + 0.55 * v / 127)
        if kind == 0:
            ln = int(0.18 * sr)
            tt = np.arange(ln) / sr
            env = np.exp(-tt / 0.05)
            w = np.sin(2 * np.pi * (110 * np.exp(-tt / 0.03) + 42) * tt)
        elif kind == 1:
            ln = int(0.16 * sr)
            tt = np.arange(ln) / sr
            env = np.exp(-tt / 0.04)
            w = rng.standard_normal(ln) * 0.7 + np.sin(2 * np.pi * 190 * tt) * 0.5
        else:
            ln = int((0.55 if kind == 4 else 0.08) * sr)
            tt = np.arange(ln) / sr
            env = np.exp(-tt / (0.25 if kind == 4 else 0.02))
            w = rng.standard_normal(ln)
        buf[i0:i0 + ln] += w * env * amp
    # 简易限幅/归一
    peak = np.max(np.abs(buf)) or 1.0
    if peak > 0.9:
        buf *= 0.9 / peak
    return np.clip(buf, -1, 1)


def write_wav(buf, path):
    data = (buf * 32767).astype('<i2').tobytes()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(data)


def main():
    dry = '--dry' in sys.argv
    sections = build()
    if dry:
        for s in sections:
            print('TH%02d %-46s t=%+d key=%-3s oct=%+d fit=%.2f med=%d chords=%s' % (
                s['game'], s['name'][:46], s['t'], s['key'], s['oct'], s['fit'], s['med'],
                '/'.join(nn(root_midi(c) + 12) for c in s['chords'])))
            mel = s['notes'][:10]
            print('      mel: ' + ' '.join('%s@%.2f' % (nn(n[1]), n[0]) for n in mel))
        return
    song, bars = emit(sections)
    write_js(song)
    buf = synth(song)
    write_wav(buf, OUT_WAV)
    print('wrote %s (%d bars, %.2fs)' % (OUT_JS, bars, song['duration']))
    print('wrote %s' % OUT_WAV)


if __name__ == '__main__':
    main()
