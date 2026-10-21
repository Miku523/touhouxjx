# -*- coding: utf-8 -*-
"""_ref6_analyze.py —— 阶段 A：单曲特征提取（速度 / 频段 / 调性 / 全局色度）
用法:  python _ref6_analyze.py ref1 <path.mp3> [tuning_cents]
输出:  _ref6_feat/<tag>.npz   (逐帧 chroma/peak_hi/frame_db 等)
       _ref6_raw.json         (合并写入速度/频段/调性等全局量)
"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _ref6_lib as L

SR = 22050
FEAT = os.path.join(HERE, '_ref6_feat')
RAW = os.path.join(HERE, '_ref6_raw.json')

KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# Krumhansl-Kessler 调性轮廓
KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def key_ks(hist):
    """Krumhansl-Schmuckler 全 24 调打分。返回 [(score, 'F min'), ...] 降序。"""
    h = np.asarray(hist, float)
    h = (h - h.mean()) / (h.std() + 1e-9)
    out = []
    for r in range(12):
        for mode, prof in (('maj', KK_MAJ), ('min', KK_MIN)):
            p = np.roll(prof, r)
            p = (p - p.mean()) / (p.std() + 1e-9)
            out.append((float((h * p).mean()), '%s %s' % (KEYS[r], mode), r, mode))
    out.sort(reverse=True)
    return out


def scale_fit(hist, root_pc):
    """对若干音阶型做最小二乘拟合（返回 (name, r)），用于大小调/多利亚判断。"""
    patterns = {
        'natural minor': [0, 2, 3, 5, 7, 8, 10],
        'dorian':        [0, 2, 3, 5, 7, 9, 10],
        'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
        'major':         [0, 2, 4, 5, 7, 9, 11],
        'phrygian':      [0, 1, 3, 5, 7, 8, 10],
        'minor pentatonic': [0, 3, 5, 7, 10],
        'yo (都节)':      [0, 1, 5, 7, 8],
        'in (阴)':        [0, 1, 5, 7, 10],
    }
    h = np.asarray(hist, float)
    h = h / h.sum()
    res = []
    for name, pat in patterns.items():
        model = np.zeros(12)
        for i in pat:
            model[(root_pc + i) % 12] = 1.0
        model = model / model.sum()
        # 余弦相似度
        r = float(h @ model / (np.linalg.norm(h) * np.linalg.norm(model) + 1e-12))
        res.append((round(r, 4), name))
    res.sort(reverse=True)
    return res


def main(tag, path, tuning=0.0):
    y, sr = L.load_mono(path, SR)
    dur = len(y) / float(sr)
    print('%s: %.2fs  sr=%d' % (tag, dur, sr))

    print('  frame_features (2048/512) ...')
    feat = L.frame_features(y, sr, n_fft=2048, hop=512, verbose=False)
    print('  chroma_pass   (8192/1024) ...')
    cp = L.chroma_pass(y, sr, n_fft=8192, hop=1024, tuning_cents=tuning)

    tempo = L.estimate_tempo(feat)

    # 全曲频段
    bands = feat['bands'].mean(axis=0)
    w = feat['rms'] + 1e-6
    bands_w = (feat['bands'] * w[:, None]).sum(axis=0) / w.sum()

    # 全曲色度（能量加权，per-frame 归一化后加权）
    ch = cp['chroma'].astype(np.float64)
    chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
    hist = (chn * w[:len(chn), None]).sum(axis=0) / w[:len(chn)].sum()
    # 只取"有内容"的帧（跳过静音）
    thr = np.percentile(cp['frame_db'][:len(chn)], 20)
    m = cp['frame_db'][:len(chn)] > thr
    hist2 = chn[m].mean(axis=0)

    ks = key_ks(hist2)
    print('  KS top: %s' % [(n, round(s, 3)) for s, n, r, mo in ks[:5]])
    print('  top pcs: %s' % [(KEYS[i], round(float(hist2[i]), 3))
                             for i in np.argsort(-hist2)[:8]])
    root = ks[0][2]
    print('  scale fit (root %s): %s' % (KEYS[root], scale_fit(hist2, root)[:4]))

    os.makedirs(FEAT, exist_ok=True)
    np.savez_compressed(
        os.path.join(FEAT, tag + '.npz'),
        times=cp['times'], chroma=cp['chroma'], chroma_hi=cp['chroma_hi'],
        chroma_mid=cp['chroma_mid'], chroma_bass=cp['chroma_bass'],
        frame_db=cp['frame_db'], peak_hi=cp['peak_hi'],
        rms=feat['rms'], rms_db=feat['rms_db'], centroid=feat['centroid'],
        bands=feat['bands'], flux=feat['flux'], flux_low=feat['flux_low'],
        flux_mid=feat['flux_mid'], flux_hi=feat['flux_hi'],
        f_times=feat['times'], fps=feat['fps'], duration=dur,
        tuning=tuning)

    rec = {
        'tag': tag, 'path': path, 'duration': round(dur, 2),
        'tuning_cents': tuning,
        'tempo': tempo,
        'bands_mean': [round(float(x), 4) for x in bands],
        'bands_rms_weighted': [round(float(x), 4) for x in bands_w],
        'centroid_mean': round(float(feat['centroid'].mean()), 1),
        'centroid_p10': round(float(np.percentile(feat['centroid'], 10)), 1),
        'centroid_p90': round(float(np.percentile(feat['centroid'], 90)), 1),
        'chroma_hist': [round(float(x), 4) for x in hist2],
        'key_ks': [{'score': round(s, 4), 'name': n} for s, n, r, mo in ks[:6]],
        'scale_fit': [{'r': r, 'name': n} for r, n in scale_fit(hist2, root)[:5]],
        'peak_hi_med': round(float(np.median(cp['peak_hi'])), 1),
        'flux_med': round(float(np.median(feat['flux'])), 4),
    }
    data = {}
    if os.path.exists(RAW):
        with open(RAW, 'r', encoding='utf-8') as f:
            data = json.load(f)
    data[tag] = rec
    with open(RAW, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('  -> %s' % RAW)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.0)
