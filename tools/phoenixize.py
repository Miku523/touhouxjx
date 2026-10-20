#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/phoenixize.py —— 把 1 面 Boss《妖魔夜行》改成 PHOENIX Project 风格。

PHOENIX Project（稲井ゆう／ゆう）招牌是「8bit + Band + Dance」：
芯片主音跑旋律、乐队编制铺和声、鼓组是四踩舞曲。这里用「放大到 160 BPM 的
EUROBEAT 骨架 + 16 分闭镲」近似，主音给两种音色让孩子选：
  A 版：square 芯片主音（PHOENIX 原味）
  B 版：sawtooth 合成器主音（band 向，少一点 8bit 味）

用法：
    python tools/phoenixize.py --check
    python tools/phoenixize.py
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
import preview_song as PS
import eurobeatize as E

SRC_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
SRC_EXPORT = 'BOSS_SONGS'
SRC_KEY = 'stage1'
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'phoenix_stage1.js')

BPM_DEFAULT = 120.0   # 用户口径：速度与原曲几乎一致（原曲 120 BPM）
BARS = None           # None = 按源曲长度算，保证主旋律一个音都不少
LEAD_A = ('square', 0.16)
LEAD_B = ('sawtooth', 0.15)


def hats16(drums, bars, bar_new, beat):
    """PHOENIX 的舞曲底：8 分闭镲之外再补 16 分细分。"""
    extra = []
    for b in range(bars):
        base = b * bar_new
        for k in range(16):
            if k % 2 == 1:
                extra.append((round(base + k * beat / 4.0, 3), 2, 44))
    return sorted(drums + extra)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=BPM_DEFAULT)
    ap.add_argument('--variants', default='ab')
    ap.add_argument('--drum-scale', type=float, default=1.0)
    ap.add_argument('--half', action='store_true')
    ap.add_argument('--chorus', default=None, help='副歌小节区间，如 28-38')
    ap.add_argument('--chorus-level', type=float, default=None, help='副歌补拍力度系数')
    ap.add_argument('--drum-mode', default='grid', choices=['grid', 'melody'])
    ap.add_argument('--stab-mode', default='offbeat', choices=['offbeat', 'onbeat'])
    ap.add_argument('--kick-vel', type=int, default=18)
    ap.add_argument('--snare-vel', type=int, default=15)
    ap.add_argument('--stab-gain', type=float, default=0.045)
    ap.add_argument('--lead-only', action='store_true', help='只留主旋律，撤掉所有伴奏与鼓')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    BPM = args.bpm
    check_only = args.check
    song = PS.load_song(SRC_FILE, SRC_EXPORT, SRC_KEY)
    print('源曲 %s：bpm=%s / %.2fs / %d 轨' % (song['title'], song['bpm'], song['duration'], len(song['tracks'])))
    print('目标速度 %.1f BPM（原曲 %.0f BPM）' % (BPM, song['bpm']))
    bar_new = 4 * 60.0 / BPM
    beat = bar_new / 4.0
    scale = float(song['bpm']) / BPM
    import math
    bars = int(math.ceil(song['duration'] * scale / bar_new - 1e-9))
    print('全曲铺满需要 %d 小节（%.1fs）：源曲 %.1fs × %d/%d = %.1fs'
          % (bars, bars * bar_new, song['duration'], int(song['bpm']), int(BPM), song['duration'] * scale))

    variants = {}
    pick = (('A', LEAD_A), ('B', LEAD_B)) if 'b' in args.variants.lower() else (('A', LEAD_A),)
    for tag, (wave, gain) in pick:
        cr = None
        if args.chorus:
            _a, _b = args.chorus.split('-')
            cr = (int(_a), int(_b))
        data = E.eurobeatize(song, BPM, bars, drum_scale=args.drum_scale, half=args.half,
                             chorus_range=cr, chorus_level=args.chorus_level,
                             drum_mode=args.drum_mode, stab_mode=args.stab_mode,
                             kick_vel=args.kick_vel, snare_vel=args.snare_vel,
                             stab_gain=args.stab_gain)
        data['tracks'][0]['wave'] = wave
        data['tracks'][0]['gain'] = gain
        if not args.half:
            data['drums'] = hats16(data['drums'], bars, bar_new, beat)
        if args.lead_only:
            data['tracks'] = data['tracks'][:1]
            data['drums'] = []
            data['title'] = data['title'] + '·独奏'
        data['key'] = 'stage1' + tag.lower()
        data['title'] = '%s（PHOENIX 风 %s 版）' % (song['title'], '芯片主音' if tag == 'A' else '合成器主音')
        data['reasons'] = [
            'PHOENIX Project 风：8bit+Band+Dance 骨架（%d BPM / %d 小节 / %.1fs）' % (BPM, bars, data['duration']),
            '主音 %s@%.2f —— %s' % (wave, gain, '芯片味（PHOENIX 原味）' if tag == 'A' else '合成器味（非 8bit）'),
            '四踩底鼓 + 2/4 军鼓 + 8 分与 16 分闭镲 + 反拍开镲；锯齿八分贝斯；反拍三音 stab',
        ]
        variants[tag] = data
        print('%s 版：%d 小节 / %.3fs / drums %d / lead %d' % (tag, bars, data['duration'], len(data['drums']), len(data['tracks'][0]['notes'])))
    if check_only:
        return

    parts = []
    tags = [t for t in ('A', 'B') if t in variants]
    for tag in tags:
        parts.append(M.render_song_js(variants[tag], variants[tag]['reasons']))
    out = ('/**\n'
           ' * PHOENIX Project 风重编 —— 由 tools/phoenixize.py 生成，勿手改。\n'
           ' * 源曲：1 面 Boss《妖魔夜行》（ZUN 原曲，touhou.js / stage1，120 BPM）。\n'
           ' * 手法：保留 ZUN 主旋律线，整体提到 160 BPM；鼓/贝斯/和弦全部重写。\n'
           ' */\n'
           'export const PHOENIX_A = {\n' + parts[0] + ',\n};\n\n'
           + ('export const PHOENIX_B = {\n' + parts[1] + ',\n};\n\n' if len(parts) > 1 else '')
           + 'export const PHOENIX_STAGE1 = { stage1a: PHOENIX_A };\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
