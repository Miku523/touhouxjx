#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/warmify.py —— 把 chiptune 音色的曲子换成「非 8bit」的柔和配器。

引擎只有 4 种波形（square / triangle / sawtooth / sine），做「不像 8bit」只能：
1) 把方波/锯齿换成三角波与正弦波（谐波少、没有那种刺耳的锯齿味）；
2) 主音降一档增益、和声压到 0.05 以下，让整体听感变厚变圆；
3) 需要时再挂「温总线」（audio.js 里的 warm: true，5200Hz 低通 + 短回声）。

用法：
    python tools/warmify.py --check
    python tools/warmify.py
"""
import json
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

OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'warm_variants.js')

# 每个声部的新音色：(wave, gain)。顺序和原曲的 tracks 一致。
VOICES = {
    # 用户要求：副音（第 3 轨和声）要比主音（第 1 轨旋律）更突出
    'pre1': [('triangle', 0.10), ('sine', 0.13), ('sine', 0.21)],
    'pre2': [('triangle', 0.21), ('triangle', 0.12), ('sine', 0.055), ('sine', 0.045)],
}

SOURCES = {
    'pre1': dict(file=os.path.join(ROOT, 'src', 'engine', 'songs', 'preboss.js'),
                 export='PREBOSS_SONGS', key='pre1', warm=False),
    'pre2': dict(file=os.path.join(ROOT, 'src', 'engine', 'songs', 'eurobeat_pre2.js'),
                 export='PRE2_EURO', key='pre2', warm=False),
}


def to_obj(rows):
    """曲库里的音符是 [t,m,d,v] 数组，render_song_js 要 dict。"""
    return [r if isinstance(r, dict) else dict(t=r[0], m=r[1], d=r[2], v=r[3]) for r in rows]


def warmify(song, key, voices, warm=False):
    tracks = []
    for i, tr in enumerate(song['tracks']):
        wave, gain = voices[i] if i < len(voices) else (tr['wave'], tr['gain'])
        tracks.append(dict(wave=wave, gain=gain, notes=to_obj(tr['notes'])))
    out = dict(key=key, title=song['title'] + '（柔和配器）',
               duration=song['duration'], bpm=song['bpm'],
               tracks=tracks, drums=song['drums'])
    if warm:
        out['warm'] = True
    return out


def main():
    check_only = '--check' in sys.argv
    results = {}
    for key, src in SOURCES.items():
        song = PS.load_song(src['file'], src['export'], src['key'])
        out = warmify(song, key, VOICES[key], warm=src['warm'])
        results[key] = out
        print('%s: %d 轨 → %s / %.2fs'
              % (key, len(out['tracks']),
                 ' '.join('%s@%.2f' % (t['wave'], t['gain']) for t in out['tracks']),
                 out['duration']))
    if check_only:
        return
    parts = []
    for key, data in results.items():
        parts.append(M.render_song_js(data, ['%s 柔和配器版（非 8bit）' % key]))
    out = ('/**\n'
           ' * 「非 8bit」柔和配器版 —— 由 tools/warmify.py 生成，勿手改。\n'
           ' * 音符与鼓组完全不动，只把方波/锯齿换成三角波与正弦波，并压低和声增益。\n'
           ' */\n'
           'export const PRE1_WARM = {\n' + parts[0] + ',\n};\n\n'
           'export const PRE2_WARM = {\n' + parts[1] + ',\n};\n\n'
           'export const WARM_VARIANTS = { pre1: PRE1_WARM, pre2: PRE2_WARM };\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
