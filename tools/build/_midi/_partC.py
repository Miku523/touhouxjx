# ---------------------------------------------------------------- 角色判定（数据驱动）
def tv_stats(notes):
    """最高声线（每个 onset 取最高音）的统计。"""
    tv = melody_line(notes)
    tw = sum(x['d'] for x in tv) or 1.0
    return dict(tv=tv, mean=sum(x['m'] * x['d'] for x in tv) / tw,
                lo=min(x['m'] for x in tv), hi=max(x['m'] for x in tv), n=len(tv))


def offset_profile(st, top=3):
    return sorted(st['diff_hist'].items(), key=lambda kv: -kv[1])[:top]


def classify_base(m, t, rel, bass_anchor, ratio):
    if m['density'] >= 3.5 and m['avg_dur'] <= 0.30:
        tag = '低音快速分解（琶音型低音）' if t['mean'] <= bass_anchor + 6 else '快速分解/装饰音型'
        return 'arp', '密度 %.2f 音/秒、平均时值 %.3fs -> %s' % (m['density'], m['avg_dur'], tag)
    if t['mean'] <= bass_anchor + 4:
        return 'bass', '最高声线加权均值 %.1f（全曲最低层 %.1f 附近）-> 低音声部' % (t['mean'], bass_anchor)
    if m['avg_dur'] >= 0.9 and m['density'] <= 3.0:
        return 'pad', '平均时值 %.3fs、密度 %.2f 音/秒 -> 长音铺底' % (m['avg_dur'], m['density'])
    if rel <= -3:
        return 'harmony', '最高声线均值 %.1f 低于主旋律 %.1f（%+.1f 半音）-> 中音区和声层' % (t['mean'], t['mean'] - rel, rel)
    if ratio >= 0.15:
        return 'lead_alt', '最高声线持有率 %.2f -> 副旋律/高层对位' % ratio
    return 'counter', '最高声线均值 %.1f（相对主旋律 %+.1f 半音）、持有率 %.2f -> 对位声部' % (t['mean'], rel, ratio)


def assign_roles(chans, metrics, drum_ch, melody_ch, pairs, tl_ratio, duration, mel_scores):
    """给每个通道命名角色；每个判定都带数字依据（写进 role_evidence）。"""
    roles, evid = {}, {}
    tv = {}
    for ch, c in chans.items():
        if c['notes'] and ch not in drum_ch:
            tv[ch] = tv_stats(c['notes'])
    mel_mean = tv[melody_ch]['mean']
    bass_anchor = min(v['mean'] for v in tv.values()) if tv else 0.0

    # --- 同音 / 八度关系
    ident, octrel = {}, {}
    for a in sorted(chans):
        if a in drum_ch or a not in tv:
            continue
        for b in sorted(chans):
            if b <= a or b in drum_ch or b not in tv:
                continue
            st = pairs[(a, b)]
            if st['aligned_onsets'] < 8:
                continue
            hist = st['diff_hist']
            tot = sum(hist.values()) or 1
            if st['same_pitch_rate'] >= 0.85:
                ident[(a, b)] = st
            off12 = (hist.get('12', 0) + hist.get('-12', 0)) / tot
            if off12 >= 0.55:
                octrel[(a, b)] = (off12, st)

    ident_of, oct_of = {}, {}
    for (a, b), st in ident.items():
        if a == melody_ch:
            ident_of[b] = (a, st)
        elif b == melody_ch:
            ident_of[a] = (b, st)
        else:
            ident_of.setdefault(a, (b, st))
            ident_of.setdefault(b, (a, st))
    for (a, b), (rate, st) in octrel.items():
        if a == melody_ch:
            oct_of[b] = (a, rate, st)
        elif b == melody_ch:
            oct_of[a] = (b, rate, st)
        else:
            oct_of.setdefault(a, (b, rate, st))
            oct_of.setdefault(b, (a, rate, st))

    # --- 基础角色
    base = {}
    for ch in sorted(chans):
        m = metrics.get(ch)
        if m is None or m['count'] == 0:
            base[ch] = 'empty'
            evid[ch] = ['通道无音符']
            continue
        if ch in drum_ch:
            base[ch] = 'drums'
            evid[ch] = list(m['drum_reason'])
            continue
        t = tv[ch]
        rel = t['mean'] - mel_mean
        ratio = tl_ratio.get(ch, 0.0)
        ev = []
        stm = pairs.get((ch, melody_ch)) or pairs.get((melody_ch, ch))
        if stm and stm['aligned_onsets'] >= 8:
            ev.append('与主旋律 ch%d 顶层音高关系（对齐 %d onset）：%s' % (
                melody_ch, stm['aligned_onsets'],
                '，'.join('%+d 半音 ×%d' % (int(k), v) for k, v in offset_profile(stm, 3))))
        if ch == melody_ch:
            base[ch] = 'lead'
            ev.append('主旋律通道：最高声线持有率 %.3f × 时间跨度占比 %.3f = %.4f（候选中最高）'
                      % (ratio, metrics[ch]['span_sec'] / max(duration, 1e-9), mel_scores.get(ch, 0.0)))
            evid[ch] = ev
            continue
        b, why = classify_base(m, t, rel, bass_anchor, ratio)
        base[ch] = b
        ev.append(why)
        evid[ch] = ev
    roles = dict(base)

    # --- 同音双轨（在 base 之上标注，标签只加一次）
    for ch, (partner, st) in sorted(ident_of.items()):
        if ch == melody_ch:
            continue
        pb = base.get(partner, 'counter')
        roles[ch] = pb + '_double'
        evid[ch].append('与 ch%d 音符完全一致：%d/%d 个对齐 onset 音高相同（same_pitch_rate=%.2f）'
                        % (partner, st['same_pitch'], st['aligned_onsets'], st['same_pitch_rate']))

    # --- 八度关系
    for ch, (partner, rate, st) in sorted(oct_of.items()):
        if partner == melody_ch and roles.get(ch) != 'lead_double':
            roles[ch] = 'lead_octave'
            evid[ch].append('与主旋律 ch%d 相差 12 半音（八度）：对齐 %d onset 中 %d 次命中（%.2f）'
                            % (partner, st['aligned_onsets'], int(rate * st['aligned_onsets']), rate))
        elif roles.get(ch) != 'lead_double':
            evid[ch].append('与 ch%d 有八度关系（相差 12 半音，对齐 %d onset 中 %d 次命中，%.2f）'
                            % (partner, st['aligned_onsets'], int(rate * st['aligned_onsets']), rate))

    # --- 相对主旋律的八度（要求 >=0.55 命中，避免 40% 的偶然同度被当成八度叠录）
    for ch in sorted(chans):
        if ch == melody_ch or ch in drum_ch or ch not in tv:
            continue
        if roles.get(ch) in ('lead_double', 'lead_octave'):
            continue
        stm = pairs.get((ch, melody_ch)) or pairs.get((melody_ch, ch))
        if not stm or stm['aligned_onsets'] < 8:
            continue
        prof = [kv for kv in offset_profile(stm, 5) if int(kv[0]) != 0]
        if not prof:
            continue
        off, cnt = int(prof[0][0]), prof[0][1]
        rate = cnt / stm['aligned_onsets']
        if abs(off) in (12, 24) and rate >= 0.55:
            roles[ch] = 'lead_octave'
            evid[ch].append('与主旋律 ch%d 相差 %d 半音（%d 个八度）：对齐 %d onset 中 %d 次命中（%.2f）'
                            % (melody_ch, off, int(abs(off) / 12), stm['aligned_onsets'], cnt, rate))
    return roles, evid


# ---------------------------------------------------------------- 段落切分
def detect_segments(chans, drum_ch, melody_ch, bars, duration, step=0.5):
    """边界 = (a) 主旋律停顿 > 1.2s；(b) 织体能量分布 L1 突变 >= 0.45；之后吸附到最近小节线。"""
    nc = int(duration / step) + 2
    act = collections.defaultdict(lambda: [0.0] * nc)
    for ch, c in chans.items():
        for n in c['notes']:
            i = int(n['t'] / step)
            if 0 <= i < nc:
                act[ch][i] += 1.0
    chl = sorted(act.keys())
    win = max(1, int(2.0 / step))
    cand = []
    for i in range(win, nc - win):
        t = i * step
        if t < 1.0 or t > duration - 1.0:
            continue
        sb = sum(sum(act[c][i - win:i]) for c in chl) or 1.0
        sa = sum(sum(act[c][i:i + win]) for c in chl) or 1.0
        b = [sum(act[c][i - win:i]) / sb for c in chl]
        a = [sum(act[c][i:i + win]) / sa for c in chl]
        d = sum(abs(x - y) for x, y in zip(b, a))
        cand.append((d, t))
    cand.sort(reverse=True)
    picked = []
    for d, t in cand:
        if d < 0.45:
            break
        if all(abs(t - p[1]) >= 3.0 for p in picked):
            picked.append((d, t))
        if len(picked) >= 16:
            break

    bounds = []
    mel_onsets = sorted(n['t'] for n in chans[melody_ch]['notes'])
    for i in range(1, len(mel_onsets)):
        gap = mel_onsets[i] - mel_onsets[i - 1]
        if gap > 1.2:
            bounds.append((mel_onsets[i - 1] + gap / 2.0, 'melody_gap %.2fs' % gap))
    for d, t in picked:
        bounds.append((t, 'texture_change L1=%.2f' % d))
    bounds.sort()
    merged = []
    for t, why in bounds:
        if merged and t - merged[-1][0] < 1.0:
            continue
        merged.append((t, why))

    bar_starts = [b['start_sec'] for b in bars]

    def snap(t):
        best, bd = t, 1e9
        for bs in bar_starts:
            if abs(bs - t) < bd:
                best, bd = bs, abs(bs - t)
        return best if bd <= 0.4 else t

    edges = [(0.0, 'start')]
    for t, why in merged:
        s = snap(t)
        if s - edges[-1][0] > 0.8:
            edges.append((s, why))
    if duration - edges[-1][0] > 0.8:
        edges.append((round(duration, 3), 'end'))

    segs = []
    for i in range(len(edges) - 1):
        t0, t1 = edges[i][0], edges[i + 1][0]
        bar0 = next((b['bar'] for b in reversed(bars) if b['start_sec'] <= t0 + 1e-6), 0)
        bar1 = next((b['bar'] for b in reversed(bars) if b['start_sec'] <= t1 + 1e-6), 0)
        per_ch = {}
        for ch, c in chans.items():
            k = sum(1 for n in c['notes'] if t0 <= n['t'] < t1)
            if k:
                per_ch[ch] = k
        mel = [n for n in chans[melody_ch]['notes'] if t0 <= n['t'] < t1]
        dr = sum(1 for ch in drum_ch for n in chans[ch]['notes'] if t0 <= n['t'] < t1)
        tot = sum(per_ch.values())
        segs.append(dict(
            index=i, start_sec=round(t0, 3), end_sec=round(t1, 3),
            start_bar=bar0, end_bar=bar1, bars=bar1 - bar0,
            dur_sec=round(t1 - t0, 3),
            total_onsets=tot, onset_rate=round(tot / max(t1 - t0, 1e-6), 2),
            melody_onsets=len(mel),
            melody_rate=round(len(mel) / max(t1 - t0, 1e-6), 2),
            melody_avg_dur=round(sum(n['d'] for n in mel) / max(len(mel), 1), 3),
            melody_pitch_min=min([n['m'] for n in mel]) if mel else None,
            melody_pitch_max=max([n['m'] for n in mel]) if mel else None,
            drum_onsets=dr, drum_rate=round(dr / max(t1 - t0, 1e-6), 2),
            active_channels=sorted(per_ch), n_active=len(per_ch),
            notes_by_channel=dict((str(k), v) for k, v in sorted(per_ch.items())),
            boundary_reason=edges[i + 1][1],
        ))
    return segs


def label_segments(segments, line_by_seg, grams):
    """按上文口径给段落贴结构标签（数据驱动）。"""
    dens = [s['onset_rate'] for s in segments if s['melody_onsets'] > 0]
    med = sorted(dens)[len(dens) // 2] if dens else 0.0
    for i, s in enumerate(segments):
        best_j, best_k = 0.0, None
        for j in range(i):
            jj = jacc(grams[i], grams[j])
            if jj > best_j:
                best_j, best_k = jj, j
        s['motif_jaccard_vs_prev_best'] = round(best_j, 3)
        s['motif_repeat_of_segment'] = best_k
        if s['melody_onsets'] == 0:
            s['label'] = 'interlude'
            s['label_reason'] = '主旋律通道在此段 0 个音符'
        elif s['melody_avg_dur'] <= 0.22 and s['melody_onsets'] >= 20:
            s['label'] = 'ostinato'
            s['label_reason'] = '主旋律平均时值 %.3fs、%d 音（快速反复音型）' % (s['melody_avg_dur'], s['melody_onsets'])
        elif med and s['onset_rate'] >= 1.5 * med:
            s['label'] = 'chorus'
            s['label_reason'] = '段落音符密度 %.2f/s ≥ 有旋律段中位数 %.2f 的 1.5 倍' % (s['onset_rate'], med)
        elif med and s['onset_rate'] <= 0.6 * med:
            s['label'] = 'verse'
            s['label_reason'] = '段落音符密度 %.2f/s ≤ 有旋律段中位数 %.2f 的 0.6 倍' % (s['onset_rate'], med)
        else:
            s['label'] = 'theme'
            s['label_reason'] = '段落音符密度 %.2f/s 接近有旋律段中位数 %.2f' % (s['onset_rate'], med)
        if best_j >= 0.35 and s['label'] in ('theme', 'verse', 'chorus', 'ostinato'):
            s['label'] = 'theme_recap'
            s['label_reason'] += '；与段落 #%d 动机 n-gram Jaccard=%.2f' % (best_k, best_j)
    if segments:
        if segments[0]['melody_onsets'] == 0:
            segments[0]['label'] = 'intro'
            segments[0]['label_reason'] = '首段且主旋律通道无音符（前奏）'
        last = segments[-1]
        if last['melody_onsets'] == 0 or (med and last['onset_rate'] < 0.6 * med):
            last['label'] = last['label'] + '+outro'
            last['label_reason'] += '；位于曲末'
    return segments


def global_top_voice(chans, drum_ch, quant=0.01):
    """所有非鼓通道叠在一起后的最高声线（真正在响的旋律线）。"""
    g = collections.defaultdict(list)
    for ch, c in chans.items():
        if ch in drum_ch:
            continue
        for n in c['notes']:
            g[round(n['t'] / quant)].append(n)
    out = []
    for k in sorted(g):
        v = max(g[k], key=lambda x: x['m'])
        out.append(dict(t=round(v['t'], 3), m=v['m'], d=round(v['d'], 3), v=v['v']))
    return out
