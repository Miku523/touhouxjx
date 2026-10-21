# -*- coding: utf-8 -*-
"""_ref7_dump.py —— 批量分析 3 首 ref7 参考曲，落盘 tools/build/_ref7_raw.json 并打印诊断。
用法：python tools/build/_ref7_dump.py            # 全部
      python tools/build/_ref7_dump.py ref4       # 指定
"""
import sys
import os
import json
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref7_lib as R7

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
OUT = os.path.join(HERE, '_ref7_raw.json')
ALL = ['ref4', 'ref5', 'ref6']

TITLE = {'ref4': '激戦の人 156s', 'ref5': '激戦の人 282s', 'ref6': '激戦の人 186s'}


def clean(o):
    import numpy as _np
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, _np.generic):
        return o.item()
    return o


names = sys.argv[1:] or ALL
data = {}
if os.path.exists(OUT):
    data = json.load(open(OUT, encoding='utf-8'))
for nm in names:
    t = time.time()
    d = clean(R7.analyze(os.path.join(SRC, nm + '.mp3'), tag=nm))
    data[nm] = d
    print('   -> %s %.2fs 用 %.1fs' % (nm, d['dur'], time.time() - t))
    print('   BPM %.3f conf %.3f (prom %.2f/%.2f fit %.2f)' % (
        d['bpm'], d['bpm_conf'], d['bpm_confidence_detail']['prominence'],
        d['bpm_confidence_detail']['prom_strict'], d['bpm_confidence_detail']['grid_fit']))
    print('   BPM 候选:', d['bpm_candidates'][:8])
    print('   拍偏移 %.3f  bar %.3f  四踩 %.2f' % (d['beat_offset'], d['bar_sec'], d['four_on_floor']))
    print('   拍能量 k%s s%s' % (d['beat_energy']['kick'], d['beat_energy']['snare']))
    print('   拍号分数:', d['meter_scores'])
    print('   局部速度:', d['local_tempos'])
    print('   栅格漂移 %.1fms/100s' % d['grid_drift_ms_per_100s'])
    print('   调性:', [(c['score'], c['tonic'], c['mode'], c['ks']) for c in d['key']['candidates']])
    print('   低音直方:', [(R7.NAMES[i], d['key']['bass_hist'][i])
                           for i in sorted(range(12), key=lambda i: -d['key']['bass_hist'][i])[:4]])
    print('   旋律:', d['melody'])
    print('   半音走句 %d 例:' % len(d['melody_chroma_runs']), d['melody_chroma_runs'][:6])
    print('   不协和:', d['dissonance'])
    print('   静音段 %d:' % len(d['silences']), d['silences'][:6])
    print('   段落候选:', d['novelty_peaks'][:12])
    dr = d['drums16']
    for k in ('kick', 'snare', 'hat'):
        v = dr[k]
        print('   %-5s /bar %.2f  hist16 %s' % (k, v['per_bar'], v['hist16']))
        print('         amp16  %s' % v['amp16'])
    print('   底鼓: 四踩小节占比 %.2f 反拍占比 %.2f 网格占比 %.2f 双踩占比 %.2f  /bar中位 %s 最大 %s' % (
        dr.get('four_on_floor_bars_frac', -1), dr.get('offbeat_kick_frac', -1),
        dr.get('grid_kick_frac', -1), dr.get('double_kick_frac', -1),
        dr.get('kick_per_bar_median'), dr.get('kick_per_bar_max')))
    print('   军鼓 2/4 拍占比 %.2f' % dr.get('backbeat_snare_frac', -1))
    print('   段落能量(每8小节dB):', [round(20 * __import__('numpy').log10(__import__('numpy').mean(
        [b['rms'] for b in d['bars'][g:g + 8]]) + 1e-9), 1) for g in range(0, len(d['bars']), 8)])
json.dump(clean(data), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('已写', OUT, '曲目:', list(data))
