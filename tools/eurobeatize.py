#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/eurobeatize.py —— 把现有曲子重排成 EUROBEAT 骨架（速度 + 鼓组 + 贝斯 + 和弦 stab）。

蓝本：A-One「TOHO EUROBEAT VOL.16 永夜抄」第 1 轨《月夜の泣き蟲》
（vocal あき / 編曲 DJ Command / 原曲 幻視の夜 ～ Ghostly Eyes + 蠢々秋月 ～ Mooned Insect）。
实测该曲 ≈157 BPM，4 踩底鼓 + 反拍开镲 + 八分锯齿贝斯 + 反拍和弦 stab。

用法：
    python tools/eurobeatize.py --key stage2 --bpm 157 --bars 64 --out-jar src/engine/songs/eurobeat.js
"""
import argparse
import json
import math
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
SRC_EXPORT = 'BOSS_SONGS'


def chord_root_per_bar(bass, harm, bar, bars):
    """逐小节从贝斯/和声轨统计根音与三音，返回 [(root_pc, third), ...]。"""
    out = []
    for b in range(bars):
        a, z = b * bar, (b + 1) * bar
        w = {}
        for n in bass:
            t, m, d, v = n
            if a <= t < z:
                w[m % 12] = w.get(m % 12, 0) + max(0.1, min(d, bar)) * (0.6 + 0.4 * v / 127.0)
        if not w:
            out.append((None, 3))
            continue
        root = max(w, key=lambda k: w[k])
        rel = set()
        for n in harm:
            t, m, d, v = n
            if a <= t < z:
                rel.add((m - root) % 12)
        third = 3 if 3 in rel else (4 if 4 in rel else 3)
        out.append((root, third))
    return out


def nearest(pc, lo=38, hi=52):
    for p in range(lo, hi + 1):
        if p % 12 == pc:
            return p
    return lo + pc % 12


def melody_backing(lead_new, chords, bars, bar_new, beat, duration):
    """让伴奏染上主旋律的韵味：贝斯跟着旋律的拍点、和声落在旋律的呼吸上、高八度只勾长音轮廓。"""
    bass_new, harm_new, sparkle = [], [], []
    for b in range(bars):
        root_pc, third = chords[b]
        if root_pc is None:
            continue
        ns = sorted([n for n in lead_new if b * bar_new <= n['t'] < (b + 1) * bar_new],
                    key=lambda n: (n['t'], n['m']))
        if not ns:
            continue
        r = nearest(root_pc)
        # 贝斯：照主旋律的拍点抽稀（间隔 < 半拍就并掉），根音 / 五度 / 八度 轮流接
        picked = []
        for n in ns:
            if not picked or n['t'] - picked[-1]['t'] >= beat * 0.5:
                picked.append(n)
        picked = picked[:6]
        ivs = [0, 7, 12, 0, 12, 7]
        for i, n in enumerate(picked):
            bass_new.append(dict(t=round(n['t'], 3), d=round(max(0.12, n['d'] * 0.7), 3),
                                 m=r + ivs[i % len(ivs)],
                                 v=int(max(70, min(112, n['v'] - 10)))))
        # 和声：只在旋律的长音上落三和弦，跟着旋律的呼吸走
        rc = nearest(root_pc, 60, 72)
        for n in ns:
            if n['d'] >= beat * 0.9:
                for iv in (0, third, 7):
                    harm_new.append(dict(t=round(n['t'], 3), d=round(min(2.0, n['d'] * 0.8), 3),
                                         m=rc + iv, v=72))
        # 高八度影子：只跟长音，勾出主旋律的轮廓而不是逐音复读
        for n in ns:
            if n['d'] >= beat * 0.45 and n['m'] + 12 <= 120:
                sparkle.append(dict(t=round(n['t'], 3), d=round(min(2.0, n['d'] * 0.85), 3),
                                    m=n['m'] + 12, v=int(max(52, n['v'] - 26))))
    for arr in (bass_new, harm_new, sparkle):
        arr.sort(key=lambda n: (n['t'], n['m']))
    return bass_new, harm_new, sparkle


def eurobeatize(song, bpm, bars, drum_scale=1.0, chorus_range=None, chorus_level=None, drum_mode='grid',
                arrange='eurobeat',
                stab_mode='offbeat', kick_vel=18, snare_vel=15, stab_gain=0.045,
                sparkle_gain=0.04, lead_gain=0.15, lead_wave='sawtooth', half=False):
    old_bpm = float(song['bpm'])
    scale = old_bpm / float(bpm)          # 保持小节位置不变，只把时间轴拉伸到新速度
    bar_old = 4 * 60.0 / old_bpm
    bar_new = 4 * 60.0 / float(bpm)
    duration = round(bars * bar_new, 3)
    beat = bar_new / 4.0

    tracks = song['tracks']
    lead = tracks[0]['notes']
    bass = tracks[1]['notes'] if len(tracks) > 1 else []
    harm = tracks[2]['notes'] if len(tracks) > 2 else []

    chords = chord_root_per_bar(bass, harm, bar_old, bars)

    # --- 主旋律：保留，整体重定时 ---
    lead_new = []
    for (t, m, d, v) in lead:
        nt = t * scale
        if nt >= duration:
            continue
        lead_new.append(dict(t=round(nt, 3), d=round(min(4.0, max(0.06, d * scale)), 3),
                             m=int(m), v=int(min(120, v + 6))))
    lead_new.sort(key=lambda n: (n['t'], n['m']))

    # --- 鼓：EUROBEAT（四踩 + 2/4 军鼓 + 八分闭镲 + 反拍开镲）---
    # half=True 时改成半速律动：底鼓只踩 1、3 拍，军鼓只落第 3 拍，闭镲变四分
    drums = []
    for b in range(bars):
        base = b * bar_new
        if half:
            for k in (0, 2):
                drums.append((round(base + k * beat, 3), 0, 108))      # 底鼓 1、3
            drums.append((round(base + 2 * beat, 3), 1, 100))          # 军鼓第 3 拍
            for k in range(0, 8, 2):
                drums.append((round(base + k * beat / 2.0, 3), 2, 60)) # 闭镲四分
            if b % 2 == 0:
                drums.append((round(base + 3 * beat + beat / 2.0, 3), 3, 74))
            if b % 8 == 0:
                drums.append((round(base, 3), 4, 86))
        else:
            for k in range(4):
                drums.append((round(base + k * beat, 3), 0, 114))      # 底鼓
            for k in (1, 3):
                drums.append((round(base + k * beat, 3), 1, 106))      # 军鼓 2/4
            for k in range(8):
                vel = 72 if k % 2 == 0 else 58
                drums.append((round(base + k * beat / 2.0, 3), 2, vel))# 闭镲八分
            for k in (1, 3):
                drums.append((round(base + k * beat + beat / 2.0, 3), 3, 86))
            drums.append((round(base + 3 * beat + beat / 2.0, 3), 1, 72))
            if b % 8 == 0:
                drums.append((round(base, 3), 4, 92))
    # --- 副歌补拍：让副歌跟主歌同一条拍子，而不是被半速鼓拖着走 ---
    chorus_bars = []
    if half and chorus_range is not None:
        chorus_bars = list(range(chorus_range[0], min(bars, chorus_range[1] + 1)))
        print('副歌小节（手动指定）：%d-%d' % (chorus_bars[0], chorus_bars[-1]))
    elif half:
        counts = [sum(1 for n in lead_new if b * bar_new <= n['t'] < (b + 1) * bar_new)
                  for b in range(bars)]
        # 先做 4 小节滑动平均，让段落连成片，避免按单小节抖动
        sm = []
        for b in range(bars):
            win = counts[max(0, b - 1):min(bars, b + 3)]
            sm.append(sum(win) / float(len(win)) if win else 0)
        srt = sorted(sm)
        med = srt[len(srt) // 2] if srt else 0
        chorus_bars = [b for b in range(bars) if sm[b] >= med * 1.10]
        print('副歌小节（按旋律密度识别）：%s' % (chorus_bars,))

    if drum_scale != 1.0:
        drums = [(round(t, 3), k, max(20, int(round(v * drum_scale)))) for (t, k, v) in drums]

    # 旋律锁拍：底鼓/军鼓只踩主旋律自己的「大拍」（每小节最长的那几个音），声音压到只留痕迹
    if drum_mode == 'melody':
        drums = []
        by_bar = [[] for _ in range(bars)]
        for n in lead_new:
            bi = int(n['t'] // bar_new)
            if 0 <= bi < bars:
                by_bar[bi].append(n)
        for b in range(bars):
            ns = sorted(by_bar[b], key=lambda n: (-n['d'], n['t']))
            if not ns:
                continue
            k0 = ns[0]
            drums.append((round(k0['t'], 3), 0, kick_vel))
            rest = [n for n in ns[1:] if n['t'] >= k0['t'] + beat * 1.2]
            if rest:
                drums.append((round(rest[0]['t'], 3), 1, snare_vel))
        print('旋律锁拍：%d 拍（底鼓 %d / 军鼓 %d）' % (
            len(drums), sum(1 for x in drums if x[1] == 0), sum(1 for x in drums if x[1] == 1)))

    # 补拍放在缩力之后：主歌是很轻的半速，副歌补上的拍点要用「没被压过的力度」才追得上
    if half and drum_mode == 'grid':
        lvl = chorus_level if chorus_level is not None else drum_scale
        ck, cs, ch = int(round(46 * lvl / 0.35)), int(round(40 * lvl / 0.35)), int(round(28 * lvl / 0.35))
        for b in chorus_bars:
            base = b * bar_new
            for k in (1, 3):
                drums.append((round(base + k * beat, 3), 0, ck))       # 副歌补 2、4 拍底鼓
                drums.append((round(base + k * beat, 3), 1, cs))       # 副歌补 2、4 拍军鼓
            for k in range(8):
                drums.append((round(base + k * beat / 2.0, 3), 2, ch)) # 副歌补八分闭镲
    drums.sort()

    # --- 贝斯：八分锯齿，根音/八度/五度 ---
    bass_new = []
    for b in range(bars):
        root_pc, third = chords[b]
        if root_pc is None:
            continue
        r = nearest(root_pc)
        pattern = [0, 0, 12, 0, 7, 0, 12, 7]
        for k, iv in enumerate(pattern):
            t = b * bar_new + k * beat / 2.0
            if t >= duration:
                continue
            vel = 112 if k % 2 == 0 else 92
            bass_new.append(dict(t=round(t, 3), d=round(beat * 0.40, 3), m=r + iv, v=vel))

    if arrange == 'melody':
        # 伴奏全部从主旋律里长出来：节奏跟旋律、和声落在旋律的呼吸上
        bass_new, harm_new, sparkle = melody_backing(lead_new, chords, bars, bar_new, beat, duration)
    else:
        # --- 和弦 stab：反拍（半拍处）三音短音 ---
        harm_new = []
        for b in range(bars):
            root_pc, third = chords[b]
            if root_pc is None:
                continue
            r = nearest(root_pc, 60, 72)
            kk = (0, 2) if stab_mode == 'onbeat' else (0, 1, 2, 3)
            for k in kk:
                t = b * bar_new + k * beat + (0.0 if stab_mode == 'onbeat' else beat / 2.0)
                if t >= duration:
                    continue
                for iv in (0, third, 7):
                    harm_new.append(dict(t=round(t, 3), d=round(beat * 0.26, 3), m=r + iv, v=92))

        sparkle = [dict(t=n['t'], d=min(2.0, round(n['d'] * 0.9, 3)), m=n['m'] + 12, v=max(60, n['v'] - 20))
                   for n in lead_new if n['m'] + 12 <= 120]
        sparkle.sort(key=lambda n: (n['t'], n['m']))
    data = dict(key=song.get('key', 'euro'), title=song.get('title', '') + '（EUROBEAT）',
                duration=duration, bpm=int(bpm),
                tracks=[dict(wave=lead_wave, gain=lead_gain, notes=lead_new, _name='lead', _w=1.0),
                        dict(wave='sawtooth', gain=0.12, notes=bass_new, _name='bass', _w=0.8),
                        dict(wave='square', gain=stab_gain, notes=harm_new, _name='stab', _w=0.35),
                        dict(wave='triangle', gain=sparkle_gain, notes=sparkle, _name='sparkle', _w=0.3)],
                drums=drums)
    data['reasons'] = [
        'EUROBEAT 骨架（蓝本 A-One《月夜の泣き蟲》≈%d BPM）' % int(bpm),
        '主旋律沿用 %s，整体从 %s BPM 重定时到 %s BPM' % (song.get('title', ''), int(old_bpm), int(bpm)),
        '四踩底鼓 + 2/4 军鼓 + 八分闭镲 + 反拍开镲；锯齿八分贝斯；反拍三音和弦 stab',
    ]
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--key', default='stage2')
    ap.add_argument('--bpm', type=float, default=157.0)
    ap.add_argument('--bars', type=int, default=64)
    ap.add_argument('--export', default='EUROBEAT_SONGS')
    ap.add_argument('--out-js', default=os.path.join(ROOT, 'src', 'engine', 'songs', 'eurobeat_stage2.js'))
    ap.add_argument('--drum-scale', type=float, default=1.0)
    ap.add_argument('--half', action='store_true')
    ap.add_argument('--stab-gain', type=float, default=0.045)
    ap.add_argument('--sparkle-gain', type=float, default=0.04)
    ap.add_argument('--chorus', default=None, help='副歌小节区间，如 28-38')
    ap.add_argument('--chorus-level', type=float, default=None, help='副歌补拍力度系数，默认跟 drum_scale')
    ap.add_argument('--drum-mode', default='grid', choices=['grid', 'melody'])
    ap.add_argument('--arrange', default='eurobeat', choices=['eurobeat', 'melody'])
    ap.add_argument('--lead-gain', type=float, default=0.15)
    ap.add_argument('--lead-wave', default='sawtooth')
    ap.add_argument('--stab-mode', default='offbeat', choices=['offbeat', 'onbeat'])
    ap.add_argument('--kick-vel', type=int, default=18)
    ap.add_argument('--snare-vel', type=int, default=15)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    chorus_range = None
    if args.chorus:
        a, b = args.chorus.split('-')
        chorus_range = (int(a), int(b))

    song = PS.load_song(SRC_FILE, SRC_EXPORT, args.key)
    print('源曲 %s：bpm=%s dur=%.2fs tracks=%d' % (song.get('title'), song['bpm'], song['duration'], len(song['tracks'])))
    data = eurobeatize(song, args.bpm, args.bars, drum_scale=args.drum_scale,
                       chorus_range=chorus_range, chorus_level=args.chorus_level,
                       drum_mode=args.drum_mode, arrange=args.arrange, stab_mode=args.stab_mode,
                       kick_vel=args.kick_vel, snare_vel=args.snare_vel,
                       lead_gain=args.lead_gain, lead_wave=args.lead_wave,
                       stab_gain=args.stab_gain, sparkle_gain=args.sparkle_gain, half=args.half)
    data['key'] = args.key
    print('输出：%d 小节 / %.3fs / bpm %d / lead %d / bass %d / stab %d / drums %d'
          % (args.bars, data['duration'], data['bpm'], len(data['tracks'][0]['notes']),
             len(data['tracks'][1]['notes']), len(data['tracks'][2]['notes']), len(data['drums'])))
    if args.check:
        return
    body = M.render_song_js(data, data['reasons'])
    head = """/**
 * EUROBEAT 重排曲 —— 由 tools/eurobeatize.py 生成，勿手改。
 *
 * 蓝本：A-One「TOHO EUROBEAT VOL.16 永夜抄」第 1 轨《月夜の泣き蟲》
 *        （vocal あき / 編曲 DJ Command / 原曲 幻視の夜 + 蠢々秋月）
 * 手法：主旋律沿用原编曲，速度按蓝本重定；鼓组改成四踩+反拍开镲的 EUROBEAT
 *       骨架，贝斯换锯齿八分，和声换反拍三音 stab。
 */
"""
    out = head + 'export const %s = {\n' % args.export + body + ',\n};\n'
    with open(args.out_js, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (args.out_js, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
