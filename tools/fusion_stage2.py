#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/fusion_stage2.py —— 2 面 Boss：A 的速度（155 BPM）× B 的鼓与低频厚度（融合版）。

蓝本 A：大江戸宅急便《蠢々秋月》/《漂泊浪漫》155 BPM 舞曲底盘
蓝本 B：ClearLeMel《Fantasia Nightbug》/《祭夏》(C86) 83 BPM 乐队型厚低音
融合：速度与主旋律骨架走 A；鼓组把 A 的四踩与 B 的 16 分细碎、重军鼓叠起来；
      低频用「锯齿八分贝斯 + 正弦低八度」双层顶到蓝本 0–120Hz 三成的量。
"""
import os, sys, math, argparse
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
import preview_song as PS
import eurobeatize as E

SRC_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
SRC_EXPORT = 'BOSS_SONGS'
SRC_KEY = 'stage2'
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'fusion_stage2.js')


def _t(n):
    return (n['t'], n['m'], n['d'], n['v']) if isinstance(n, dict) else tuple(n)


def fusion_drums(bars, bar, beat, kick=110, snare=102, hat=48, hat16=34, open_hat=74, crash=86):
    d = []
    for b in range(bars):
        base = b * bar
        for k in range(4):
            d.append((round(base + k * beat, 3), 0, kick))          # 四踩
        for k in (1, 3):
            d.append((round(base + k * beat, 3), 1, snare))        # 2、4 军鼓
        for k in range(8):
            d.append((round(base + k * beat / 2.0, 3), 2, hat))    # 八分闭镲
        for k in range(16):
            if k % 2 == 1:
                d.append((round(base + k * beat / 4.0, 3), 2, hat16))  # 16 分细碎
        d.append((round(base + 3.5 * beat, 3), 3, open_hat))       # 反拍开镲
        if b % 8 == 0:
            d.append((round(base, 3), 4, crash))
    return sorted(d)


def build_at(bpm, lead_gain, bass_gain=0.28, sub_gain=0.16, stab_gain=0.022, sparkle_gain=0.025):
    song = PS.load_song(SRC_FILE, SRC_EXPORT, SRC_KEY)
    bar = 4 * 60.0 / bpm
    beat = bar / 4.0
    scale = float(song['bpm']) / bpm
    bars = int(math.ceil(song['duration'] * scale / bar - 1e-9))
    data = E.eurobeatize(song, bpm, bars, drum_scale=1.0, half=False,
                         drum_mode='grid', stab_mode='onbeat',
                         stab_gain=stab_gain, sparkle_gain=sparkle_gain)
    data['tracks'][0]['wave'] = 'square'
    data['tracks'][0]['gain'] = lead_gain
    for tr in data['tracks']:
        if tr['wave'] == 'sawtooth' and tr.get('gain', 0) >= 0.1:
            tr['gain'] = bass_gain
    data['drums'] = fusion_drums(bars, bar, beat)
    bass = data['tracks'][1]['notes']
    data['tracks'].append({'wave': 'sine', 'gain': sub_gain,
                           'notes': [{'t': round(t, 3), 'm': max(12, m - 12), 'd': d, 'v': int(v * 0.9)}
                                     for t, m, d, v in map(_t, bass)]})
    data['key'] = 'stage2'
    data['title'] = '蠢々秋月 ～ Mooned Insect（融合版）'
    return data, bars, bar


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=155.0)
    ap.add_argument('--lead-gain', type=float, default=0.16)
    ap.add_argument('--bass-gain', type=float, default=0.28)
    ap.add_argument('--sub-gain', type=float, default=0.16)
    ap.add_argument('--stab-gain', type=float, default=0.022)
    ap.add_argument('--sparkle-gain', type=float, default=0.025)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    song = PS.load_song(SRC_FILE, SRC_EXPORT, SRC_KEY)
    bpm = args.bpm
    bar = 4 * 60.0 / bpm
    beat = bar / 4.0
    scale = float(song['bpm']) / bpm
    bars = int(math.ceil(song['duration'] * scale / bar - 1e-9))
    data = E.eurobeatize(song, bpm, bars, drum_scale=1.0, half=False,
                         drum_mode='grid', stab_mode='onbeat',
                         stab_gain=args.stab_gain, sparkle_gain=args.sparkle_gain)
    data['tracks'][0]['wave'] = 'square'
    data['tracks'][0]['gain'] = args.lead_gain
    for tr in data['tracks']:
        if tr['wave'] == 'sawtooth' and tr.get('gain', 0) >= 0.1:
            tr['gain'] = args.bass_gain
    data['drums'] = fusion_drums(bars, bar, beat)
    bass = data['tracks'][1]['notes']
    data['tracks'].append({'wave': 'sine', 'gain': args.sub_gain,
                           'notes': [{'t': round(t, 3), 'm': max(12, m - 12), 'd': d, 'v': int(v * 0.9)}
                                     for t, m, d, v in map(_t, bass)]})
    data['key'] = 'stage2'
    data['title'] = '蠢々秋月 ～ Mooned Insect（融合版：大江戸宅急便 × Fantasia Nightbug）'
    data['reasons'] = [
        '融合：速度与骨架取大江戸宅急便版（155 BPM），鼓的厚度与低频取 Fantasia Nightbug 版',
        '主旋律沿用 ZUN 线（150→155 重定时，%d 音）' % len(data['tracks'][0]['notes']),
        '鼓：四踩底鼓 + 2/4 军鼓 + 八分闭镲 + 16 分细碎 + 反拍开镲 + 每 8 小节吊镲',
        '低音双层：锯齿八分贝斯 0.28 + 正弦低八度 0.16（复刻蓝本 0–120Hz 三成占比）',
        '%d 小节 / %.1fs 循环' % (bars, data['duration']),
    ]
    print('%d 小节 / %.2fs / drums %d / lead %d / tracks %d'
          % (bars, data['duration'], len(data['drums']), len(data['tracks'][0]['notes']), len(data['tracks'])))
    if args.check:
        return
    body = M.render_song_js(data, data['reasons'])
    out = ('/**\n * 2 面 Boss 融合版 —— tools/fusion_stage2.py 生成，勿手改。\n */\n'
           'export const FUSION_STAGE2 = {\n' + body + ',\n};\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入', OUT_JS, '%.1f KB' % (len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()