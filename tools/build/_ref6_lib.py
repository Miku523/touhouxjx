# -*- coding: utf-8 -*-
"""
_ref6_lib.py —— 《竹取飛翔 ～ Lunatic Princess》参考录音分析公共库

只依赖 numpy + soundfile。所有分析在 mono 22050Hz 上做（内存友好）。
设计原则：不做复音单音高跟踪，只用色度/频段/能量/onset 这类稳健特征。

主要 API
--------
load_mono(path, sr=22050)                 -> (y float32, sr)
frame_features(y, sr)                     -> dict  逐帧特征（rms/质心/频段/flux/chroma）
estimate_tempo(env, fps)                  -> dict
refine_bpm(env, fps, bpm0)                -> (bpm, offset_sec, score)
key_profile(chroma, times)                -> dict  调性 + 音级直方图
chord_of(chroma_vec)                      -> (name, score)
segment_sections(bar_feats, bars_per_sec) -> list
grid_profile(env, times, bpm, offset, n)  -> np.ndarray 激活率
semi_beat_contour(...)                    -> 主旋律轮廓
"""
import os
import sys
import json
import math

import numpy as np
import soundfile as sf

# ---------------------------------------------------------------- 常量

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_NAMES_JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

BAND_EDGES = [0.0, 120.0, 500.0, 2000.0, 8000.0, 24000.0]
BAND_NAMES = ['sub120', 'b120_500', 'b500_2k', 'b2k_8k', 'b8k+']

# Krumhansl-Schmuckler 调性模板（音级权重，索引 0=C）
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                     2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                     2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
# 多利亚（自然小调升 6 级）
KS_DORIAN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                      2.54, 4.75, 5.30, 2.69, 3.34, 3.17])


def _norm(x):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) if len(x) else 0.0
    return x / m if m > 1e-12 else x


# ---------------------------------------------------------------- 解码 / 重采样

def load_mono(path, sr=22050):
    """读 mp3 → mono float32，重采样到 sr（线性插值）。文件名用 basename 便于日志。"""
    y, fs = sf.read(path, always_2d=True, dtype='float32')
    if y.shape[1] > 1:
        y = y.mean(axis=1)
    else:
        y = y[:, 0]
    y = np.ascontiguousarray(y, dtype=np.float32)
    if fs != sr:
        n_out = int(round(len(y) * sr / float(fs)))
        # 线性插值重采样
        xi = np.arange(n_out, dtype=np.float64) * (fs / float(sr))
        xi = np.clip(xi, 0, len(y) - 1)
        i0 = np.floor(xi).astype(np.int64)
        i1 = np.minimum(i0 + 1, len(y) - 1)
        frac = (xi - i0).astype(np.float32)
        y = (y[i0] * (1.0 - frac) + y[i1] * frac).astype(np.float32)
        fs = sr
    return y, fs


# ---------------------------------------------------------------- 分帧 / STFT

def sliding_frames(y, n_fft, hop):
    """返回 (n_frames, n_fft) 的只读视图（不复制）。"""
    if len(y) < n_fft:
        pad = np.zeros(n_fft - len(y), dtype=y.dtype)
        y = np.concatenate([y, pad])
    v = np.lib.stride_tricks.sliding_window_view(y, n_fft)
    return v[::hop]


def frame_features(y, sr=22050, n_fft=2048, hop=512, verbose=True):
    """
    逐帧特征。返回 dict，全部长度 T 对齐（第 i 帧中心时间 = (i*hop + n_fft/2)/sr）。

    字段：
      times        (T,)   帧中心秒
      rms          (T,)
      rms_db       (T,)
      centroid     (T,)   Hz
      rolloff85    (T,)   Hz
      bands        (T,5)  频段能量占比（0..1）
      band_db      (T,5)  频段电平 dB
      flux         (T,)   全带 spectral flux（0..8kHz）
      flux_low     (T,)   20-120Hz flux（底鼓）
      flux_mid     (T,)   200-2000Hz flux（军鼓/中频）
      flux_hi      (T,)   4k-9kHz flux（踩镲/吊镲）
      chroma       (T,12) 65-2000Hz 色度
      chroma_hi    (T,12) 500-4000Hz 色度（"主旋律"频段）
      chroma_bass  (T,12) 40-250Hz 色度
      sop_peak     (T,)   500-4000Hz 内最强谱峰频率 Hz
      tuning_cents (T?)   —— 全局调音偏差在最后汇总时给
    """
    n_frames = 1 + (len(y) - n_fft) // hop
    if n_frames < 2:
        raise ValueError('too short')
    frames = sliding_frames(y, n_fft, hop)[:n_frames]

    window = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    nb = len(freqs)

    # 频段 bin 掩码
    band_masks = []
    for i in range(len(BAND_EDGES) - 1):
        lo, hi = BAND_EDGES[i], BAND_EDGES[i + 1]
        band_masks.append((freqs >= lo) & (freqs < hi))

    # 色度映射（先按 A440/无调音偏差建，之后可选修正）
    def _pc_map(f_lo, f_hi, tuning=0.0):
        idx = np.where((freqs >= f_lo) & (freqs <= f_hi))[0]
        f = freqs[idx]
        midi = 69.0 + 12.0 * np.log2(f / 440.0) - tuning / 100.0
        pc = np.mod(np.round(midi).astype(np.int64), 12)
        groups = [idx[pc == p] for p in range(12)]
        return groups

    g_lo = _pc_map(65.0, 2000.0)
    g_hi = _pc_map(500.0, 4000.0)
    g_bs = _pc_map(40.0, 250.0)

    m_hi = (freqs >= 500.0) & (freqs <= 4000.0)
    m_mid = (freqs >= 200.0) & (freqs <= 2000.0)
    m_low = (freqs >= 20.0) & (freqs <= 120.0)
    m_hi_noise = (freqs >= 4000.0) & (freqs <= 9000.0)
    f_hi_band = freqs[m_hi]
    m_flux = freqs <= 8000.0

    T = n_frames
    out = {
        'times': np.empty(T, np.float32),
        'rms': np.empty(T, np.float32),
        'rms_db': np.empty(T, np.float32),
        'centroid': np.empty(T, np.float32),
        'rolloff85': np.empty(T, np.float32),
        'bands': np.empty((T, 5), np.float32),
        'band_db': np.empty((T, 5), np.float32),
        'flux': np.empty(T, np.float32),
        'flux_low': np.empty(T, np.float32),
        'flux_mid': np.empty(T, np.float32),
        'flux_hi': np.empty(T, np.float32),
        'chroma': np.empty((T, 12), np.float32),
        'chroma_hi': np.empty((T, 12), np.float32),
        'chroma_bass': np.empty((T, 12), np.float32),
        'sop_peak': np.empty(T, np.float32),
    }

    block = 1024
    prev_last = None
    for b0 in range(0, T, block):
        b1 = min(T, b0 + block)
        fr = np.asarray(frames[b0:b1], dtype=np.float32) * window
        mag = np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)  # (n, nb)

        raw = np.asarray(frames[b0:b1], dtype=np.float32)
        rms = np.sqrt((raw * raw).mean(axis=1))
        out['rms'][b0:b1] = rms
        out['rms_db'][b0:b1] = 20.0 * np.log10(np.maximum(rms, 1e-7))

        ms = mag.sum(axis=1) + 1e-9
        out['centroid'][b0:b1] = (mag @ freqs) / ms
        # 85% rolloff
        csum = np.cumsum(mag, axis=1)
        thr = 0.85 * csum[:, -1:]
        ro = np.argmax(csum >= thr, axis=1)
        out['rolloff85'][b0:b1] = freqs[ro]

        e = (mag * mag)
        tot = e.sum(axis=1) + 1e-12
        for i, m in enumerate(band_masks):
            ei = e[:, m].sum(axis=1)
            out['bands'][b0:b1, i] = ei / tot
            out['band_db'][b0:b1, i] = 10.0 * np.log10(np.maximum(ei, 1e-12))

        # ---- flux（对数压缩后差分，抗动态范围）
        lm = np.log1p(mag * 20.0)
        d = np.empty_like(lm)
        if prev_last is None:
            d[0] = 0.0
        else:
            d[0] = np.maximum(lm[0] - prev_last, 0.0)
        d[1:] = np.maximum(lm[1:] - lm[:-1], 0.0)
        prev_last = lm[-1].copy()

        out['flux'][b0:b1] = d[:, m_flux].sum(axis=1)
        out['flux_low'][b0:b1] = d[:, m_low].sum(axis=1)
        out['flux_mid'][b0:b1] = d[:, m_mid].sum(axis=1)
        out['flux_hi'][b0:b1] = d[:, m_hi_noise].sum(axis=1)

        # ---- 色度（sqrt 压缩，压低低频谐波主导）
        cm = np.sqrt(mag)
        for p in range(12):
            out['chroma'][b0:b1, p] = cm[:, g_lo[p]].sum(axis=1)
            out['chroma_hi'][b0:b1, p] = cm[:, g_hi[p]].sum(axis=1)
            out['chroma_bass'][b0:b1, p] = cm[:, g_bs[p]].sum(axis=1)

        sub = mag[:, m_hi]
        if sub.shape[1] > 0:
            pk = np.argmax(sub, axis=1)
            out['sop_peak'][b0:b1] = f_hi_band[pk]
        else:
            out['sop_peak'][b0:b1] = 0.0

    out['times'] = ((np.arange(T) * hop) + n_fft / 2.0) / float(sr)
    out['sr'] = sr
    out['hop'] = hop
    out['n_fft'] = n_fft
    out['fps'] = sr / float(hop)
    out['duration'] = len(y) / float(sr)
    return out


# ---------------------------------------------------------------- 高分辨率色度

def chroma_pass(y, sr=22050, n_fft=8192, hop=1024, tuning_cents=0.0):
    """
    专门给调性/和弦/旋律轮廓用的高分辨率色度通道（2.7Hz 频率分辨率，
    低频也分得开半音）。返回 dict:
      times, chroma(80-2000), chroma_hi(500-4000 主旋律频段),
      chroma_bass(40-250), chroma_mid(200-1200 和声频段),
      frame_db（帧能量）,
      peak_hi（500-4000 内最强谱峰 Hz）
    """
    n_frames = 1 + (len(y) - n_fft) // hop
    frames = sliding_frames(y, n_fft, hop)[:n_frames]
    window = np.hanning(n_fft).astype(np.float32)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    def _groups(f_lo, f_hi):
        idx = np.where((freqs >= f_lo) & (freqs <= f_hi))[0]
        f = freqs[idx]
        midi = 69.0 + 12.0 * np.log2(f / 440.0) - tuning_cents / 100.0
        pc = np.mod(np.round(midi).astype(np.int64), 12)
        # 只保留离半音中心 25 cent 内的 bin，减少相邻半音串扰
        dev = np.abs(midi - np.round(midi))
        keep = dev < 0.25
        idx, pc = idx[keep], pc[keep]
        return [idx[pc == p] for p in range(12)]

    G = {
        'chroma': _groups(80.0, 2000.0),
        'chroma_hi': _groups(500.0, 4000.0),
        'chroma_bass': _groups(40.0, 260.0),
        'chroma_mid': _groups(200.0, 1200.0),
    }
    m_hi = (freqs >= 500.0) & (freqs <= 4000.0)
    f_hi = freqs[m_hi]

    keys = list(G)
    out = {'times': ((np.arange(n_frames) * hop) + n_fft / 2.0) / float(sr)}
    for k in keys:
        out[k] = np.empty((n_frames, 12), np.float32)
    out['frame_db'] = np.empty(n_frames, np.float32)
    out['peak_hi'] = np.empty(n_frames, np.float32)

    block = 512
    for b0 in range(0, n_frames, block):
        b1 = min(n_frames, b0 + block)
        fr = np.asarray(frames[b0:b1], dtype=np.float32) * window
        mag = np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)
        out['frame_db'][b0:b1] = 20.0 * np.log10(np.sqrt((mag * mag).mean(axis=1)) + 1e-9)
        cm = np.sqrt(mag)
        for k in keys:
            for p in range(12):
                g = G[k][p]
                out[k][b0:b1, p] = cm[:, g].sum(axis=1) if len(g) else 0.0
        sub = cm[:, m_hi]
        out['peak_hi'][b0:b1] = f_hi[np.argmax(sub, axis=1)]
    out['sr'] = sr
    out['tuning_cents'] = tuning_cents
    return out


# ---------------------------------------------------------------- 调音估计

def estimate_tuning(chroma_raw_mag, freqs, sr=22050):
    """
    给定一个平均幅度谱，用 ±50 cent 搜索最佳调音偏差。
    chroma_raw_mag: 平均 |X|，freqs: 对应频率。
    返回 cents（-50..50，>0 表示整体偏高）。
    """
    sel = (freqs >= 80.0) & (freqs <= 2000.0)
    f = freqs[sel]
    a = chroma_raw_mag[sel]
    if a.sum() <= 0:
        return 0.0
    best, bc = -1.0, 0.0
    for c in range(-50, 51, 2):
        midi = 69.0 + 12.0 * np.log2(f / 440.0) - c / 100.0
        dev = np.abs(midi - np.round(midi))  # 0..0.5
        w = np.exp(-(dev ** 2) / (2 * 0.10 ** 2))
        s = float((a * w).sum())
        if s > best:
            best, bc = s, float(c)
    return bc


# ---------------------------------------------------------------- 速度

def onset_env(feat, use='flux'):
    """归一化 onset envelope（减去滑窗均值，半波整流）。"""
    e = np.asarray(feat[use], dtype=np.float64)
    if len(e) < 16:
        return e
    # 局部均值（~0.4s 窗）作为自适应基线
    w = max(5, int(0.4 * feat['fps']))
    k = np.ones(w) / w
    base = np.convolve(e, k, mode='same')
    e = np.maximum(e - base, 0.0)
    m = e.max()
    return e / m if m > 1e-12 else e


def _acf(e):
    n = len(e)
    N = 1 << int(np.ceil(np.log2(2 * n)))
    E = np.fft.rfft(e - e.mean(), N)
    ac = np.fft.irfft(E * np.conj(E), N)[:n]
    ac = ac / (np.arange(n, 0, -1))  # 去偏
    if ac[0] > 0:
        ac = ac / ac[0]
    return ac


def estimate_tempo(feat, bpm_min=55.0, bpm_max=220.0):
    """
    返回 dict:
      bpm_candidates: [{bpm, acf_score, comb_score}]
      bpm, confidence
    方法：ACF 峰 + 谐波梳状打分（带 0.5× 八度惩罚）+ IOI 直方图交叉验证。
    """
    e = onset_env(feat)
    fps = feat['fps']
    ac = _acf(e)
    lag_min = int(max(2, math.floor(60.0 * fps / bpm_max)))
    lag_max = int(min(len(ac) - 2, math.ceil(60.0 * fps / bpm_min)))

    # 找局部峰
    peaks = []
    for L in range(lag_min + 1, lag_max):
        if ac[L] >= ac[L - 1] and ac[L] > ac[L + 1] and ac[L] > 0.02:
            peaks.append((L, float(ac[L])))
    peaks.sort(key=lambda x: -x[1])

    def comb(L):
        s = 0.0
        for k, w in ((1, 1.0), (2, 0.55), (3, 0.32), (4, 0.18)):
            Li = int(round(L * k))
            if 0 < Li < len(ac):
                s += w * ac[Li]
        # 半速惩罚：如果 2L 也很强，说明可能是双倍速
        if 2 * L < len(ac):
            s -= 0.45 * max(0.0, ac[2 * L])
        # 两倍速的检查：L/2 处的峰其实是同一节奏的细分
        return s

    cands = []
    for L, v in peaks[:12]:
        bpm = 60.0 * fps / L
        if bpm_min <= bpm <= bpm_max:
            cands.append({'bpm': bpm, 'lag': L, 'acf': v, 'comb': comb(L)})
    if not cands:
        return {'bpm': 0.0, 'confidence': 0.0, 'bpm_candidates': []}

    # 先按梳状分排，再在 80-200 常用区间做轻微先验加权
    for c in cands:
        prior = 1.0
        if c['bpm'] < 70:
            prior = 0.75
        elif 95 <= c['bpm'] <= 185:
            prior = 1.12
        c['score'] = c['comb'] * prior
    cands.sort(key=lambda x: -x['score'])

    bpm = cands[0]['bpm']
    # 八度歧义：若第二候选恰为 2x 且分很接近，用 IOI 决定
    top = cands[0]
    runner = cands[1] if len(cands) > 1 else None
    if runner and abs(runner['score'] - top['score']) < 0.06 * abs(top['score']) + 1e-6:
        r = runner['bpm'] / top['bpm']
        if 1.85 < r < 2.15:
            ioi = _ioi_histogram(e, fps)
            bpm = _resolve_octave(top['bpm'], runner['bpm'], ioi)

    # 置信度 = 最佳梳状分 / 前 6 候选总分
    s6 = sum(max(0.0, c['comb']) for c in cands[:6]) or 1e-9
    conf = float(np.clip(max(0.0, top['comb']) / s6, 0.0, 1.0))
    return {
        'bpm': round(bpm, 2),
        'confidence': round(conf, 3),
        'bpm_candidates': [{'bpm': round(c['bpm'], 2), 'acf': round(c['acf'], 4),
                            'comb': round(c['comb'], 4), 'score': round(c['score'], 4)}
                           for c in cands[:6]],
    }


def _ioi_histogram(e, fps, thr_ratio=0.25):
    """onset 峰间隔直方图（用于八度歧义）。"""
    thr = e.max() * thr_ratio
    idx = []
    i = 1
    while i < len(e) - 1:
        if e[i] >= thr and e[i] >= e[i - 1] and e[i] > e[i + 1]:
            idx.append(i)
            i += 2
        else:
            i += 1
    if len(idx) < 4:
        return np.zeros(0)
    d = np.diff(idx).astype(np.float64) / fps
    d = d[(d > 0.12) & (d < 2.0)]
    h, _ = np.histogram(d, bins=96, range=(0.12, 2.0))
    return h


def _resolve_octave(b1, b2, ioi):
    if len(ioi) == 0:
        return b1
    # ioi bin → 秒
    centers = np.linspace(0.12, 2.0, 96) + (2.0 - 0.12) / 192.0
    ioi = ioi.astype(np.float64)
    s1 = 0.0
    s2 = 0.0
    for period, name in ((60.0 / b1, 'a'), (60.0 / b2, 'b')):
        # 在 period 的整数倍上累加 ioi
        for k in (1, 2, 3, 4):
            t = period * k
            if t <= 2.0:
                j = int(np.argmin(np.abs(centers - t)))
                if name == 'a':
                    s1 += ioi[j]
                else:
                    s2 += ioi[j]
    return b1 if s1 >= s2 else b2


def refine_bpm(feat, bpm0, search=0.06, step=0.02):
    """
    在 bpm0 附近细搜：用 ≈ 每 1/4 拍一个脉冲的梳状权重采样 onset env，
    同时扫相位。返回 (bpm, offset_sec, score)。
    """
    e = onset_env(feat)
    fps = feat['fps']
    n = len(e)
    best = (-1.0, bpm0, 0.0)
    for b in np.arange(bpm0 * (1 - search), bpm0 * (1 + search) + 1e-9, step):
        period = 60.0 / b
        P = period * fps
        # 16 分网格：每 period/4 取样
        n_sub = 4
        step_f = P / n_sub
        max_phase = int(math.ceil(step_f)) + 1
        for ph in np.arange(0, step_f, max(0.5, step_f / 8.0)):
            pos = ph + np.arange(0, n - ph, step_f)
            v = np.interp(pos, np.arange(n), e)
            sc = v.mean()
            if sc > best[0]:
                best = (sc, b, ph / fps)
    return round(best[1], 3), round(best[2], 4), round(best[0], 4)


def refine_phase(feat, bpm, offset0=0.0, step_ms=5.0, span=0.5):
    """在已知 bpm 下细扫 beat phase，返回最优 offset（秒，首拍落在 offset 处）。"""
    e = onset_env(feat)
    fps = feat['fps']
    n = len(e)
    period = 60.0 / bpm
    ts = np.arange(n) / fps
    best = (-1.0, offset0)
    for k in range(int(-span * 1000 / step_ms), int(span * 1000 / step_ms) + 1):
        ph = offset0 + k * step_ms / 1000.0
        pos = ph + period * np.arange(int((ts[-1] - ph) / period) + 1)
        pos = pos[(pos >= ts[0]) & (pos <= ts[-1])]
        if len(pos) < 8:
            continue
        v = np.interp(pos, ts, e)
        sc = float(v.mean())
        if sc > best[0]:
            best = (sc, ph)
    return float(best[1]) % period, float(best[0])


# ---------------------------------------------------------------- 调性

def key_profile(feat, t0=0.0, t1=None):
    """时间窗内色度加权直方图 + Krumhansl 调性匹配。"""
    times = feat['times']
    m = (times >= t0) & (times <= (t1 if t1 is not None else 1e9))
    ch = feat['chroma'][m].astype(np.float64)
    if len(ch) == 0:
        return None
    w = feat['rms'][m].astype(np.float64)
    w = np.maximum(w, 1e-6)
    # 每帧 L1 归一后按 rms 加权累计（避免响段独霸）
    chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
    prof = (chn * w[:, None]).sum(axis=0) / w.sum()
    prof = prof / (prof.sum() + 1e-12)

    best = None
    for mode, tmpl in (('major', KS_MAJOR), ('minor', KS_MINOR), ('dorian', KS_DORIAN)):
        t = tmpl / tmpl.sum()
        for root in range(12):
            tt = np.roll(t, root)
            # 皮尔逊相关
            a = prof - prof.mean()
            b = tt - tt.mean()
            r = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))
            if best is None or r > best[0]:
                best = (r, root, mode)
    r, root, mode = best
    order = np.argsort(-prof)[:6]
    return {
        'root_pc': int(root),
        'root_name': NOTE_NAMES[root],
        'mode': mode,
        'key': '%s %s' % (NOTE_NAMES[root], mode),
        'ks_corr': round(r, 4),
        'pitch_hist': [round(float(v), 4) for v in prof],
        'top6': [{'pc': int(p), 'name': NOTE_NAMES[int(p)], 'w': round(float(prof[p]), 4)}
                 for p in order],
        # 常用别名
        'key_flat': '%s %s' % (NOTE_NAMES_JP[root], {'major': 'major', 'minor': 'minor',
                                                    'dorian': 'dorian'}[mode]),
    }


# ---------------------------------------------------------------- 和弦

CHORD_QUALITIES = {
    'maj':  [0, 4, 7],
    'min':  [0, 3, 7],
    'dim':  [0, 3, 6],
    'aug':  [0, 4, 8],
    'sus4': [0, 5, 7],
    'maj7': [0, 4, 7, 11],
    'min7': [0, 3, 7, 10],
    '7':    [0, 4, 7, 10],
    'm7b5': [0, 3, 6, 10],
    'dim7': [0, 3, 6, 9],
    '6':    [0, 4, 7, 9],
    'm6':   [0, 3, 7, 9],
}
QUAL_ORDER = ['maj', 'min', '7', 'maj7', 'min7', 'dim', 'dim7', 'm7b5', 'sus4', 'aug', '6', 'm6']

# 罗马数字（以 -1 为未知）；这里用音级差描述
ROMAN_MAJOR = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
ROMAN_MINOR = ['I', 'bII', 'II', 'III', '#IV', 'IV', '#V', 'V', 'VI', 'bVII', 'VII', 'bVIII']


def chord_vec(name_root, qual):
    v = np.zeros(12)
    for i in CHORD_QUALITIES[qual]:
        v[(name_root + i) % 12] = 1.0
    # 三音给基础权重，七音略降
    if len(CHORD_QUALITIES[qual]) > 3:
        for i in CHORD_QUALITIES[qual][3:]:
            v[(name_root + i) % 12] = 0.8
    return v / np.linalg.norm(v)


_CACHE = {}
for _q in CHORD_QUALITIES:
    for _r in range(12):
        _CACHE[(_r, _q)] = chord_vec(_r, _q)


def chord_of(chroma_vec):
    """返回 (root, qual, chord_name, score, second) —— 归一化互相关。"""
    v = np.asarray(chroma_vec, dtype=np.float64)
    if v.sum() <= 1e-12:
        return (0, 'maj', 'N.C.', 0.0, None)
    v = v / np.linalg.norm(v)
    best = (-2.0, None)
    second = (-2.0, None)
    for q in QUAL_ORDER:
        for r in range(12):
            s = float(v @ _CACHE[(r, q)])
            if s > best[0]:
                second = best
                best = (s, (r, q))
            elif s > second[0]:
                second = (s, (r, q))
    r, q = best[1]
    return (r, q, '%s%s' % (NOTE_NAMES[r], {'maj': '', 'min': 'm', 'dim': 'dim', 'aug': 'aug',
                                            'sus4': 'sus4', 'maj7': 'maj7', 'min7': 'm7',
                                            '7': '7', 'm7b5': 'm7b5', 'dim7': 'dim7',
                                            '6': '6', 'm6': 'm6'}[q]),
            round(best[0], 4), None if second[1] is None else
            {'name': '%s%s' % (NOTE_NAMES[second[1][0]], second[1][1]),
             'score': round(second[0], 4)})


def roman_of(root_pc, key_root_pc, mode):
    d = (root_pc - key_root_pc) % 12
    table = ROMAN_MINOR if mode in ('minor', 'dorian') else ROMAN_MAJOR
    return table[d]


def chord_progression(feat, key, bpm, t0, t1, beats_per_chord=8, use='chroma'):
    """
    以 beats_per_chord 拍为窗口做和弦识别。返回 [{t0,t1,bar,chord,root,qual,roman,score}]
    """
    times = feat['times']
    ch = feat[use].astype(np.float64)
    seg = 60.0 / bpm
    dur = beats_per_chord * seg
    out = []
    t = t0
    while t < t1 - 1e-6:
        m = (times >= t) & (times < t + dur)
        if m.sum() >= 3:
            v = ch[m].mean(axis=0)
            r, q, name, sc, sec = chord_of(v)
            out.append({
                't0': round(t, 2), 't1': round(min(t + dur, t1), 2),
                'beat': round((t - t0) / seg, 2),
                'chord': name, 'root': int(r), 'qual': q,
                'roman': roman_of(r, key['root_pc'], key['mode']),
                'score': round(sc, 3),
                'sec': sec,
                'chroma_peak': [NOTE_NAMES[i] for i in np.argsort(-v)[:4]],
            })
        t += dur
    return out


# ---------------------------------------------------------------- 网格 / 鼓型

def grid_profile(env, times, bpm, offset, n_bins=16, tol=0.055, normalize=True):
    """
    把 onset env 投影到 n_bins 子网格（默认 16 分），返回 (profile[n_bins], counts[n_bins])。
    offset 是首拍时间（秒）。
    """
    period = 60.0 / bpm
    step = period / (n_bins / 4.0)
    dt = times[1] - times[0]
    prof = np.zeros(n_bins)
    cnt = np.zeros(n_bins)
    t = offset
    n = 0
    max_t = times[-1]
    while t < max_t:
        slot = n % n_bins
        m = (times >= t - tol) & (times <= t + tol)
        if m.sum() >= 1:
            prof[slot] += float(env[m].max())
            cnt[slot] += 1
        t += step
        n += 1
    if normalize and prof.max() > 1e-9:
        prof = prof / prof.max()
    return prof, cnt


def grid_at(env, times, bpm, offset, n_bins=16):
    """返回每小节 n_bins 格的原始激活率（0..1），不做峰值归一化，用全局分位归一。"""
    period = 60.0 / bpm
    step = period / (n_bins / 4.0)
    prof = np.zeros(n_bins)
    cnt = np.zeros(n_bins)
    t = offset
    n = 0
    while t < times[-1]:
        slot = n % n_bins
        m = (times >= t - 0.055) & (times <= t + 0.055)
        if m.sum() >= 1:
            prof[slot] += float(env[m].max())
            cnt[slot] += 1
        t += step
        n += 1
    # 用 80 分位做尺度，避免个别爆炸点
    scale = np.percentile(env, 90) + 1e-9
    return prof / np.maximum(cnt, 1) / scale, cnt.astype(int)


# ---------------------------------------------------------------- 分段

def bar_features(feat, bpm, offset=0.0, beat_per_bar=4):
    """把逐帧特征聚合成"小节"级特征矩阵。返回 dict(bars=[...])"""
    times = feat['times']
    period = 60.0 / bpm
    bar = period * beat_per_bar
    dur = times[-1]
    rows = []
    i = 0
    t = offset
    while t + bar <= dur + 1e-6:
        m = (times >= t) & (times < t + bar)
        if m.sum() >= 2:
            w = feat['rms'][m].astype(np.float64) + 1e-6
            ch = feat['chroma'][m].astype(np.float64)
            chn = ch / (ch.sum(axis=1, keepdims=True) + 1e-9)
            chroma = (chn * w[:, None]).sum(axis=0) / w.sum()
            rows.append({
                'i': i,
                't0': round(t, 3),
                't1': round(t + bar, 3),
                'rms_db': round(float(20 * np.log10(feat['rms'][m].mean() + 1e-9)), 2),
                'centroid': round(float(feat['centroid'][m].mean()), 1),
                'rolloff85': round(float(feat['rolloff85'][m].mean()), 1),
                'bands': [round(float(x), 4) for x in feat['bands'][m].mean(axis=0)],
                'chroma': [round(float(x), 4) for x in chroma],
                'flux': round(float(feat['flux'][m].mean()), 3),
                'flux_low': round(float(feat['flux_low'][m].mean()), 3),
                'flux_mid': round(float(feat['flux_mid'][m].mean()), 3),
                'flux_hi': round(float(feat['flux_hi'][m].mean()), 3),
                'rms': round(float(feat['rms'][m].mean()), 5),
            })
        t += bar
        i += 1
    return {'bar_sec': bar, 'beat_sec': period, 'offset': offset, 'bars': rows}


def novelty(bars, k=4):
    """在"4 小节块"上算相邻块特征差，作为分段 novelty 曲线。"""
    n = len(bars)
    if n < 2 * k:
        return np.zeros(n)
    feats = []
    for b in bars:
        v = []
        # 能量（标准化后）
        v.append(b['rms_db'] / 10.0)
        v.append(math.log(max(b['centroid'], 1.0)))
        v += [x * 4.0 for x in b['bands']]
        v += [x * 3.0 for x in b['chroma']]
        feats.append(np.asarray(v, dtype=np.float64))
    F = np.array(feats)
    F = (F - F.mean(axis=0)) / (F.std(axis=0) + 1e-9)
    nov = np.zeros(n)
    for i in range(k, n - k):
        a = F[i - k:i].mean(axis=0)
        c = F[i:i + k].mean(axis=0)
        nov[i] = np.linalg.norm(c - a)
    return nov


def pick_boundaries(nov, min_gap=4, k=4, rel=0.45):
    """novelty 局部峰 → 段边界（小节索引）。"""
    n = len(nov)
    if n == 0:
        return [0]
    thr = max(nov.max() * rel, nov.mean() + 0.2 * nov.std())
    cand = []
    for i in range(1, n - 1):
        if nov[i] >= nov[i - 1] and nov[i] > nov[i + 1] and nov[i] >= thr:
            cand.append(i)
    cand.sort(key=lambda i: -nov[i])
    chosen = []
    for i in cand:
        if all(abs(i - j) >= min_gap for j in chosen):
            chosen.append(i)
    chosen.sort()
    b = [0] + chosen
    if n - 1 not in b:
        b.append(n - 1)
    return b


# ---------------------------------------------------------------- 主旋律轮廓

def semi_beat_contour(feat, bpm, t0, t1, offset=0.0, beats_per_unit=2, fmin=500.0):
    """
    每半小节（beats_per_unit 拍）取 500-4000Hz 最强音级 + 相对音区。
    返回 [{t0,t1,pc,pc_name,top3,reg,reg_label,mag,centroid}]
    reg_label: 高/中/低（相对全曲该窗的中位数 log2 频率）
    """
    times = feat['times']
    step = beats_per_unit * 60.0 / bpm
    ch = feat['chroma_hi'].astype(np.float64)
    sp = feat['sop_peak'].astype(np.float64)
    out = []
    t = t0
    while t < t1 - 1e-6:
        m = (times >= t) & (times < t + step)
        if m.sum() >= 2:
            v = ch[m].mean(axis=0)
            if v.sum() > 1e-9:
                pcs = np.argsort(-v)
                peak = float(np.median(sp[m][sp[m] > 0])) if (sp[m] > 0).any() else 0.0
                out.append({
                    't0': round(t, 3), 't1': round(min(t + step, t1), 3),
                    'pc': int(pcs[0]), 'pc_name': NOTE_NAMES[int(pcs[0])],
                    'top3': [NOTE_NAMES[int(p)] for p in pcs[:3]],
                    'mag': round(float(v[pcs[0]] / (v.sum() + 1e-9)), 4),
                    'peak_hz': round(peak, 1),
                    'log_f': round(math.log2(peak) if peak > 0 else 0.0, 3),
                })
        t += step
    # 相对音区
    lf = [x['log_f'] for x in out if x['log_f'] > 0]
    if lf:
        med = float(np.median(lf))
        for x in out:
            d = x['log_f'] - med if x['log_f'] > 0 else 0.0
            x['reg'] = round(d, 2)
            x['reg_label'] = '高' if d > 0.34 else ('低' if d < -0.34 else '中')
    return out


def pc_seq(contour):
    return [x['pc'] for x in contour]


def best_shift(seq_a, seq_b):
    """找 b 相对 a 的最佳移调半音数（-6..6），返回 (shift, agree, n)。"""
    n = min(len(seq_a), len(seq_b))
    if n < 4:
        return 0, 0.0, n
    a = np.array(seq_a[:n])
    b = np.array(seq_b[:n])
    best = (-1.0, 0)
    for s in range(-6, 7):
        agree = float(np.mean(((a + s) % 12) == b))
        if agree > best[0]:
            best = (agree, s)
    return best[1], best[0], n


# ---------------------------------------------------------------- IO

def save_json(path, obj):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def fmt_sec(s):
    return '%d:%05.2f' % (int(s // 60), s % 60)
