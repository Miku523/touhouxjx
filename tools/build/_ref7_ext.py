# -*- coding: utf-8 -*-
"""_ref7_ext.py —— 证据补充：简单三和弦、减和弦时刻、小二度/三全音重灾区、细粒度静音、
和弦歧义度、每段鼓率、每段拍号检验。输出 _ref7_ext.json。"""
import sys, os, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L5
import _ref7_lib as L7

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_ref7')
D = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))
SEC = json.load(open(os.path.join(HERE, '_ref7_sec.json'), encoding='utf-8'))
NAMES = L5.NAMES
TRI = {'': (0, 4, 7, 1.0), 'm': (0, 3, 7, 1.0), 'dim': (0, 3, 6, 0.9),
       'sus4': (0, 5, 7, 0.75), '5': (0, 7, 12, 0.6)}


def simple_chord(ch, bs, root_bonus=1.25):
    ch = np.maximum(ch, 0); bs = np.maximum(bs, 0)
    ch = ch / (ch.sum() + 1e-9); bs = bs / (bs.sum() + 1e-9)
    cands = []
    for root in range(12):
        for q, ivs in TRI.items():
            tones = set((root + k) % 12 for k in ivs[:-1])
            inside = sum(ch[(root + k) % 12] * (1.0 if k in (0, 3, 4) else 0.85) for k in ivs[:-1])
            outside = 1.0 - sum(ch[t] for t in tones)
            cands.append((inside - 0.55 * outside + root_bonus * bs[root], NAMES[root] + q, root, q))
    cands.sort(key=lambda z: -z[0])
    return cands


SIMPLE_SET = {NAMES[r] + q for r in range(12) for q in ('', 'm', 'dim', 'sus4', '5')}


def pick_simple(cands):
    for c in cands:
        if c in SIMPLE_SET:
            return c
    return cands[0] if cands else '-'


def m2_tt(ch):
    ch = np.maximum(ch, 0) / (np.maximum(ch, 0).sum() + 1e-9)
    m2 = sum(np.sqrt(ch[(p) % 12] * ch[(p + 1) % 12]) for p in range(12))
    tt = sum(np.sqrt(ch[(p) % 12] * ch[(p + 6) % 12]) for p in range(12))
    return float(m2), float(tt)


def fine_silence(x, sr, hop=0.01, drop=10.0, minlen=0.06):
    n = int(hop * sr)
    m = (len(x) // n) * n
    r = np.sqrt((x[:m].reshape(-1, n) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(r + 1e-9)
    med = float(np.median(db))
    thr = med - drop
    out = []
    i, N = 0, len(db)
    while i < N:
        if db[i] < thr:
            j = i
            while j + 1 < N and db[j + 1] < thr:
                j += 1
            if (j - i + 1) * hop >= minlen:
                pre = float(np.max(db[max(0, i - 80):i + 1])) if i > 0 else med
                out.append(dict(t0=round(i * hop, 2), t1=round((j + 1) * hop, 2),
                                dur=round((j - i + 1) * hop, 2),
                                drop_db=round(pre - float(np.mean(db[i:j + 1])), 1)))
            i = j + 1
        else:
            i += 1
    return out


for nm in (sys.argv[1:] or list(D)):
    d = D[nm]
    bars = d['bars']
    x, sr = L5.load_mono(os.path.join(SRC, nm + '.mp3'))
    rec = dict()
    # 简单三和弦（小节级 + 半小节）
    simp = []
    m2s, tts = [], []
    for b in bars:
        c = simple_chord(np.array(b['chroma']), np.array(b['bass_chroma']))
        simp.append(dict(i=b['i'], t0=round(b['t0'], 2), chord=c[0][1], chord2=c[1][1],
                         margin=round(c[0][0] - c[1][0], 3), bass_pc=b['bass_pc'],
                         bnote=b['bass_note'],
                         halves=[dict(t=q['t'], chord=pick_simple(q['cands']),
                                      margin=q['margin'], bass_pc=q['bass_pc'])
                                 for q in b['halves']]))
        a, c2 = m2_tt(b['chroma'])
        m2s.append(a); tts.append(c2)
    rec['simple'] = simp
    # 音级集合
    tot = np.sum([b['chroma'] for b in bars], 0)
    rec['pitch_classes'] = [round(float(v), 3) for v in tot / tot.sum()]
    # 减和弦 / 增和弦 / 半音邻接根音小节
    dimts = [(round(b['t0'], 2), b['chord'], simp[k]['chord']) for k, b in enumerate(bars)
             if 'dim' in (b['chord'] or '')]
    rec['dim_bars'] = dimts
    # 根音半音邻接（段落内相邻小节根音差 1）
    chrom_roots = []
    for k in range(1, len(simp)):
        d1 = (simp[k]['bass_pc'] - simp[k - 1]['bass_pc']) % 12
        if d1 in (1, 11) and simp[k]['bass_pc'] >= 0:
            chrom_roots.append(round(simp[k]['t0'], 2))
    rec['semitone_root_steps'] = len(chrom_roots)
    rec['semitone_root_times'] = chrom_roots[:30]
    # 小二度/三全音重灾区（bar 级）
    m2 = np.array(m2s); tt = np.array(tts)
    order_m2 = np.argsort(-m2)[:8]
    order_tt = np.argsort(-tt)[:8]
    rec['m2_mean'] = round(float(m2.mean()), 4)
    rec['tt_mean'] = round(float(tt.mean()), 4)
    rec['m2_top'] = [dict(bar=int(i), t=round(bars[i]['t0'], 2), v=round(float(m2[i]), 3),
                          chord=bars[i]['chord']) for i in order_m2]
    rec['tt_top'] = [dict(bar=int(i), t=round(bars[i]['t0'], 2), v=round(float(tt[i]), 3),
                          chord=bars[i]['chord']) for i in order_tt]
    # 和弦歧义度
    marg = np.array([s['margin'] for s in simp])
    rec['chord_margin_median'] = round(float(np.median(marg)), 3)
    rec['ambiguous_frac'] = round(float((marg < 0.05).mean()), 2)
    # 细粒度静音
    rec['fine_silences'] = fine_silence(x, sr)
    # 电平 / 削波 / 亮度
    peak = float(np.max(np.abs(x)))
    rms = float(np.sqrt((x ** 2).mean()))
    rec['peak'] = round(peak, 3)
    rec['rms_dbfs'] = round(20 * np.log10(rms + 1e-9), 1)
    rec['clip_frac'] = round(float((np.abs(x) > 0.999).mean() * 100), 2)
    cenv = [b['cen'] for b in bars]
    rec['cen_median'] = round(float(np.median(cenv)), 0)
    rec['cen_min'] = round(float(np.min(cenv)), 0)
    rec['cen_max'] = round(float(np.max(cenv)), 0)
    rec['air_median'] = round(float(np.median([b['air'] for b in bars])), 3)
    rec['low_median'] = round(float(np.median([b['low'] for b in bars])), 3)
    rec['high_median'] = round(float(np.median([b['high'] for b in bars])), 3)
    # 每段：鼓率 + 拍号 + 频谱
    _, flux, fps, _ = L5.percussive(x, sr)
    t, w, _ = L7.extract_onsets(flux, fps, k=1.25, gap=0.028)
    secs = []
    bpm = d['bpm']
    for s in SEC[nm]['sections']:
        a, b = s['bar0'], s['bar1']
        kk = SEC[nm]['drums']['kick']['count_series'][a:b]
        sn = SEC[nm]['drums']['snare']['count_series'][a:b]
        ht = SEC[nm]['drums']['hat']['count_series'][a:b]
        msk = (t >= s['t0']) & (t < s['t1'])
        mm = {}
        if msk.sum() > 40:
            mm = {str(k): round(float(v), 4) for k, v in L7.meter_check(t[msk], w[msk], bpm).items()}
        seg = bars[a:b]
        secs.append(dict(name='', bar0=a, bar1=b, t0=s['t0'], t1=s['t1'], dur=s['dur'],
                         rms_db=s['rms_db'], density=s['density'], cen=s['cen'],
                         low=round(float(np.median([z['low'] for z in seg])), 3),
                         high=round(float(np.median([z['high'] for z in seg])), 3),
                         air=round(float(np.median([z['air'] for z in seg])), 3),
                         den=round(float(np.median([z['density'] for z in seg])), 2),
                         kick_pb=round(float(np.mean(kk)), 2) if len(kk) else 0,
                         snare_pb=round(float(np.mean(sn)), 2) if len(sn) else 0,
                         hat_pb=round(float(np.mean(ht)), 2) if len(ht) else 0,
                         kick_total=int(np.sum(kk)), snare_total=int(np.sum(sn)),
                         meter=mm, chord_hist=s['chords'][:8],
                         simple_hist=[(c, n) for c, n in sorted(
                             {c: sum(1 for z in simp[a:b] if z['chord'] == c)
                              for c in set(z['chord'] for z in simp[a:b])}.items(),
                             key=lambda kv: -kv[1])[:8]]))
    rec['sections'] = secs
    rec['tempo_local_range'] = [round(min(v[1] for v in d['local_tempos']), 2),
                                round(max(v[1] for v in d['local_tempos']), 2)]
    rec['metre_global'] = {str(k): round(float(v), 4) for k, v in d['meter_scores'].items()}
    json.dump(rec, open(os.path.join(HERE, '_ref7_ext_%s.json' % nm), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('=' * 100)
    print('%s  peak %.2f  rms %.1f dBFS  削波 %.2f%%  cen %d(%d-%d)  air %.3f low %.3f high %.3f' % (
        nm, rec['peak'], rec['rms_dbfs'], rec['clip_frac'], rec['cen_median'],
        rec['cen_min'], rec['cen_max'], rec['air_median'], rec['low_median'], rec['high_median']))
    print('  音级: %s' % ' '.join('%s%.3f' % (NAMES[i], v) for i, v in enumerate(rec['pitch_classes'])))
    print('  简单和弦直方: %s' % sorted({c: sum(1 for z in simp if z['chord'] == c) for c in set(z['chord'] for z in simp)}.items(), key=lambda kv: -kv[1])[:10])
    print('  减和弦 %d 小节: %s' % (len(dimts), dimts[:10]))
    print('  根音半音相邻 %d 次, 前 12: %s' % (rec['semitone_root_steps'], rec['semitone_root_times'][:12]))
    print('  m2 均值 %.4f  tt 均值 %.4f  m2_top %s' % (rec['m2_mean'], rec['tt_mean'],
          [(z['bar'], z['t'], z['chord']) for z in rec['m2_top'][:5]]))
    print('  歧义度 中位 %.3f  <0.05 占比 %.2f' % (rec['chord_margin_median'], rec['ambiguous_frac']))
    print('  细静音 %d 段: %s' % (len(rec['fine_silences']), rec['fine_silences'][:10]))
    print('  局部速度 %.2f-%.2f  拍号 %s' % (rec['tempo_local_range'][0], rec['tempo_local_range'][1], rec['metre_global']))
    for s in secs:
        print('   [%3d-%3d] %6.1f-%6.1f s  rms %5.1f den %4.2f k%.1f s%.1f h%.1f meter %s  和弦 %s' % (
            s['bar0'], s['bar1'], s['t0'], s['t1'], s['rms_db'], s['density'],
            s['kick_pb'], s['snare_pb'], s['hat_pb'], s['meter'],
            ' '.join('%s×%d' % (c, n) for c, n in s['simple_hist'][:6])))
print('已写 _ref7_ext_*.json')
