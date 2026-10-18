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

# game: (start_bar, 备注)；start_bar 为 0 起
SCORE = [
    (6,  1, 'A Dream that is More Scarlet than Red'),
    (7,  2, 'Ghostly Dream ~ Snow or Cherry Petal'),
    (8,  2, 'Eternal Night Vignette ~ Eastern Night'),
    (9,  2, 'Flower Viewing Mound ~ Higan Retour'),
    (10, 6, 'Sealed Gods'),
    (11, 1, 'Awakening of the Earth Spirits'),
    (12, 3, 'A Shadow in the Blue Sky'),
    (13, 21, 'Spirit of Avarice'),
    (14, 1, 'Mysterious Purification Rod'),
    (15, 8, 'The Space Shrine Maiden Appears'),
    (16, 0, 'The Sky Where Cherry Blossoms Flutter Down'),
    (17, 1, 'Entrusting this World to Idols ~ Idolatrize World（代替缺失的标题曲）'),
    (18, 0, 'A Rainbow Spanning Gensokyo'),
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
        while med + oct_shift * 12 < 69:
            oct_shift += 1
        while med + oct_shift * 12 > 83:
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
    for game, start, note in SCORE:
        th = themes[str(game)]
        b0 = start * BAR_BEATS
        b1 = b0 + SEC_BARS * BAR_BEATS
        raw = [n for n in th['notes'] if b0 <= n[0] < b1]
        if not raw:
            print('!! TH%d 在 %d 小节没有音符' % (game, start + 1))
            continue
        if game in OVERRIDE:
            t, key = OVERRIDE[game]
            shifted = [[n[0], n[1] + t, n[2]] for n in raw]
            med = np.median([n[1] for n in shifted])
            oct_shift = 0
            while med + oct_shift * 12 < 69:
                oct_shift += 1
            while med + oct_shift * 12 > 83:
                oct_shift -= 1
            f = fit_score([[n[0], n[1] + oct_shift * 12, n[2]] for n in shifted], key)
            pick = (0, t, key, oct_shift, f, med + oct_shift * 12)
        else:
            pick = choose(raw, prev_key)
        _, t, key, oct_shift, f, med = pick
        notes = [[n[0] - b0, n[1] + t + oct_shift * 12,
                  min(4.0, max(0.25, n[2]))] for n in raw]
        notes.sort()
        # 每小节和弦
        chords = []
        prev_root = None
        for bar in range(SEC_BARS):
            bn = [n for n in notes if bar * 4 <= n[0] < (bar + 1) * 4]
            r = chord_for_bar(bn, key, prev_root) if bn else (prev_root if prev_root is not None else KEYS[key][0])
            chords.append(r)
            prev_root = r
        sections.append(dict(game=game, name=note, key=key, t=t, oct=oct_shift,
                             fit=f, med=med, notes=notes, chords=chords,
                             start_bar=INTRO_BARS + len(sections) * SEC_BARS))
        prev_key = key
    return sections


def emit(sections):
    total_bars = INTRO_BARS + len(sections) * SEC_BARS + OUTRO_BARS
    duration = round(total_bars * BAR_BEATS * SEC_PER_BEAT, 6)
    lead, bass, arp, drums = [], [], [], []

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
            add(lead, base + n[0], n[1], n[2], 92)
        for bar in range(SEC_BARS):
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
            for i in range(8):
                add(arp, bbeat + i * 0.5, seq[i % 4] + 60, 0.45, 60 + lvl * 4)
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

    # ---------- 尾声：回到 Dm，引用 TH18 轮廓 ----------
    obar = INTRO_BARS + len(sections) * SEC_BARS
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

    for tr in (lead, bass, arp):
        tr.sort()
    drums.sort()
    song = dict(title='東方新紀行 ～ Chronicle of Gensokyo (13th Anniversary Medley)',
                duration=duration, bpm=BPM,
                tracks=[dict(wave='square', gain=0.135, notes=lead),
                        dict(wave='triangle', gain=0.125, notes=bass),
                        dict(wave='square', gain=0.05, notes=arp)],
                drums=drums)
    return song, total_bars


def write_js(song):
    def arr(notes):
        return ',\n'.join('  [%s,%d,%s,%d]' % (fmt(t), m, fmt(d), v) for t, m, d, v in notes)

    def fmt(x):
        return ('%.6f' % x).rstrip('0').rstrip('.')

    js = ['/**',
          ' * 标题曲：東方新紀行 ～ Chronicle of Gensokyo（13 作 medley）。',
          ' * 由 tools/build_medley.py 生成，勿手改。',
          ' * 素材：TH06–TH18 各作标题曲（TH17 用《Idolatrize World》代）；',
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
    js.append(arr(song['drums']))
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
            buf[i0:i0 + ln] += w * env * peak
    # 鼓
    rng = np.random.default_rng(7)
    for t, kind, v in song['drums']:
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
