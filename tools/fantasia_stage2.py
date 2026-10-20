#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/fantasia_stage2.py —— 2 面 Boss《蠢々秋月》按 ClearLeMel《Fantasia Nightbug》蓝本重编。

蓝本（酷狗 18A7B518251FAF944B58A8CC3D4B405D）：
  ClearLeMel「Fantasia Nightbug」/ 专辑《祭夏》(C86 2014-08-16) / vocal 迷犬 / 編曲 激戦の人
  原曲 = 蠢々秋月 ～ Mooned Insect；291.5s
实测：本调速度 83 BPM（三段落自相关都锁 83）、RMS 0.220（响度极高、峰值 1.046 已削顶）
  频段：0–120Hz 22–43%（极重低频）、120–500 13–25%、500–2k 20–45%、2–6k 8–22%、6–16k 4–10%
  质心 1253–2036Hz
做法：主旋律沿用 ZUN 线（150→83 重定时），伴奏按「人声编曲」的乐队编制重写：
  半速重拍底鼓（1、3 拍）+ 2、4 拍军鼓 + 八分闭镲与 16 分低音量细碎 + 反拍开镲
  锯齿八分贝斯（重低频）+ 正弦低八度铺底 + 正拍和弦垫 + 高八度影子
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
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'fantasia_stage2.js')


def _t(n):
    return (n['t'], n['m'], n['d'], n['v']) if isinstance(n, dict) else tuple(n)


def band_drums(bars, bar, beat, kick_vel=104, snare_vel=98, hat_vel=44, hat16_vel=30, crash_every=8):
    d = []
    for b in range(bars):
        base = b * bar
        for k in (0, 2):
            d.append((round(base + k * beat, 3), 0, kick_vel))
        for k in (1, 3):
            d.append((round(base + k * beat, 3), 1, snare_vel))
        for k in range(8):
            d.append((round(base + k * beat / 2.0, 3), 2, hat_vel))
        for k in range(16):
            if k % 2 == 1:
                d.append((round(base + k * beat / 4.0, 3), 2, hat16_vel))
        d.append((round(base + 3.5 * beat, 3), 3, 72))
        if b % crash_every == 0:
            d.append((round(base, 3), 4, 84))
    return sorted(d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=83.0)
    ap.add_argument('--lead-wave', default='square')
    ap.add_argument('--lead-gain', type=float, default=0.16)
    ap.add_argument('--bass-gain', type=float, default=0.2)
    ap.add_argument('--sub-gain', type=float, default=0.12)
    ap.add_argument('--stab-gain', type=float, default=0.03)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    song = PS.load_song(SRC_FILE, SRC_EXPORT, SRC_KEY)
    bpm = args.bpm
    bar = 4 * 60.0 / bpm
    beat = bar / 4.0
    scale = float(song['bpm']) / bpm
    bars = int(math.ceil(song['duration'] * scale / bar - 1e-9))
    # 骨架：eurobeatize 负责重定时主旋律 + 贝斯/和弦，鼓随后整体替换成乐队型
    data = E.eurobeatize(song, bpm, bars, drum_scale=1.0, half=False,
                         drum_mode='grid', stab_mode='onbeat', stab_gain=args.stab_gain)
    data['tracks'][0]['wave'] = args.lead_wave
    data['tracks'][0]['gain'] = args.lead_gain
    for tr in data['tracks']:
        if tr['wave'] == 'sawtooth' and tr.get('gain', 0) >= 0.1:
            tr['gain'] = args.bass_gain
    data['drums'] = band_drums(bars, bar, beat)
    if args.sub_gain > 0:
        bass = data['tracks'][1]['notes']
        data['tracks'].append({'wave': 'sine', 'gain': args.sub_gain,
                               'notes': [{'t': round(t, 3), 'm': max(12, m - 12), 'd': d, 'v': int(v * 0.85)}
                                         for t, m, d, v in map(_t, bass)]})
    data['key'] = 'stage2'
    data['title'] = '蠢々秋月 ～ Mooned Insect（Fantasia Nightbug 风重编）'
    data['reasons'] = [
        '蓝本 ClearLeMel「Fantasia Nightbug」/《祭夏》(C86) —— 蠢々秋月的人声编曲，实测 83 BPM / 291s',
        '主旋律沿用 ZUN 线（150→83 重定时，%d 音）' % len(data['tracks'][0]['notes']),
        '乐队型鼓：1、3 拍底鼓 + 2、4 拍军鼓 + 八分闭镲 + 16 分细碎 + 反拍开镲',
        '锯齿八分贝斯 + 正弦低八度铺底（复刻蓝本 22–43%% 的极重低频）',
        '%d 小节 / %.1fs 循环' % (bars, data['duration']),
    ]
    print('%d 小节 / %.2fs / drums %d / lead %d / tracks %d'
          % (bars, data['duration'], len(data['drums']), len(data['tracks'][0]['notes']), len(data['tracks'])))
    if args.check:
        return
    body = M.render_song_js(data, data['reasons'])
    out = ('/**\n * 2 面 Boss 重编（ClearLeMel「Fantasia Nightbug」蓝本）—— tools/fantasia_stage2.py 生成，勿手改。\n */\n'
           'export const FANTASIA_SONGS = {\n' + body + ',\n};\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入', OUT_JS, '%.1f KB' % (len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
