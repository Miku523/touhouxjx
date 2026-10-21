# -*- coding: utf-8 -*-
"""_ref7_lib.py —— 3 首《U.N.オーエンは彼女なのか？》改编曲（激戦の人）的纯 numpy 分析库。
只有 numpy + soundfile。核心 FFT 原语复用 _ref5_lib（上一批参考曲工具），
新增：16 分栅格细测速（0.01BPM 搜索 + 置信度）、局部变速/拍号检测、
半小节和弦、减和弦/半音走句/不协和音程/突然静音/失真度/切分度检测。
"""
import os
import sys
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5

NAMES = L5.NAMES
KEY_MAJOR = L5.KS_MAJ
KEY_MINOR = L5.KS_MIN
MAJ_INT = L5.MAJ_INTERVALS
MIN_INT = L5.MIN_INTERVALS


# ------------------------------------------------------------------ 基础
def load_mono(path):
    d, sr = sf.read(path, always_2d=True)
    return d.mean(1).astype(np.float32), sr


def _parab(y, i):
    """峰值抛物线插值，返回相对第 i 帧的偏移（-0.5..0.5）。"""
    if i <= 0 or i >= len(y) - 1:
        return 0.0
    a, b, c = float(y[i - 1]), float(y[i]), float(y[i + 1])
    d = a - 2 * b + c
    if abs(d) < 1e-12:
        return 0.0
    off = 0.5 * (a - c) / d
    return off if abs(off) < 1.0 else 0.0


# ------------------------------------------------------------------ 起音
def extract_onsets(flux, fps, k=1.25, gap=0.028):
    """多频段谱通量 → 合流起音事件（时间 + 强度）。返回 (t, w, band_idx)。"""
    f = np.asarray(flux, np.float64)
    comb = f[:, 0] * 1.0 + f[:, 1] * 0.9 + f[:, 2] * 0.35 + f[:, 3] * 0.55 + f[:, 4] * 0.30
    n = len(comb)
    win = max(5, int(round(0.20 * fps)))
    ker = np.ones(win) / win
    loc = np.convolve(comb, ker, 'same')
    thr = loc * k + 1e-12
    cand = np.where((comb[1:-1] > comb[:-2]) & (comb[1:-1] >= comb[2:]) &
                    (comb[1:-1] > thr[1:-1]))[0] + 1
    keep = []
    gapn = max(1, int(round(gap * fps)))
    for i in cand:
        if not keep or i - keep[-1] >= gapn:
            keep.append(int(i))
        elif comb[i] > comb[keep[-1]]:
            keep[-1] = int(i)
    idx = np.array(keep, dtype=np.int64)
    if len(idx) == 0:
        return np.zeros(0), np.zeros(0), np.zeros(0, np.int64)
    lg = np.log(np.maximum(comb, 1e-9))
    off = np.array([_parab(lg, i) for i in idx])
    t = (idx + off) / fps
    w = comb[idx]
    band = np.argmax(f[idx], axis=1)
    return t, w, band


def drum_onsets(flux, fps):
    """鼓类起音（底鼓+军鼓为主，含中频），用于测速与拍相。"""
    f = np.asarray(flux, np.float64)
    comb = f[:, 0] * 1.0 + f[:, 1] * 1.0 + f[:, 2] * 0.35
    n = len(comb)
    win = max(5, int(round(0.18 * fps)))
    loc = np.convolve(comb, np.ones(win) / win, 'same')
    cand = np.where((comb[1:-1] > comb[:-2]) & (comb[1:-1] >= comb[2:]) &
                    (comb[1:-1] > loc[1:-1] * 1.15 + 1e-12))[0] + 1
    keep = []
    gapn = max(1, int(round(0.05 * fps)))
    for i in cand:
        if not keep or i - keep[-1] >= gapn:
            keep.append(int(i))
        elif comb[i] > comb[keep[-1]]:
            keep[-1] = int(i)
    idx = np.array(keep, dtype=np.int64)
    if len(idx) == 0:
        return np.zeros(0), np.zeros(0)
    lg = np.log(np.maximum(comb, 1e-9))
    off = np.array([_parab(lg, i) for i in idx])
    return (idx + off) / fps, comb[idx]


# ------------------------------------------------------------------ 测速
def _comb_excess(t, w, bpm, phase, div, sigma):
    """栅格梳状分数（去除随机基线）：div=1 每拍，4 每 16 分，0.25 每小节。"""
    P = 60.0 / bpm / div
    r = np.mod(t - phase, P)
    r = np.minimum(r, P - r)
    s = float((w * np.exp(-0.5 * (r / sigma) ** 2)).sum() / w.sum())
    e = min(0.94, 2.5066 * sigma / P)  # 均匀分布下的期望
    return (s - e) / (1.0 - e)


def _best_phase(t, w, bpm, div, sigma, nph=24):
    P = 60.0 / bpm / div
    ph = np.arange(nph) * (P / nph)
    d = np.mod(t[None, :] - ph[:, None], P)
    d = np.minimum(d, P - d)
    g = np.exp(-0.5 * (d / sigma) ** 2)
    s = (g * w[None, :]).sum(1) / w.sum()
    e = min(0.94, 2.5066 * sigma / P)
    ex = (s - e) / (1.0 - e)
    j = int(np.argmax(ex))
    best = float(ex[j])
    bestph = float(ph[j])
    step = P / nph / 2.0
    for _ in range(6):
        for cand in ((bestph - step) % P, (bestph + step) % P):
            v = _comb_excess(t, w, bpm, cand, div, sigma)
            if v > best:
                best, bestph = float(v), float(cand)
        step *= 0.5
    return best, bestph


def score_bpm(t, w, bpm, sigma=0.016, nph=24):
    """合成拍感分数：拍梳 0.45 + 16 分梳 0.35 + 小节梳 0.20。"""
    if len(t) < 30:
        return dict(total=0.0, beat=0.0, s16=0.0, bar=0.0, phase_beat=0.0, phase_16=0.0)
    sb, pb = _best_phase(t, w, bpm, 1, sigma, nph)
    s16, p16 = _best_phase(t, w, bpm, 4, sigma, nph)
    sbarr, _ = _best_phase(t, w, bpm, 0.25, sigma * 1.6, nph)
    total = 0.45 * sb + 0.35 * s16 + 0.20 * sbarr
    return dict(total=total, beat=sb, s16=s16, bar=sbarr, phase_beat=pb, phase_16=p16)


def refine_tempo(t, w, bpm0, span=0.02, step=0.02, sigma=0.016):
    """在 bpm0 附近细扫（默认 ±2%），返回 (bpm, info)。"""
    b0 = bpm0 * (1 - span)
    b1 = bpm0 * (1 + span)
    grid = np.arange(b0, b1 + 1e-9, step)
    if len(grid) < 3:
        grid = np.linspace(b0, b1, 5)
    best = None
    for b in grid:
        s = score_bpm(t, w, float(b), sigma, nph=12)
        if best is None or s['total'] > best[1]['total']:
            best = (float(b), s)
    # 再细一档 0.002（相位用更密栅格）
    b_hi = best[0]
    grid2 = np.arange(b_hi - step, b_hi + step + 1e-9, 0.004)
    for b in grid2:
        s = score_bpm(t, w, float(b), sigma, nph=36)
        if s['total'] > best[1]['total']:
            best = (float(b), s)
    return best


def _subsample(t, w, cap=8000):
    if len(t) <= cap:
        return t, w
    idx = np.argsort(w)[::-1][:cap]
    idx.sort()
    return t[idx], w[idx]


def estimate_tempo_ex(t, w, prior=155.0):
    """候选集：粗搜（1BPM 步进）+ 半/倍速对照，全部细扫后按拍感打分。"""
    if len(t) < 60:
        return [], {}
    t, w = _subsample(t, w)
    # 粗梳：以 1.0 BPM 步进全范围扫，再取局部峰
    grid = np.arange(70.0, 205.0, 1.0)
    raw = []
    for b in grid:
        s = score_bpm(t, w, float(b), 0.016, nph=10)
        raw.append(s['total'])
    raw = np.array(raw)
    order = np.argsort(raw)[::-1]
    picks = []
    for j in order:
        b = float(grid[j])
        if all(abs(b - p) > 3 for p in picks):
            picks.append(b)
        if len(picks) >= 5:
            break
    cands = {}
    for c in picks:
        bpm, info = refine_tempo(t, w, c, span=0.025, step=0.02)
        cands[round(bpm, 3)] = info
        for m in (0.5, 2.0):
            if 40 < c * m < 260:
                bpm2, info2 = refine_tempo(t, w, c * m, span=0.02, step=0.02)
                cands[round(bpm2, 3)] = info2
    # 按总分排序，并按「半/倍速 + 邻近 BPM」的对照算置信
    items = sorted(cands.items(), key=lambda kv: -kv[1]['total'])
    best_bpm, best_info = items[0]
    near = [s['total'] for b, s in items if 0.5 < abs(b - best_bpm) < 6.0]
    rel = [s['total'] for b, s in items
           if abs(b / best_bpm - 0.5) < 0.08 or abs(b / best_bpm - 2.0) < 0.15]
    rivals = near + rel
    riv_med = float(np.median(rivals)) if rivals else 0.0
    rivals_max = float(np.max(rivals)) if rivals else 0.0
    prom = (best_info['total'] - riv_med) / (abs(best_info['total']) + 1e-9)
    prom_strict = (best_info['total'] - rivals_max) / (abs(best_info['total']) + 1e-9)
    # 栅格贴合率
    P16 = 60.0 / best_bpm / 4
    r = np.mod(t - best_info['phase_16'], P16)
    r = np.minimum(r, P16 - r)
    fit = float((w * (r < 0.020)).sum() / w.sum())
    conf = float(np.clip(0.55 * fit + 0.30 * np.clip(prom * 2.0, 0, 1)
                         + 0.15 * np.clip(prom_strict * 1.6, 0, 1), 0, 1))
    # 最终用更密相位栅格 & 全部起音重算一次相位/分数
    sb, pb = _best_phase(t, w, best_bpm, 1, 0.016, 96)
    s16, p16 = _best_phase(t, w, best_bpm, 4, 0.016, 96)
    sbarr, _ = _best_phase(t, w, best_bpm, 0.25, 0.026, 96)
    best_info = dict(total=0.45 * sb + 0.35 * s16 + 0.20 * sbarr,
                     beat=sb, s16=s16, bar=sbarr,
                     phase_beat=pb, phase_16=p16)
    return [(round(b, 2), round(s['total'], 4)) for b, s in items], dict(
        bpm=round(best_bpm, 3), prom=round(float(prom), 3),
        prom_strict=round(float(prom_strict), 3), fit=round(fit, 3),
        conf=round(conf, 3), info=best_info)


def meter_check(t, w, bpm, sigma=0.016):
    """3/4 vs 4/4：比较小节周期梳状分数。"""
    out = {}
    for m in (3, 4, 6):
        sb, _ = _best_phase(t, w, bpm, 1.0 / m, sigma * 1.6)
        out[m] = round(float(sb), 4)
    return out


def local_tempos(t, w, bpm, win=20.0, hop=10.0, span=0.03):
    """滑窗局部速度（检测变速/半速段）。返回 [(t_mid, bpm, score)]。"""
    out = []
    tmax = t.max() if len(t) else 0
    t0 = 0.0
    while t0 + win <= tmax + 1e-6:
        m = (t >= t0) & (t < t0 + win)
        if m.sum() >= 40:
            b, info = refine_tempo(t[m], w[m], bpm, span=span, step=0.01)
            out.append((round(t0 + win / 2, 2), round(b, 2), round(info['total'], 3),
                        round(float(info['s16']), 3)))
        t0 += hop
    return out


def grid_residual_drift(t, w, bpm, phase16):
    """16 分栅格残差随时间漂移：返回斜率 (ms/100s) 与分段贴合率。"""
    if len(t) < 100:
        return 0.0, []
    P16 = 60.0 / bpm / 4
    r = np.mod(t - phase16, P16)
    r = np.minimum(r, P16 - r)
    good = r < 0.022
    tt = t[good]
    rr = r[good]
    # 每 15s 一段的平均有符号残差（用最近格点方向，去相位）
    edges = np.arange(0, t.max() + 15, 15)
    seg = []
    for i in range(len(edges) - 1):
        m = (tt >= edges[i]) & (tt < edges[i + 1])
        if m.sum() > 20:
            seg.append((round(float(tt[m].mean()), 1), round(float(rr[m].mean() * 1000), 1)))
    if len(seg) >= 4:
        xs = np.array([s[0] for s in seg])
        ys = np.array([s[1] for s in seg])
        slope = float(np.polyfit(xs, ys, 1)[0]) * 100.0  # ms / 100s
    else:
        slope = 0.0
    return slope, seg


# ------------------------------------------------------------------ 色谱/低音（复用 ref5）
def chroma_frames(x, sr):
    outs, ch_fps = L5.chroma_frames(x, sr)
    return outs[0], outs[1], ch_fps


def bass_track(x, sr):
    return L5.bass_track(x, sr)


# ------------------------------------------------------------------ 调性
def key_candidates(chroma_med, bass_hist=None, topn=8):
    c = np.asarray(chroma_med, np.float64)
    c = (c - c.mean()) / (c.std() + 1e-9)
    res = []
    for mode, ks, ivs in (('major', KEY_MAJOR, MAJ_INT), ('minor', KEY_MINOR, MIN_INT)):
        tpl = (ks - ks.mean()) / ks.std()
        for root in range(12):
            r = float((c * np.roll(tpl, root)).mean())
            bonus = 0.0
            if bass_hist is not None:
                bonus = 0.35 * float(bass_hist[root])
            res.append((round(r + bonus, 4), NAMES[root], mode,
                        [NAMES[(root + k) % 12] for k in ivs], round(r, 4), round(bonus, 4)))
    res.sort(key=lambda z: -z[0])
    # 去重（同名同调式）
    out = []
    for r in res:
        if all(not (r[1] == o[1] and r[2] == o[2]) for o in out):
            out.append(r)
        if len(out) >= topn:
            break
    return out


def mode_name(tonic, scale_pcs):
    ivs = sorted(((p - NAMES.index(tonic)) % 12) for p in scale_pcs)
    return L5.MODE_BY_DEG.get(ivs[1] if len(ivs) > 1 else 0, '?')


# ------------------------------------------------------------------ 和弦
CHORDS_W = {'': (0, 4, 7, 1.0), 'm': (0, 3, 7, 1.0), 'dim': (0, 3, 6, 0.85),
            'sus4': (0, 5, 7, 0.8), '5': (0, 7, 12, 0.7),
            'm7': (0, 3, 7, 10, 0.6), '7': (0, 4, 7, 10, 0.6),
            'dim7': (0, 3, 6, 9, 0.55)}


def chord_fit(chroma, bass, root_bonus=1.25, topn=3):
    ch = np.maximum(np.asarray(chroma, np.float64), 0)
    bs = np.maximum(np.asarray(bass, np.float64), 0)
    ch = ch / (ch.sum() + 1e-9)
    bs = bs / (bs.sum() + 1e-9)
    cands = []
    for root in range(12):
        for q, ivs in CHORDS_W.items():
            wq = ivs[-1]
            tones = set((root + k) % 12 for k in ivs[:-1])
            inside = sum(ch[(root + k) % 12] * (1.0 if k in (0, 3, 4) else 0.85)
                         for k in ivs[:-1])
            outside = 1.0 - sum(ch[t] for t in tones)
            sc = inside - 0.55 * outside + root_bonus * bs[root]
            cands.append((float(sc), NAMES[root] + q, root, q, wq))
    cands.sort(key=lambda z: -z[0])
    out = []
    for sc, nm, root, q, wq in cands:
        if all(nm != o[1] for o in out):
            out.append((round(sc, 4), nm, root, q))
        if len(out) >= topn:
            break
    return out


def to_roman(name, tonic_pc):
    q = ''
    for suf in ('dim7', 'sus4', 'dim', 'm7', '7', 'm', '5'):
        if name.endswith(suf) and len(name) > len(suf):
            q = suf
            break
    rootname = name[:-len(q)] if q else name
    if rootname not in NAMES:
        return '?'
    deg = L5.CHROM_DEG.get((NAMES.index(rootname) - tonic_pc) % 12, '?')
    if q in ('m', 'm7'):
        deg = deg.lower()
    if q in ('dim', 'dim7'):
        deg = deg.lower() + ('°' if q == 'dim' else '°7')
    if q == 'sus4':
        deg += 'sus4'
    if q == '5':
        deg += '5'
    if q == '7':
        deg += '7'
    return deg


# ------------------------------------------------------------------ 小节表
def bar_tables(x, sr, ch, bass_ch, ch_fps, bnote, bstr, bfps, flux, fps, bpm, off, meter=4):
    beat = 60.0 / bpm
    bar = meter * beat
    dur = len(x) / sr
    t_ch = np.arange(ch.shape[0]) / ch_fps
    t_b = np.arange(len(bnote)) / bfps
    tot_flux = flux.sum(1)
    bars = []
    b = 0
    while off + (b + 1) * bar <= dur + 1e-6:
        t0 = off + b * bar
        t1 = t0 + bar
        m = (t_ch >= t0) & (t_ch < t1)
        if m.sum() < 2:
            break
        chm = np.median(ch[m], axis=0)
        bsn = np.median(bass_ch[m], axis=0)
        # 低音音高直方图
        mb = (t_b >= t0) & (t_b < t1)
        bpc_hist = np.zeros(12)
        bnote_mode = -1
        if mb.sum():
            pcs = bnote[mb] % 12
            w = bstr[mb]
            for p, ww in zip(pcs, w):
                bpc_hist[p] += ww
            vals, cnts = np.unique(pcs, return_counts=True)
            bnote_mode = int(vals[np.argmax(cnts)])
        # 频段 + 失真度 + 波峰因数
        seg = x[int(t0 * sr):int(t1 * sr)]
        L = min(len(seg), 32768)
        if L < 256:
            break
        X = np.abs(np.fft.rfft(seg[:L] * np.hanning(L)))
        X2 = X ** 2
        f = np.fft.rfftfreq(L, 1.0 / sr)
        tot = X2.sum() + 1e-12
        low = float(X2[(f >= 30) & (f < 120)].sum() / tot)
        mid = float(X2[(f >= 120) & (f < 500)].sum() / tot)
        midh = float(X2[(f >= 500) & (f < 2500)].sum() / tot)
        high = float(X2[(f >= 2500) & (f < 8000)].sum() / tot)
        air = float(X2[f >= 8000].sum() / tot)
        cen = float((f * X2).sum() / tot)
        mf = (f >= 200) & (f < 8000)
        Xm = X[mf] + 1e-12
        flat = float(np.exp(np.mean(np.log(Xm))) / np.mean(Xm))
        crest = float(np.abs(seg).max() / (np.sqrt((seg ** 2).mean()) + 1e-9))
        # 鼓/起音计数
        fr0 = max(0, int(t0 * fps))
        fr1 = max(fr0 + 1, min(len(flux) - 1, int(t1 * fps)))
        kc = L5._peaks(flux[fr0:fr1, 0])
        sc_ = L5._peaks(flux[fr0:fr1, 1] + flux[fr0:fr1, 2])
        hc = L5._peaks(flux[fr0:fr1, 3] + flux[fr0:fr1, 4])
        dens = float(L5._peaks(tot_flux[fr0:fr1]) / bar)
        # 半小节
        halves = []
        for h in range(2):
            h0 = t0 + h * bar / 2
            h1 = h0 + bar / 2
            hm = (t_ch >= h0) & (t_ch < h1)
            hb = (t_b >= h0) & (t_b < h1)
            hch = np.median(ch[hm], axis=0) if hm.sum() else chm
            hbs = np.median(bass_ch[hm], axis=0) if hm.sum() else bsn
            hbass_pc = -1
            if hb.sum():
                vals, cnts = np.unique(bnote[hb] % 12, return_counts=True)
                hbass_pc = int(vals[np.argmax(cnts)])
            cand = chord_fit(hch, hbs)
            halves.append(dict(h=h, t=round(h0, 3), chord=cand[0][1],
                               root_pc=int(cand[0][2]), q=cand[0][3],
                               margin=round(cand[0][0] - cand[1][0], 4),
                               bass_pc=hbass_pc, cands=[c[1] for c in cand]))
        cand = chord_fit(chm, bsn)
        # 十二音熵（复调密度）
        cnorm = chm / (chm.sum() + 1e-9)
        ent = float(-(cnorm * np.log(cnorm + 1e-12)).sum() / np.log(12))
        bars.append(dict(
            i=b, t0=round(t0, 3), t1=round(t1, 3),
            rms=float(np.sqrt((seg ** 2).mean() + 1e-12)),
            low=round(low, 4), mid=round(mid, 4), midh=round(midh, 4),
            high=round(high, 4), air=round(air, 4), cen=round(cen, 1),
            flatness=round(flat, 4), crest=round(crest, 2),
            chroma=[round(float(v), 4) for v in chm],
            bass_chroma=[round(float(v), 4) for v in bsn],
            bass_pc=int(np.argmax(bpc_hist)) if bpc_hist.sum() else -1,
            bass_note=bnote_mode,
            chord=cand[0][1], chord_root=int(cand[0][2]), chord_q=cand[0][3],
            chord_margin=round(cand[0][0] - cand[1][0], 4),
            chord2=cand[1][1], chord3=cand[2][1],
            halves=halves, chroma_entropy=round(ent, 4),
            kick=kc, snare=sc_, hat=hc, density=round(dens, 2)))
        b += 1
    return bars


# ------------------------------------------------------------------ 段落
def bar_novelty(bars, win=4, thr=0.02):
    F = []
    for b in bars:
        v = np.array(b['chroma'] + [b['low'], b['mid'], b['midh'], b['high'],
                                    min(b['density'] / 10.0, 1.0),
                                    b['flatness'] * 3], float)
        v = v / (np.linalg.norm(v) + 1e-9)
        F.append(v)
    F = np.array(F)
    nov = np.zeros(len(F))
    for i in range(win, len(F) - win):
        a = F[i - win:i].mean(0)
        bb = F[i:i + win].mean(0)
        cos = float(a @ bb / (np.linalg.norm(a) * np.linalg.norm(bb) + 1e-9))
        nov[i] = 1 - cos
    peaks = []
    for i in range(win, len(F) - win):
        if nov[i] > thr and nov[i] >= nov[i - 1] and nov[i] > nov[i + 1]:
            if not peaks or i - peaks[-1][0] >= 4:
                peaks.append((i, round(float(nov[i]), 4)))
    return nov, peaks


# ------------------------------------------------------------------ 减和弦/不协和
def dissonance_scan(ch, ch_fps, bass_ch=None):
    """逐帧：小二度、三全音同时发声强度 + 熵。返回 (m2, tt, ent) 曲线。"""
    c = np.maximum(np.asarray(ch, np.float64), 0)
    c = c / (c.sum(1, keepdims=True) + 1e-9)
    n = len(c)
    m2 = np.zeros(n)
    tt = np.zeros(n)
    for pc in range(12):
        m2 = np.maximum(m2, np.minimum(c[:, pc], c[:, (pc + 1) % 12]))
        tt = np.maximum(tt, np.minimum(c[:, pc], c[:, (pc + 6) % 12]))
    ent = -(c * np.log(c + 1e-12)).sum(1) / np.log(12)
    return m2, tt, ent


def dims_score(chroma):
    """所有根音的减三和弦最佳拟合（用于检测减和弦）。"""
    ch = np.maximum(np.asarray(chroma, np.float64), 0)
    ch = ch / (ch.sum() + 1e-9)
    best = (-1, None, None)
    for root in range(12):
        tones = [(root) % 12, (root + 3) % 12, (root + 6) % 12]
        inside = sum(ch[t] for t in tones)
        outside = 1 - inside
        sc = inside - 0.55 * outside
        if sc > best[0]:
            best = (sc, NAMES[root] + 'dim', root)
    return best


# ------------------------------------------------------------------ 旋律
def melody_track(x, sr):
    return L5.melody_track(x, sr, n_fft=2048, hop=512, lo=500, hi=3500)


def chroma_runs(mt, ms, fps, min_len=4, max_gap=0.09):
    """旋律半音级进走句：连续 |Δ|=1 半音的音符串。"""
    ok = ms > np.percentile(ms, 50)
    t = np.arange(len(mt)) / fps
    seq_t = t[ok]
    seq_m = np.round(mt[ok]).astype(int)
    if len(seq_m) < 20:
        return []
    # 合并同音
    notes = []
    for i in range(len(seq_m)):
        if not notes or seq_m[i] != notes[-1][0]:
            notes.append([seq_m[i], seq_t[i], seq_t[i]])
        else:
            notes[-1][2] = seq_t[i]
    # 太短的抖音合并
    merged = []
    for nm in notes:
        if merged and (nm[1] - merged[-1][2] < max_gap):
            if nm[0] == merged[-1][0]:
                merged[-1][2] = nm[2]
                continue
        merged.append(nm)
    runs = []
    i = 0
    while i < len(merged) - 1:
        d = merged[i + 1][0] - merged[i][0]
        if abs(d) == 1:
            j = i
            seq = [merged[i][0]]
            while j + 1 < len(merged) and abs(merged[j + 1][0] - merged[j][0]) == 1:
                seq.append(merged[j + 1][0])
                j += 1
            if len(seq) >= min_len:
                dur = merged[j][2] - merged[i][1]
                if dur <= 1.6:
                    runs.append(dict(t=round(float(merged[i][1]), 1),
                                     notes=[int(x) for x in seq],
                                     dur=round(float(dur), 2),
                                     dir=('up' if seq[-1] > seq[0] else 'down'),
                                     span=int(max(seq) - min(seq))))
            i = j
        else:
            i += 1
    return runs


def melody_stats(mt, ms, fps):
    return L5.melody_stats(mt, ms, fps)


# ------------------------------------------------------------------ 静音/瞬态
def silence_scan(x, sr, hop=0.02):
    """20ms RMS，返回突然静音/抽空段 [(t0,t1,dur,drop_db)]。"""
    n = int(hop * sr)
    m = (len(x) // n) * n
    r = np.sqrt((x[:m].reshape(-1, n) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(r + 1e-9)
    med = float(np.median(db))
    thr = med - 16.0
    out = []
    i = 0
    N = len(db)
    while i < N:
        if db[i] < thr:
            j = i
            while j + 1 < N and db[j + 1] < thr:
                j += 1
            if (j - i + 1) * hop >= 0.10:
                pre = float(np.max(db[max(0, i - 60):i + 1])) if i > 0 else med
                out.append(dict(t0=round(i * hop, 2), t1=round((j + 1) * hop, 2),
                                dur=round((j - i + 1) * hop, 2),
                                drop_db=round(pre - float(np.mean(db[i:j + 1])), 1)))
            i = j + 1
        else:
            i += 1
    return out


# ------------------------------------------------------------------ 16 步鼓型
def _band_onsets(env, fps, k=1.0, gap=0.020):
    env = np.asarray(env, np.float64)
    n = len(env)
    win = max(5, int(round(0.10 * fps)))
    loc = np.convolve(env, np.ones(win) / win, 'same')
    cand = np.where((env[1:-1] > env[:-2]) & (env[1:-1] >= env[2:]) &
                    (env[1:-1] > loc[1:-1] * k + 1e-12))[0] + 1
    keep = []
    gapn = max(1, int(round(gap * fps)))
    for i in cand:
        if not keep or i - keep[-1] >= gapn:
            keep.append(int(i))
        elif env[i] > env[keep[-1]]:
            keep[-1] = int(i)
    idx = np.array(keep, dtype=np.int64)
    if len(idx) == 0:
        return np.zeros(0), np.zeros(0)
    lg = np.log(np.maximum(env, 1e-9))
    off = np.array([_parab(lg, i) for i in idx])
    return (idx + off) / fps, env[idx]


def drum16(flux, fps, bpm, off, meter=4, nstep=16):
    """16 步直方图 + 幅度加权直方图 + 拍位/反拍/双踩统计。"""
    beat = 60.0 / bpm
    step = beat / 4
    step_bar = meter * 4
    bands = dict(kick=flux[:, 0], snare=flux[:, 1] + 0.6 * flux[:, 2],
                 hat=flux[:, 3] + flux[:, 4])
    out = {}
    tmax = len(flux) / fps
    bars_total = max(1e-9, (tmax - off) / (meter * beat))
    for name, env in bands.items():
        t, a = _band_onsets(env, fps, k=1.05, gap=0.015)
        m = t >= off
        t, a = t[m], a[m]
        if len(t) == 0:
            out[name] = dict(n=0, per_bar=0.0, hist16=[0] * nstep,
                             amp16=[0.0] * nstep, beat_hist=[0] * meter,
                             acc_ratio=0.0)
            continue
        pos = np.round((t - off) / step).astype(np.int64) % step_bar
        pos16 = pos % nstep
        if meter != 4:
            pos16 = pos % nstep
        hist = np.bincount(pos16, minlength=nstep)[:nstep]
        amp = np.zeros(nstep)
        cnt = np.zeros(nstep)
        for p, aa in zip(pos16, a):
            amp[p] += aa
            cnt[p] += 1
        amp_mean = np.where(cnt > 0, amp / np.maximum(cnt, 1), 0.0)
        ampmx = amp_mean.max() if amp_mean.max() > 0 else 1.0
        beat_hist = [int(hist[i * 4:(i + 1) * 4].sum()) for i in range(meter)]
        out[name] = dict(
            n=int(len(t)), per_bar=round(len(t) / bars_total, 2),
            hist16=[int(v) for v in hist],
            amp16=[round(float(v / ampmx), 3) for v in amp_mean],
            amp_sum16=[round(float(v / (amp.sum() + 1e-9)), 3) for v in amp],
            beat_hist=beat_hist,
            acc_ratio=round(float((a > np.percentile(a, 85)).mean()), 2))
    # 特殊动机
    k = out['kick']
    if k['n']:
        h = k['hist16']
        four = sum(1 for b in range(1) if all(h[i] > 0 for i in (0, 4, 8, 12)))
        out['four_on_floor_bars_frac'] = round(
            float(np.mean([(h[0] > 0 and h[4] > 0 and h[8] > 0 and h[12] > 0)])), 2)
        out['offbeat_kick_frac'] = round(float((h[2] + h[6] + h[10] + h[14])
                                               / max(1, sum(h))), 3)
        out['grid_kick_frac'] = round(float((h[0] + h[4] + h[8] + h[12])
                                            / max(1, sum(h))), 3)
        out['kick_per_bar'] = k['per_bar']
    s = out['snare']
    if s['n']:
        h = s['hist16']
        out['backbeat_snare_frac'] = round(float((h[4] + h[12]) / max(1, sum(h))), 3)
    # 双踩：同一 16 分格 ±40ms 内两个底鼓（32 分连击）的比例
    tk, ak = _band_onsets(flux[:, 0], fps, k=0.9, gap=0.010)
    tk = tk[tk >= off]
    if len(tk) > 2:
        dt = np.diff(tk)
        out['double_kick_frac'] = round(float((dt < 0.075).mean()), 3)
    # 每小节底鼓数分布
    bar_kick = []
    if len(tk):
        bpos = np.floor((tk - off) / (meter * beat)).astype(int)
        for b in range(int(bars_total)):
            bar_kick.append(int((bpos == b).sum()))
        out['kick_per_bar_median'] = int(np.median(bar_kick)) if bar_kick else 0
        out['kick_per_bar_max'] = int(np.max(bar_kick)) if bar_kick else 0
    return out


# ------------------------------------------------------------------ 主分析
def analyze(path, tag=None, meter=4):
    import time
    T0 = time.time()
    x, sr = load_mono(path)
    dur = len(x) / sr
    energy, flux, fps, bands = L5.percussive(x, sr)
    tot_flux = flux.sum(1)

    t_all, w_all, band_all = extract_onsets(flux, fps)
    t_dr, w_dr = drum_onsets(flux, fps)
    # 鼓起音权重也乘总通量，保证可比较
    osc, oinfo = estimate_tempo_ex(t_dr if len(t_dr) > 50 else t_all,
                                   w_dr if len(t_dr) > 50 else w_all)
    bpm = oinfo['bpm']
    off, bar, fof, kk, ss, cc = L5.beat_phase(flux, fps, bpm)
    meter_sc = meter_check(t_dr if len(t_dr) > 50 else t_all,
                           w_dr if len(t_dr) > 50 else w_all, bpm)
    loc = local_tempos(t_dr if len(t_dr) > 50 else t_all,
                       w_dr if len(t_dr) > 50 else w_all, bpm, win=20.0, hop=10.0)
    drift, seg = grid_residual_drift(t_dr if len(t_dr) > 50 else t_all,
                                     w_dr if len(t_dr) > 50 else w_all, bpm,
                                     oinfo['info']['phase_16'])

    ch, bass_ch, ch_fps = chroma_frames(x, sr)
    bnote, bstr, bfps = bass_track(x, sr)
    e = ch.sum(1)
    sel = e > np.percentile(e, 35)
    cg = np.median(ch[sel], axis=0)
    bh = np.zeros(12)
    for p, w in zip(bnote % 12, bstr):
        bh[p] += w
    bh = bh / (bh.sum() + 1e-9)
    keys = key_candidates(cg, bh, topn=8)

    bars = bar_tables(x, sr, ch, bass_ch, ch_fps, bnote, bstr, bfps, flux, fps, bpm, off, meter)
    drums16 = drum16(flux, fps, bpm, off, meter)

    nov, peaks = bar_novelty(bars)
    m2, tt, ent = dissonance_scan(ch, ch_fps)
    t_ch = np.arange(ch.shape[0]) / ch_fps
    sil = silence_scan(x, sr)
    mt, ms, mfps = melody_track(x, sr)
    mel = melody_stats(mt, ms, mfps)
    runs = chroma_runs(mt, ms, mfps)

    # 音名集合与音阶匹配率
    cents = cg / (cg.sum() + 1e-9)
    top_pcs = list(np.argsort(cents)[::-1][:7])
    # 0.25s 总能量曲线（dB，相对 -60dB）
    hn = int(0.25 * sr)
    m = (len(x) // hn) * hn
    rr = np.sqrt((x[:m].reshape(-1, hn) ** 2).mean(1) + 1e-12)
    rdb = 20 * np.log10(rr + 1e-9)
    energy_curve = [[round(float(i * 0.25), 2), round(float(v), 1)]
                    for i, v in enumerate(rdb)]
    print('[%s] %.1fs  bpm %.2f conf %.2f  bars %d  %.0fs 用时 %.1fs' % (
        tag or os.path.basename(path), dur, bpm, oinfo['conf'], len(bars), dur,
        time.time() - T0))
    return dict(
        tag=tag or os.path.basename(path), path=path.replace('\\', '/'),
        dur=round(dur, 2), sr=sr, meter=meter,
        bpm=bpm, bpm_conf=oinfo['conf'], bpm_confidence_detail=dict(
            prominence=oinfo['prom'], prom_strict=oinfo['prom_strict'],
            grid_fit=oinfo['fit'],
            beat=round(oinfo['info']['beat'], 4), s16=round(oinfo['info']['s16'], 4),
            bar=round(oinfo['info']['bar'], 4)),
        bpm_candidates=osc, bpm_phase=oinfo['info']['phase_16'],
        bar_sec=round(bar, 4), beat_offset=round(float(off), 4),
        four_on_floor=round(float(fof), 3),
        beat_energy=dict(kick=[round(float(v), 2) for v in kk],
                         snare=[round(float(v), 2) for v in ss],
                         all=[round(float(v), 2) for v in cc]),
        meter_scores=meter_sc, local_tempos=loc,
        grid_drift_ms_per_100s=round(float(drift), 1), grid_residual_seg=seg,
        key=dict(tonic=keys[0][1], mode=keys[0][2], scale=keys[0][3],
                 ks_score=keys[0][4], candidates=[
                     dict(score=r[0], tonic=r[1], mode=r[2], ks=r[4], bass_bonus=r[5])
                     for r in keys[:6]],
                 chroma=[round(float(v), 4) for v in cg],
                 bass_hist=[round(float(v), 4) for v in bh]),
        bars=bars, novelty=[round(float(v), 4) for v in nov], novelty_peaks=peaks,
        drums16=drums16,
        melody=mel, melody_chroma_runs=runs[:60],
        dissonance=dict(m2_frames=int((m2 > 0.16).sum()),
                        tt_frames=int((tt > 0.16).sum()),
                        entropy_mean=round(float(ent.mean()), 4)),
        silences=sil, onsets=dict(n=len(t_all), per_sec=round(len(t_all) / dur, 2)),
        bands=[list(b) for b in bands], energy_curve=energy_curve,
    )
