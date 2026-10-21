# -*- coding: utf-8 -*-
"""_ref7_env16.py —— 更稳的 16 步「落点分布」：不用起音计数，而是把每个通道的能量包络
在每个 16 分格位置取峰值，再对所有小节平均 → env16（0-1 归一）+ env16_db。
起音计数对失真吉他瞬态很敏感，包络峰值分布更接近真实律动。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
RAW = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))

out = {}
for nm in ('ref4', 'ref5', 'ref6'):
    d = RAW[nm]
    x, sr = L5.load_mono(os.path.join(SRC, nm + '.mp3'))
    _, flux, fps, _ = L5.percussive(x, sr)
    bpm = d['bpm']; beat = 60.0 / bpm; bar = 4 * beat
    off = d['beat_offset']
    dur = d['dur']
    nb = int((dur - off) // bar)
    tt = np.arange(len(flux)) / fps
    F = np.asarray(flux, np.float64)
    chans = {'kick': F[:, 0], 'snare': F[:, 1] + 0.6 * F[:, 2],
             'hat': F[:, 3] + F[:, 4]}
    res = {}
    for k, env in chans.items():
        env = env.astype(np.float64)
        acc = np.zeros(16); cnt = np.zeros(16)
        for b in range(nb):
            t0 = off + b * bar
            for st in range(16):
                c = t0 + st * beat / 4.0
                m = (tt >= c - 0.030) & (tt <= c + 0.045)
                if m.any():
                    acc[st] += float(np.max(env[m])); cnt[st] += 1
        prof = acc / np.maximum(cnt, 1)
        prof = prof / (prof.max() + 1e-9)
        res[k] = dict(env16=[round(float(v), 3) for v in prof],
                      env16_db=[round(float(20 * np.log10(v + 1e-9)), 1) for v in prof])
        top = np.argsort(-prof)[:4]
        res[k]['top_steps'] = [int(i) for i in top]
        res[k]['top_vals'] = [round(float(prof[i]), 3) for i in top]
        res[k]['beats13'] = round(float(np.mean([prof[0], prof[8]])), 3)
        res[k]['beats24'] = round(float(np.mean([prof[4], prof[12]])), 3)
        res[k]['offbeat8'] = round(float(np.mean([prof[2], prof[6], prof[10], prof[14]])), 3)
        res[k]['onbeat'] = round(float(np.mean([prof[0], prof[4], prof[8], prof[12]])), 3)
    out[nm] = res
    print('=' * 90)
    print(nm)
    for k in ('kick', 'snare', 'hat'):
        r = res[k]
        print('  %-5s env16 %s' % (k, ' '.join('%.2f' % v for v in r['env16'])))
        print('        top %s  1&3拍 %.2f  2&4拍 %.2f  8分反拍 %.2f  正拍 %.2f' % (
            r['top_steps'], r['beats13'], r['beats24'], r['offbeat8'], r['onbeat']))
json.dump(out, open(os.path.join(HERE, '_ref7_env16.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('已写 _ref7_env16.json')
