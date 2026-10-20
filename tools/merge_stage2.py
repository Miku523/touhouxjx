#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/merge_stage2.py —— 2 面 Boss：融合版 × 游戏内原本的 ZUN 版 混合。

用户 m00982：「与游戏内原曲混合，稍调高主旋律声音」。
为让两版时间轴对齐，融合版回到原曲速度 150 BPM 重新生成，然后：
  主旋律：融合版主音（gain 调高到 0.20）
  低音：原曲贝斯 + 融合版锯齿八分贝斯 + 正弦低八度
  和声：原曲和声织体 + 融合版正拍 stab
  鼓：融合版四踩/16 分细碎整套 + 原曲鼓型（0.6 力度）叠底
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
import fusion_stage2 as F

ORIG_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'merge_stage2.js')


def to_dict(notes):
    out = []
    for n in notes:
        if isinstance(n, dict):
            out.append(dict(n))
        else:
            t, m, d, v = n
            out.append({'t': t, 'm': m, 'd': d, 'v': v})
    return out


def scale_vel(notes, k):
    return [{'t': round(n['t'], 3), 'm': n['m'], 'd': n['d'],
             'v': max(1, min(127, int(round(n['v'] * k))))} for n in to_dict(notes)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=150.0)
    ap.add_argument('--lead-gain', type=float, default=0.20)
    ap.add_argument('--smooth-bass', action='store_true', help='贝斯贴主旋律：原曲音高复刻（默认关）')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    smooth_bass = args.smooth_bass

    orig = PS.load_song(ORIG_FILE, 'BOSS_SONGS', 'stage2')
    print('原曲 %s：%.3fs / %s BPM / %d 轨 / %d 鼓' % (orig['title'], orig['duration'], orig['bpm'], len(orig['tracks']), len(orig['drums'])))
    fus, bars, bar = F.build_at(args.bpm, args.lead_gain)
    print('融合版：%.3fs / %d 小节 / %d 轨 / %d 鼓' % (fus['duration'], bars, len(fus['tracks']), len(fus['drums'])))

    ob = to_dict(orig['tracks'][1]['notes'])   # 原曲贝斯
    oh = to_dict(orig['tracks'][2]['notes'])   # 原曲和声
    od = orig['drums']
    tracks = [{'wave': 'square', 'gain': args.lead_gain, 'notes': to_dict(fus['tracks'][0]['notes'])}]
    tracks.append({'wave': orig['tracks'][1]['wave'], 'gain': 0.20 if smooth_bass else 0.15, 'notes': ob})  # 原曲贝斯
    if smooth_bass:
        # 平滑贝斯：撤掉重写八分型（和主旋律打架），改成「原曲贝斯音高复刻 + 低八度铺底」
        tracks.append({'wave': 'sawtooth', 'gain': 0.10, 'notes': to_dict(ob)})
        sub_src = to_dict(ob)
    else:
        tracks.append({'wave': 'sawtooth', 'gain': 0.24, 'notes': to_dict(fus['tracks'][1]['notes'])})
        sub_src = to_dict(fus['tracks'][1]['notes'])
    tracks.append({'wave': 'sine', 'gain': 0.14 if smooth_bass else 0.16,
                   'notes': [{'t': round(n['t'], 3), 'm': max(12, n['m'] - 12), 'd': n['d'], 'v': int(n['v'] * 0.9)}
                             for n in sub_src]})
    tracks.append({'wave': orig['tracks'][2]['wave'], 'gain': 0.05, 'notes': oh})          # 原曲和声
    tracks.append({'wave': 'square', 'gain': 0.02, 'notes': to_dict(fus['tracks'][2]['notes'])})  # 正拍 stab
    drums = sorted(fus['drums'] + [(round(t, 3), kind, max(1, min(127, int(round(v * 0.6))))) for t, kind, v in od])
    D = orig['duration']
    for tr in tracks:
        tr['notes'] = [n for n in tr['notes'] if n['t'] < D]
    drums = [d for d in drums if d[0] < D]
    data = {'key': 'stage2', 'title': '蠢々秋月 ～ Mooned Insect（融合版·与原曲混合）',
            'duration': D, 'bpm': args.bpm,
            'tracks': tracks, 'drums': drums,
            'reasons': [
                '融合版（大江戸宅急便 × Fantasia Nightbug）回到原曲速度 %.0f BPM，与游戏内原曲时间轴对齐' % args.bpm,
                '原曲 ZUN 版贡献贝斯线与和声织体；融合版贡献四踩鼓、16 分细碎、锯齿贝斯与低八度',
                '主旋律音量提高：square gain %.2f（融合版单独听时 0.16）' % args.lead_gain,
                ('贝斯平滑：撤掉重写八分型，改为原曲贝斯音高复刻（saw 0.10）+ 低八度正弦' if smooth_bass else '贝斯：原曲贝斯 + 重写锯齿八分 + 低八度正弦'),
                '时间轴以原曲 %.3fs 为准，超出部分已剪掉' % D,
            ]}
    print('混合后：%d 轨 / %d 鼓 / %.3fs' % (len(tracks), len(drums), data['duration']))
    if args.check:
        return
    body = M.render_song_js(data, data['reasons'])
    out = ('/**\n * 2 面 Boss：融合版 × 游戏内原曲 —— tools/merge_stage2.py 生成，勿手改。\n */\n'
           'export const MERGE_STAGE2 = {\n' + body + ',\n};\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入', OUT_JS, '%.1f KB' % (len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()