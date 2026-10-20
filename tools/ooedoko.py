#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/ooedoko.py —— 把 2 面 Boss《蠢々秋月》按 大江戸宅急便《漂泊浪漫》版蓝本重编。

蓝本实测（ref3.mp3 = 酷狗 4A537AD76C9D46B2AA81914DA316C721，156.43s）：
  速度 ~155 BPM（底鼓包络 153、包络自相关 155.4）
  RMS 0.179 峰值 0.978 压缩极重；左右相关 0.542（宽声场）
  频段：0–120Hz 20–43%（底鼓+贝斯撑满）、120–500 17–35%、500–2k 6–33%、2–6k 5–16%、6–16k 5–14%
  质心 1128–1900Hz；端点密度 5.80 次/秒；84s 处 breakdown（低频 43%、质心掉到 1168）
做法：主旋律沿用 ZUN 线（150→155 重定时），伴奏按蓝本重写：
  ＊四踩底鼓 + 2/4 军鼓 + 八分闭镲 + 反拍开镲（舞曲底盘）
  ＊锯齿贝斯八分（低频占比往蓝本靠：权重大）
  ＊主音 square 芯片（非 8bit 方向：可选 sawtooth）
用法：
  python tools/ooedoko.py --bpm 155 --lead-wave square --out-js src/engine/songs/ooedo_stage2.js
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


def build(bpm, lead_wave, lead_gain, drum_scale, bass_gain, stab_gain, sparkle_gain, chorus=None, chorus_level=None, sub_gain=0.0, hats16=False):
    song = PS.load_song(SRC_FILE, SRC_EXPORT, SRC_KEY)
    bar_new = 4 * 60.0 / bpm
    scale = float(song['bpm']) / bpm
    bars = int(math.ceil(song['duration'] * scale / bar_new - 1e-9))
    data = E.eurobeatize(song, bpm, bars, drum_scale=drum_scale, half=False,
                         chorus_range=chorus, chorus_level=chorus_level,
                         drum_mode='grid', stab_mode='onbeat', stab_gain=stab_gain,
                         sparkle_gain=sparkle_gain)
    # 低音补强：正弦低八度铺底（蓝本 0-120Hz 占 31%）
    if sub_gain > 0:
        bass = data['tracks'][1]['notes']
        def _t(n): return (n['t'], n['m'], n['d'], n['v']) if isinstance(n, dict) else tuple(n)
        sub = [{'t': round(t, 3), 'm': max(12, m - 12), 'd': d, 'v': int(v * 0.85)} for t, m, d, v in map(_t, bass)]
        data['tracks'].append({'wave': 'sine', 'gain': sub_gain, 'notes': sub})
    # 高频补强：16 分闭镲（蓝本 6-16k 占 8.8%）
    if hats16:
        beat = bar_new / 4.0
        extra = []
        for b in range(bars):
            base = b * bar_new
            for k in range(16):
                if k % 2 == 1:
                    extra.append((round(base + k * beat / 4.0, 3), 2, 50))
        data['drums'] = sorted(data['drums'] + extra)
    # 主音
    data['tracks'][0]['wave'] = lead_wave
    data['tracks'][0]['gain'] = lead_gain
    # 贝斯加强（蓝本低频极重）
    for tr in data['tracks']:
        if tr['wave'] == 'sawtooth' and tr.get('gain', 0) >= 0.1:
            tr['gain'] = bass_gain
    data['key'] = 'stage2'
    data['title'] = '蠢々秋月 ～ Mooned Insect（大江戸宅急便 风重编）'
    data['reasons'] = [
        '蓝本 大江戸宅急便《蠢々秋月》（专辑《漂泊浪漫》）实测 %.1f BPM / 156s' % bpm,
        '主旋律沿用 ZUN 线（150→%.0f 重定时，%d 音），不删音' % (bpm, len(data['tracks'][0]['notes'])),
        '伴奏按蓝本重写：四踩底鼓+2/4 军鼓+八分闭镲+反拍开镲、锯齿八分贝斯、正拍和弦、高八度影子',
        '%d 小节 / %.1fs 循环' % (bars, data['duration']),
    ]
    return data, bars, bar_new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=155.0)
    ap.add_argument('--lead-wave', default='square')
    ap.add_argument('--lead-gain', type=float, default=0.15)
    ap.add_argument('--drum-scale', type=float, default=0.85)
    ap.add_argument('--bass-gain', type=float, default=0.14)
    ap.add_argument('--stab-gain', type=float, default=0.03)
    ap.add_argument('--sparkle-gain', type=float, default=0.028)
    ap.add_argument('--chorus', default=None)
    ap.add_argument('--chorus-level', type=float, default=None)
    ap.add_argument('--sub-gain', type=float, default=0.0)
    ap.add_argument('--hats16', action='store_true')
    ap.add_argument('--out-js', default=os.path.join(ROOT, 'src', 'engine', 'songs', 'ooedo_stage2.js'))
    ap.add_argument('--export', default='OOEDO_SONGS')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    chorus = None
    if args.chorus:
        a, b = args.chorus.split('-'); chorus = (int(a), int(b))
    data, bars, bar_new = build(args.bpm, args.lead_wave, args.lead_gain, args.drum_scale,
                                args.bass_gain, args.stab_gain, args.sparkle_gain,
                                chorus=chorus, chorus_level=args.chorus_level,
                                sub_gain=args.sub_gain, hats16=args.hats16)
    print('%d 小节 / %.2fs / drums %d / lead %d / tracks %d'
          % (bars, data['duration'], len(data['drums']), len(data['tracks'][0]['notes']), len(data['tracks'])))
    if args.check:
        return
    body = M.render_song_js(data, data['reasons'])
    out = ('/**\n * 2 面 Boss 重编（大江戸宅急便 蓝本）—— 由 tools/ooedoko.py 生成，勿手改。\n'
           ' * 蓝本：蠢々秋月 ～ Mooned Insect / 大江戸宅急便《漂泊浪漫》\n */\n'
           'export const %s = {\n' % args.export + body + ',\n};\n')
    with open(args.out_js, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入', args.out_js, '%.1f KB' % (len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()