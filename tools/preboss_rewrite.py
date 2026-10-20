#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/preboss_rewrite.py —— 1 面道中《ほおずきみたいに紅い魂》骨架重置版。

用户口径（m00346）：选曲保留，但不能直搬原曲；只做 1 面；方案 = 骨架重置。
保留（骨架）：调性、速度、逐小节和弦进行、原曲贝斯线、和声铺法、鼓的节奏型。
重写（皮肉）：整条主旋律。旋律不再是原曲的音高序列，只借原曲的调式与和弦走向。

旋律是手写的（MELODY 表：小节 -> (拍位, MIDI 音高, 拍长)），音高全部落在
该小节实际响的和弦音/调内音上；生成时会核对与原曲主旋律的 4 音片段重合数。

用法：
    python tools/preboss_rewrite.py --check   # 只打印分析
    python tools/preboss_rewrite.py           # 写 src/engine/songs/preboss.js
"""
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
import preboss2js as P
from preboss_rewrite_chords import analyse_chords, chord_symbol, weighted_pc   # noqa

MID = os.path.join(
    M.SRC_BASE,
    r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'preboss.js')

T0, T1 = 19.862, 72.828
BARS = 40          # 40 小节 ≈ 66.2s：原曲窗口 32 小节 + 回环尾声 8 小节
SRC_BARS = 32
LEAD_PLAN = [(19.862, 45.0, [5]), (45.0, 60.0, [3]), (60.0, 72.828, [6])]
BASS_CH, HARM_CH = 1, 4

# 32 小节 = A(4) + A2(4) + A3(4) + A'(4) + B(8) + C(8)。
# 每小节若干 (拍位, MIDI, 拍长)；音高取自该小节和弦音/调内音，见第 3 列注释。
MELODY = {
    1:  [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    2:  [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 67, .5), (3, 69, .5), (3.5, 74, .5)],
    3:  [(0, 75, 1), (1, 79, 1), (2, 77, 1), (3, 74, 1)],
    4:  [(0, 77, 1), (1, 74, 1), (2, 70, 1), (3, 67, 1)],
    5:  [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    6:  [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 70, .5), (3, 74, .5), (3.5, 77, .5)],
    7:  [(0, 77, 1), (1, 79, 1), (2, 77, 1), (3, 75, 1)],
    8:  [(0, 77, 1), (1, 79, 1), (2, 74, 1), (3, 70, 1)],
    9:  [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    10: [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 67, .5), (3, 69, .5), (3.5, 74, .5)],
    11: [(0, 75, 1), (1, 79, 1), (2, 77, 1), (3, 74, 1)],
    12: [(0, 77, 1), (1, 74, 1), (2, 70, 1), (3, 67, 1)],
    13: [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    14: [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 70, .5), (3, 74, .5), (3.5, 77, .5)],
    15: [(0, 79, 1), (1, 77, 1), (2, 75, 1), (3, 74, 1)],
    16: [(0, 74, 1), (1, 70, 1), (2, 69, .5), (2.5, 67, 1.5)],
    # —— B 段：整体压低、句子拉长 ——
    17: [(0, 77, 1.5), (1.5, 74, .5), (2, 72, 1), (3, 70, 1)],
    18: [(0, 78, 1.5), (1.5, 73, .5), (2, 70, 1), (3, 78, 1)],
    19: [(0, 75, 1.5), (1.5, 79, .5), (2, 72, 1), (3, 70, 1)],
    20: [(0, 79, 1), (1, 75, 1), (2, 74, 1), (3, 72, 1)],
    21: [(0, 77, 1.5), (1.5, 74, .5), (2, 72, 1), (3, 77, 1)],
    22: [(0, 78, 1.5), (1.5, 73, .5), (2, 70, 1), (3, 74, 1)],
    23: [(0, 75, 1.5), (1.5, 79, .5), (2, 72, 1), (3, 75, 1)],
    24: [(0, 75, 1), (1, 74, 1), (2, 72, 1.5), (3.5, 72, .5)],
    # —— C 段：抬到高音区，句子变短、密度上来 ——
    25: [(0, 73, 1), (1, 77, 1), (2, 80, 1), (3, 77, 1)],
    26: [(0, 78, 1), (1, 73, 1), (2, 82, 1), (3, 78, 1)],
    27: [(0, 73, 1), (1, 77, 1), (2, 80, 1), (3, 77, 1)],
    28: [(0, 78, 1), (1, 73, 1), (2, 82, 1), (3, 78, 1)],
    29: [(0, 77, 1), (1, 80, 1), (2, 77, 1), (3, 73, 1)],
    30: [(0, 78, 1), (1, 82, 1), (2, 78, 1), (3, 73, 1)],
    31: [(0, 73, .5), (.5, 77, .5), (1, 80, 1), (2, 77, 1), (3, 73, 1)],
    32: [(0, 73, 1), (1, 70, 1), (2, 66, 1.5)],
    # —— 尾声（回环）：回到主歌再收一次，第 40 小节落回主音，接第 1 小节 ——
    33: [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    34: [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 67, .5), (3, 69, .5), (3.5, 74, .5)],
    35: [(0, 75, 1), (1, 79, 1), (2, 77, 1), (3, 74, 1)],
    36: [(0, 77, 1), (1, 74, 1), (2, 70, 1), (3, 67, 1)],
    37: [(0, 74, 1), (1, 70, .5), (1.5, 69, .5), (2, 67, 1), (3, 69, .5), (3.5, 70, .5)],
    38: [(0, 74, 1.5), (1.5, 70, .5), (2, 69, .5), (2.5, 70, .5), (3, 74, .5), (3.5, 77, .5)],
    39: [(0, 79, 1), (1, 77, 1), (2, 75, 1), (3, 74, 1)],
    40: [(0, 74, 1), (1, 70, 1), (2, 69, .5), (2.5, 67, 1.5)],
}


def crop_shift(notes):
    out = []
    for n in notes:
        if T0 <= n['t'] < T1:
            out.append(dict(t=round(n['t'] - T0, 3),
                            d=max(0.03, round(min(n['d'], T1 - n['t']), 3)),
                            m=int(n['m']), v=int(n['v'])))
    out.sort(key=lambda n: (n['t'], n['m']))
    return out


def melody_onsets(chans):
    """原曲主旋律落点（只用来做「4 音片段重合」核对，不用作新旋律）。"""
    src = []
    for a, b, chs in LEAD_PLAN:
        for ch in chs:
            src.extend(n for n in chans.get(ch, {}).get('notes', []) if a <= n['t'] < b)
    src.sort(key=lambda n: (n['t'], n['m']))
    mono = M.to_monophonic(M.mono_ize(src, keep='high'))
    return [n for n in mono if T0 <= n['t'] < T1]


def render_melody(bpm, bars):
    beat = 60.0 / bpm
    bar = 4 * beat
    out = []
    for b in range(1, bars + 1):
        for (pos, pitch, dur_beats) in MELODY.get(b, []):
            t = (b - 1) * bar + pos * beat
            if t >= bars * bar:
                continue
            vel = 106 if abs(pos % 2.0) < 1e-6 else 90
            out.append(dict(t=round(t, 3), d=round(min(dur_beats * beat, 4.0), 3),
                            m=int(pitch), v=vel))
    return out


def extend_loop(notes, cutoff, shift, is_drum=False):
    """把前 cutoff 秒的素材整体后移 shift 秒，拼成回环尾声（和弦与开头相同）。"""
    if is_drum:
        return list(notes) + [(round(d[0] + shift, 3), d[1], d[2])
                              for d in notes if d[0] < cutoff]
    return list(notes) + [dict(t=round(n['t'] + shift, 3), d=n['d'], m=n['m'], v=n['v'])
                          for n in notes if n['t'] < cutoff]


def main():
    check_only = '--check' in sys.argv
    if not os.path.exists(MID):
        raise SystemExit('MIDI 不在：' + MID)
    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    bar = 4 * 60.0 / bpm
    src_bars = int(round((T1 - T0) / bar))
    print('bpm=%s bar=%.5fs 原曲窗口 %d 小节 → 成品 %d 小节（%.2fs）'
          % (bpm, bar, src_bars, BARS, BARS * bar))

    bass_src = chans.get(BASS_CH, {}).get('notes', [])
    harm_src = chans.get(HARM_CH, {}).get('notes', [])
    chords = analyse_chords(bass_src, harm_src, src_bars, bar)
    chords = chords + [dict(chords[b]) for b in range(BARS - src_bars)]
    wp = weighted_pc([n for n in bass_src if T0 <= n['t'] < T1])
    tonic = max(wp, key=lambda k: wp[k])
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    print('调式：%s 小调（主音 %s）' % (names[tonic], names[tonic]))
    print('和弦进行：' + ' | '.join(chord_symbol(c) for c in chords))

    lead = render_melody(bpm, BARS)
    lead = [n for n in lead if n['t'] < BARS * bar]

    # 核对：与原曲主旋律的 4 音片段重合数
    orig = melody_onsets(chans)
    orig_seq = [n['m'] for n in orig]
    orig_grams = {tuple(orig_seq[i:i + 4]) for i in range(len(orig_seq) - 3)}
    new_seq = [n['m'] for n in lead]
    new_grams = {tuple(new_seq[i:i + 4]) for i in range(len(new_seq) - 3)}
    overlap = len(new_grams & orig_grams)
    ints = [new_seq[i + 1] - new_seq[i] for i in range(len(new_seq) - 1)]
    step = sum(1 for x in ints if abs(x) <= 2)
    big = sum(1 for x in ints if abs(x) >= 5)
    print('新主旋律：%d 音，音域 %d..%d，4 音片段 %d 个，与原曲重合 %d 个'
          % (len(new_seq), min(new_seq), max(new_seq), len(new_grams), overlap))
    print('音程走向：级进 %d%% / 五度以上跳进 %d%% / 同音反复 %d%%'
          % (100 * step // max(1, len(ints)), 100 * big // max(1, len(ints)),
             100 * sum(1 for x in ints if x == 0) // max(1, len(ints))))
    if overlap:
        raise SystemExit('!! 仍与原曲有 %d 个 4 音片段重合，先改 MELODY 表' % overlap)

    bass = crop_shift(M.mono_ize(bass_src, keep='low'))
    harm = crop_shift(M.cap_poly([n for n in harm_src if T0 <= n['t'] < T1], 2))

    drums = M.map_drums(chans.get(9, {}).get('notes', []))
    drums = M.thin_drums(drums, limits=P.DRUM_LIMITS)
    drums = P.polish_drums(drums)
    drums = [(round(d[0] - T0, 3), d[1], d[2]) for d in drums if T0 <= d[0] < T1]

    # 回环尾声：把开头 8 小节的贝斯/和声/鼓原样后移，接在第 32 小节之后
    tail_bars = BARS - src_bars
    keep = tail_bars * bar
    off = src_bars * bar
    bass = extend_loop(bass, keep, off)
    harm = extend_loop(harm, keep, off)
    drums = extend_loop(drums, keep, off, is_drum=True)
    lead.sort(key=lambda n: (n['t'], n['m']))
    bass.sort(key=lambda n: (n['t'], n['m']))
    harm.sort(key=lambda n: (n['t'], n['m']))
    drums.sort()

    duration = round(BARS * bar, 3)
    data = dict(key='pre1', title='ほおずきみたいに紅い魂（骨架重置）',
                duration=duration, bpm=bpm,
                tracks=[dict(wave='square', gain=0.15, notes=lead, _name='lead', _w=1.0),
                        dict(wave='triangle', gain=0.15, notes=bass, _name='bass', _w=0.8),
                        dict(wave='square', gain=0.05, notes=harm, _name='harmony', _w=0.35)],
                drums=drums)
    reasons = [
        '骨架重置：保留 %s 小调 / %.1fBPM / 逐小节和弦进行（%s…）/ 原曲贝斯线与鼓型'
        % (names[tonic], bpm, chord_symbol(chords[0])),
        '主旋律整条重写（手写 %d 小节，32 小节后接 8 小节回环尾声），与原曲 %d 个 4 音片段重合 %d 个'
        % (BARS, len(orig_grams), overlap),
        '旋律音高全部落在当小节实际和弦音/调内音上',
    ]
    data['reasons'] = reasons

    print('lead %d 音 / bass %d 音 / harm %d 音 / drums %d 击 / %.3fs'
          % (len(lead), len(bass), len(harm), len(drums), duration))
    if check_only:
        return

    body = M.render_song_js(data, reasons)
    head = """/**
 * 道中 / 前置 BGM —— Boss 登场前播放的那一段。
 *
 * 数据格式见 src/engine/songs/index.js 顶部注释。
 * 本文件由 tools/preboss_rewrite.py 生成，勿手改。
 *
 * pre1 = 1 面道中《ほおずきみたいに紅い魂》骨架重置版：
 * 保留原曲的调性、速度（%.1fBPM）、逐小节和弦进行、贝斯线与鼓的节奏型；
 * 主旋律是重新手写的新旋律（40 小节：原曲窗口 32 小节 + 8 小节回环尾声），
 * 不是原曲音高序列。
 */
""" % bpm
    out = head + 'export const PREBOSS_SONGS = {\n' + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
