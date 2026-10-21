# -*- coding: utf-8 -*-
"""_ref5_lib.py —— 5 首《風神少女》参考曲的纯 numpy 特征提取库（v2）。
只有 numpy + soundfile。全部 FFT 分块。
v2 变更：
  * 色谱改用 16384 点 / hop 4096 / 线性幅度 / 1/f 加权 / 150-1400Hz（人工比对后最锐利）；
  * 新增逐帧低音音高跟踪 bass_track()，用于定主音与小节根音；
  * 新增旋律音高跟踪 melody_track()（500-3500Hz 谱峰）；
  * key_of() 分开给「调号（音阶）」与「主音」两件事，避免旋转模板的调式退化；
  * 小节和弦：根音锁低音，三音/五音判性质，输出 margin 置信度；
  * novelty 阈值下调，输出全部候选峰。
"""
import numpy as np
import soundfile as sf

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJ_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
MIN_INTERVALS = [0, 2, 3, 5, 7, 8, 10]
MODE_BY_DEG = {0: 'ionian/major', 2: 'dorian', 4: 'phrygian', 5: 'lydian',
               7: 'mixolydian', 9: 'aeolian/minor', 11: 'locrian'}
CHROM_DEG = {0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: '#IV', 7: 'V',
             8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII'}


def _frames(x, n_fft, hop):
    return np.lib.stride_tricks.sliding_window_view(x, n_fft)[::hop]


def load_mono(path):
    d, sr = sf.read(path, always_2d=True)
    return d.mean(1).astype(np.float32), sr


# ---------------------------------------------------------------- 打击/包络
def percussive(x, sr, n_fft=1024, hop=256, chunk=512):
    """多频段能量 + 多频段谱通量（正半波），fps≈172。"""
    bands = [(30, 110), (150, 350), (1500, 5000), (6000, 9000), (9000, 15000)]
    win = np.hanning(n_fft).astype(np.float32)
    fr = _frames(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    masks = [(freqs >= lo) & (freqs < hi) for lo, hi in bands]
    n = fr.shape[0]
    energy = np.zeros((n, len(bands)), np.float32)
    flux = np.zeros((n, len(bands)), np.float32)
    prev = None
    for i in range(0, n, chunk):
        m = np.abs(np.fft.rfft(fr[i:i + chunk] * win, axis=1)).astype(np.float32)
        for j, mask in enumerate(masks):
            energy[i:i + m.shape[0], j] = m[:, mask].sum(1)
        if prev is None:
            d = np.diff(m, axis=0)
            d[d < 0] = 0
            rows = min(d.shape[0], max(0, n - (i + 1)))
            for j, mask in enumerate(masks):
                flux[i + 1:i + 1 + rows, j] = d[:rows][:, mask].sum(1)
        else:
            seg = np.vstack([prev, m])
            d = np.diff(seg, axis=0)
            d[d < 0] = 0
            rows = min(d.shape[0], n - i)
            for j, mask in enumerate(masks):
                flux[i:i + rows, j] = d[:rows][:, mask].sum(1)
        prev = m[-1:]
    return energy, flux, sr / hop, bands


# ---------------------------------------------------------------- 速度
def estimate_tempo(flux, fps, lo=60, hi=210, prior=155.0):
    e = flux.astype(np.float64)
    e = e - e.mean()
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    ac = ac / (ac[0] + 1e-12)
    cands = []
    for bpm in np.arange(lo, hi + 0.001, 0.25):
        lag = fps * 60.0 / bpm
        s = 0.0
        for k in (1, 2, 3, 4):
            L = int(round(lag * k))
            if 0 < L < len(ac):
                s += ac[L] / (k ** 0.5)
        s *= np.exp(-0.5 * (np.log2(bpm / prior) / 0.45) ** 2)
        cands.append((s, float(bpm)))
    cands.sort(reverse=True)
    picked = []
    for s, b in cands:
        if all(abs(b - bb) > 4 for _, bb in picked):
            picked.append((s, b))
        if len(picked) >= 6:
            break
    top = picked[0][0]
    rest = np.median([s for s, _ in picked[1:]]) if len(picked) > 1 else 0
    return picked, float((top - rest) / (top + 1e-9))


def beat_phase(flux, fps, bpm):
    """4/4 下拍相位：kick 打 1、3，snare 打 2、4。"""
    beat = 60.0 / bpm
    bar = 4 * beat
    n = flux.shape[0]
    t = np.arange(n) / fps
    tot = flux.sum(1)
    kick = flux[:, 0]
    snare = flux[:, 1]

    def at(env, times):
        idx = np.clip(np.searchsorted(t, times), 0, n - 1)
        return np.maximum(env[idx], env[np.clip(idx + 1, 0, n - 1)])

    best = None
    for off in np.arange(0, bar, 0.005):
        beats = np.arange(off, t[-1], beat)
        bmod = np.round((beats - off) / beat).astype(int) % 4
        k = at(kick, beats); s = at(snare, beats)
        sc = 0.0
        for m in range(4):
            sel = bmod == m
            if not sel.any():
                continue
            if m in (0, 2):
                sc += k[sel].mean() - 0.5 * s[sel].mean()
            else:
                sc += s[sel].mean() - 0.5 * k[sel].mean()
        if best is None or sc > best[0]:
            best = (sc, float(off))
    off = best[1]
    beats = np.arange(off, t[-1], beat)
    bmod = np.round((beats - off) / beat).astype(int) % 4
    k = np.zeros(4); s = np.zeros(4); c = np.zeros(4)
    idx = np.clip(np.searchsorted(t, beats), 0, n - 1)
    for m in range(4):
        sel = bmod == m
        if sel.any():
            k[m] = kick[idx[sel]].mean()
            s[m] = snare[idx[sel]].mean()
            c[m] = tot[idx[sel]].mean()
    fof = float(np.mean(k > 0.55 * k.max())) if k.max() > 0 else 0.0
    return off, bar, fof, k, s, c


# ---------------------------------------------------------------- 色谱
def chroma_frames(x, sr, n_fft=16384, hop=4096, hrange=(150, 1400), brange=(35, 190), chunk=48):
    """返回 (和声色谱, 低音色谱)，逐帧 L1 归一化。1/f 加权抵消高频 bin 密度偏置。"""
    win = np.hanning(n_fft).astype(np.float32)
    fr = _frames(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    midi = 69 + 12 * np.log2(np.maximum(freqs, 1e-9) / 440.0)
    pc = np.round(midi).astype(int) % 12
    n = fr.shape[0]
    Ms = []
    for lo, hi in (hrange, brange):
        M = np.zeros((len(freqs), 12), np.float32)
        valid = (freqs >= lo) & (freqs < hi)
        w = 1.0 / np.maximum(freqs, 1.0)
        for b in np.where(valid)[0]:
            M[b, pc[b]] += w[b]
        Ms.append(M)
    outs = [np.zeros((n, 12), np.float32) for _ in range(2)]
    for i in range(0, n, chunk):
        mag = np.abs(np.fft.rfft(fr[i:i + chunk] * win, axis=1)).astype(np.float32)
        for j, M in enumerate(Ms):
            c = mag @ M
            c = c / (c.sum(1, keepdims=True) + 1e-9)
            outs[j][i:i + mag.shape[0]] = c
    return outs, sr / hop


def bass_track(x, sr, n_fft=16384, hop=4096):
    """逐帧低音音高：40-210Hz 内每个 MIDI 音一条带，取「>0.55×最强」里最低的那个。
    返回 (note_idx 相对 28 的 int 数组, 强度 float 数组, fps)。"""
    win = np.hanning(n_fft).astype(np.float32)
    fr = _frames(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    notes = np.arange(28, 56)  # E1..G#3
    masks = [(freqs >= 440 * 2 ** ((nn - 69 - 0.42) / 12)) &
             (freqs < 440 * 2 ** ((nn - 69 + 0.42) / 12)) for nn in notes]
    n = fr.shape[0]
    band = np.zeros((n, len(notes)), np.float32)
    for i in range(0, n, 48):
        m = np.abs(np.fft.rfft(fr[i:i + 48] * win, axis=1)).astype(np.float32)
        for j, mask in enumerate(masks):
            band[i:i + m.shape[0], j] = m[:, mask].max(1)
    mx = band.max(1)
    chosen = np.zeros(n, np.int16)
    for i in range(n):
        if mx[i] <= 0:
            continue
        ok = np.where(band[i] > 0.55 * mx[i])[0]
        chosen[i] = ok[0] if len(ok) else int(np.argmax(band[i]))
    return chosen + 28, band.max(1), sr / hop


# ---------------------------------------------------------------- 调性
def key_of(chroma, bass_hist=None, topn=6):
    """只定「调号 + 相对大小调」，主音另由低音直方图决策。
    返回 [(score, 主音名, 'major'/'minor', 音阶音名列表)]。"""
    c = np.asarray(chroma, np.float64)
    c = (c - c.mean()) / (c.std() + 1e-9)
    res = []
    for mode, ks, ivs in (('major', KS_MAJ, MAJ_INTERVALS), ('minor', KS_MIN, MIN_INTERVALS)):
        tpl0 = (ks - ks.mean()) / ks.std()
        for root in range(12):
            T = np.roll(tpl0, root)
            r = float((c * T).mean())
            res.append((r, NAMES[root], mode, [NAMES[(root + k) % 12] for k in ivs]))
    res.sort(reverse=True)
    out = []
    for r, n, m, ivs in res:
        if all(not (n == o[1] and m == o[2]) for o in out):
            out.append((round(r, 4), n, m, ivs))
        if len(out) >= topn:
            break
    return out


def mode_from_tonic(tonic, scale_pcs):
    """给主音 + 音阶音级集合，推调式名与级数。"""
    ivs = sorted(((p - tonic) % 12) for p in scale_pcs)
    return MODE_BY_DEG.get(ivs[1] if len(ivs) > 1 else 0, '?'), ivs


# ---------------------------------------------------------------- 和弦
CHORDS = {'': (0, 4, 7), 'm': (0, 3, 7), 'dim': (0, 3, 6), 'sus4': (0, 5, 7), '5': (0, 7, 12)}
CHORD_W = {0: 1.0, 4: 0.9, 3: 0.9, 7: 0.75, 5: 0.7, 6: 0.6, 12: 0.4}


def chord_fit(ch, bass, root_bonus=1.1, topn=3):
    ch = np.maximum(ch, 0); bn = np.maximum(bass, 0)
    chn = ch / (ch.sum() + 1e-9)
    bn = bn / (bn.sum() + 1e-9)
    cands = []
    for root in range(12):
        for q, iv in CHORDS.items():
            tones = set((root + k) % 12 for k in iv)
            inside = sum(chn[(root + k) % 12] * CHORD_W.get(k, 0.5) for k in iv)
            outside = 1.0 - sum(chn[t] for t in tones)
            sc = inside - 0.55 * outside + root_bonus * bn[root]
            cands.append((float(sc), NAMES[root] + ('' if q == '' else q), root, q))
    cands.sort(reverse=True)
    out = []
    for sc, nm, root, q in cands:
        if all(nm != o[1] for o in out):
            out.append((round(sc, 4), nm, root, q))
        if len(out) >= topn:
            break
    return out


def roman(name, tonic_pc):
    q = ''
    for suf in ('sus4', 'dim', 'm', '5', ''):
        if suf and name.endswith(suf):
            q = suf; break
    rootname = name[:-len(q)] if q else name
    if rootname not in NAMES:
        return '?'
    deg = CHROM_DEG.get((NAMES.index(rootname) - tonic_pc) % 12, '?')
    if q in ('m',):
        deg = deg.lower()
    if q == 'dim':
        deg = deg.lower() + '°'
    if q == 'sus4':
        deg += 'sus4'
    if q == '5':
        deg += '5'
    return deg


# ---------------------------------------------------------------- 小节
def bar_tables(x, sr, ch_frames, bass_frames, ch_fps, bnote, bstr, bfps, flux, fps, bpm, off):
    beat = 60.0 / bpm
    bar = 4 * beat
    dur = len(x) / sr
    t_ch = np.arange(ch_frames.shape[0]) / ch_fps
    t_b = np.arange(len(bnote)) / bfps
    bars = []
    b = 0
    while off + (b + 1) * bar <= dur:
        t0 = off + b * bar
        t1 = t0 + bar
        m = (t_ch >= t0) & (t_ch < t1)
        if m.sum() == 0:
            break
        ch = np.median(ch_frames[m], axis=0)
        bs = np.median(bass_frames[m], axis=0)
        # 低音根音：逐帧音高直方图（按强度加权）
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
        seg = x[int(t0 * sr):int(t1 * sr)]
        rms = float(np.sqrt((seg ** 2).mean() + 1e-12))
        L = min(len(seg), 32768)
        X = np.abs(np.fft.rfft(seg[:L] * np.hanning(L))) ** 2
        f = np.fft.rfftfreq(L, 1.0 / sr)
        tot = X.sum() + 1e-12
        low = float(X[(f >= 30) & (f < 120)].sum() / tot)
        mid = float(X[(f >= 120) & (f < 500)].sum() / tot)
        midh = float(X[(f >= 500) & (f < 2500)].sum() / tot)
        high = float(X[(f >= 2500) & (f < 8000)].sum() / tot)
        air = float(X[f >= 8000].sum() / tot)
        cen = float((f * X).sum() / tot)
        fr0 = max(0, int(t0 * fps)); fr1 = min(len(flux) - 1, int(t1 * fps))
        kc = _peaks(flux[fr0:fr1, 0]); sc = _peaks(flux[fr0:fr1, 1] + flux[fr0:fr1, 2])
        hc = _peaks(flux[fr0:fr1, 3] + flux[fr0:fr1, 4])
        cands = chord_fit(ch, bs)
        bars.append(dict(
            i=b, t0=round(t0, 3), t1=round(t1, 3), rms=rms,
            low=low, mid=mid, midh=midh, high=high, air=air, cen=cen,
            chroma=[round(float(v), 4) for v in ch],
            bass=[round(float(v), 4) for v in bs],
            bass_pc=int(np.argmax(bpc_hist)) if bpc_hist.sum() else -1,
            bass_note=bnote_mode,
            chord=cands[0][1], chord_margin=round(cands[0][0] - cands[1][0], 4),
            chord2=cands[1][1], chord3=cands[2][1],
            kick=kc, snare=sc, hat=hc,
            density=round(_peaks(flux[fr0:fr1].sum(1)) / bar, 2)))
        b += 1
    return bars


def _peaks(env, k=2.2):
    env = np.asarray(env, np.float32)
    if len(env) < 3 or env.max() <= 0:
        return 0
    thr = env.mean() + k * env.std()
    idx = np.where((env[1:-1] > env[:-2]) & (env[1:-1] >= env[2:]) & (env[1:-1] > thr))[0] + 1
    keep = []
    for i in idx:
        if not keep or i - keep[-1] >= 15:  # 最小间隔 ≈90ms
            keep.append(i)
    return len(keep)


# ---------------------------------------------------------------- 段落
def section_novelty(bars, win=4, thr=0.018):
    F = []
    for b in bars:
        v = np.array(b['chroma'] + [b['low'], b['mid'], b['midh'], b['high'],
                                    min(b['density'] / 10.0, 1.0)], float)
        v = v / (np.linalg.norm(v) + 1e-9)
        F.append(v)
    F = np.array(F)
    nov = np.zeros(len(F))
    for i in range(win, len(F) - win):
        a = F[i - win:i].mean(0); b = F[i:i + win].mean(0)
        cos = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        nov[i] = 1 - cos
    peaks = []
    for i in range(win, len(F) - win):
        if nov[i] > thr and nov[i] >= nov[i - 1] and nov[i] > nov[i + 1]:
            if not peaks or i - peaks[-1][0] >= 4:
                peaks.append((i, round(float(nov[i]), 4)))
    return nov, peaks


# ---------------------------------------------------------------- 旋律
def melody_track(x, sr, n_fft=2048, hop=512, lo=500, hi=3500):
    """500-3500Hz 谱峰跟踪，返回 (midi_float, 强度, fps)。用于轮廓/密度统计。"""
    win = np.hanning(n_fft).astype(np.float32)
    fr = _frames(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    seg = (freqs >= lo) & (freqs < hi)
    idxs = np.where(seg)[0]
    n = fr.shape[0]
    out = np.zeros(n, np.float32); stg = np.zeros(n, np.float32)
    for i in range(0, n, 256):
        m = np.abs(np.fft.rfft(fr[i:i + 256] * win, axis=1)).astype(np.float32)[:, idxs]
        j = np.argmax(m, axis=1)
        out[i:i + m.shape[0]] = 69 + 12 * np.log2(np.maximum(freqs[idxs][j], 1e-9) / 440.0)
        stg[i:i + m.shape[0]] = m[np.arange(m.shape[0]), j]
    return out, stg, sr / hop


def melody_stats(mt, ms, fps):
    ok = ms > np.percentile(ms, 45)
    seq = mt[ok]
    if len(seq) < 40:
        return {}
    # 5 帧中值平滑
    k = np.median(np.lib.stride_tricks.sliding_window_view(seq, 5), axis=1)[::4]
    sm = np.round(k).astype(int)
    chg = np.where(np.diff(sm) != 0)[0]
    # 只保留 >60ms 的音（避免颤音碎帧）
    if len(chg) < 5:
        return {}
    durs = np.diff(chg) / (fps / 4)
    notes = sm[chg]
    d = np.diff(notes)
    ad = np.abs(d)
    ad = ad[ad <= 12]
    return dict(notes_per_s=round(float(len(chg) / (len(seq) / fps)), 2),
                median_note_ms=round(float(np.median(durs) * 1000), 0),
                step_ratio=round(float((ad <= 2).mean()), 3),
                leap_ratio=round(float((ad >= 5).mean()), 3),
                mean_interval=round(float(ad.mean()), 2),
                pct_up=round(float((d > 0).mean()), 3),
                range_semitones=int(np.percentile(notes, 95) - np.percentile(notes, 5)))


# ---------------------------------------------------------------- 汇总
def analyze(path, verbose=True):
    x, sr = load_mono(path)
    dur = len(x) / sr
    energy, flux, fps, bands = percussive(x, sr)
    tot_flux = flux.sum(1)
    cands, conf = estimate_tempo(tot_flux, fps)
    drum_flux = flux[:, 0] + flux[:, 1] + 0.5 * flux[:, 3]
    cands2, conf2 = estimate_tempo(drum_flux, fps)
    bpm = cands[0][1]
    off, bar, fof, kk, ss, cc = beat_phase(flux, fps, bpm)
    ch_out, ch_fps = chroma_frames(x, sr)
    ch_frames, bass_frames = ch_out
    bnote, bstr, bfps = bass_track(x, sr)
    e = ch_frames.sum(1)
    sel = e > np.percentile(e, 35)
    cg = np.median(ch_frames[sel], axis=0)
    # 低音直方图（整曲）
    bh = np.zeros(12)
    for p, w in zip(bnote % 12, bstr):
        bh[p] += w
    bh = bh / (bh.sum() + 1e-9)
    keys = key_of(cg)
    bars = bar_tables(x, sr, ch_frames, bass_frames, ch_fps, bnote, bstr, bfps,
                      flux, fps, bpm, off)
    nov, peaks = section_novelty(bars)
    mt, ms, mfps = melody_track(x, sr)
    mel = melody_stats(mt, ms, mfps)
    out = dict(name=path.replace('\\', '/').split('/')[-1], dur=round(dur, 2), sr=sr,
               bpm=round(bpm, 1), bpm_conf=round(conf, 3),
               bpm_cands=[(round(b, 2), round(float(s), 3)) for s, b in cands],
               bpm_cands_drum=[(round(b, 2), round(float(s), 3)) for s, b in cands2],
               bar_sec=round(bar, 3), beat_offset=round(off, 3),
               four_on_floor=round(fof, 3),
               beat_energy=dict(kick=[round(float(v), 1) for v in kk],
                                snare=[round(float(v), 1) for v in ss],
                                all=[round(float(v), 1) for v in cc]),
               key=[(float(r), n, m, ivs) for r, n, m, ivs in keys],
               chroma=[round(float(v), 3) for v in cg],
               bass_hist=[round(float(v), 3) for v in bh],
               bars=bars, novelty=[round(float(v), 4) for v in nov],
               novelty_peaks=peaks, melody=mel, bands=bands)
    if verbose:
        print('=== %s  %.1fs  BPM %.1f (conf %.2f)  bar %.3fs  offset %.3fs  bars %d'
              % (out['name'], dur, bpm, conf, bar, off, len(bars)))
        print('   候选:', out['bpm_cands'])
        print('   鼓通道:', out['bpm_cands_drum'])
        print('   四踩 %.2f  kick%s snare%s' % (fof, out['beat_energy']['kick'],
                                                out['beat_energy']['snare']))
        print('   调性:', [(round(r, 3), n, m) for r, n, m, _ in keys[:4]])
        print('   低音直方:', [(NAMES[i], out['bass_hist'][i]) for i in np.argsort(out['bass_hist'])[::-1][:5]])
        print('   旋律:', mel)
        print('   段落峰:', peaks[:14])
    return out
