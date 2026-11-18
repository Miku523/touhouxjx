#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/build/_midi/analyze.py
只读分析 ZUN 原曲 MIDI（pre5 Till When? / stage5 Border of Life / 参考 Border of Life）。
产出：
  tools/build/_midi/an_tillwhen.json
  tools/build/_midi/an_border.json
  tools/build/_midi/an_border14.json
  tools/build/_midi/REPORT_MIDI.md

只读：不修改 src/ 下任何文件，不写 git。
运行：python tools/build/_midi/analyze.py
"""
import sys, os, json, math, collections, difflib

BASE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.abspath(os.path.join(BASE, '..', '..'))   # -> <repo>/tools
sys.path.insert(0, TOOLS)
import midi2js as M

SRC = os.path.join(BASE, 'src')
SONGS = [
    ('tillwhen', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid', 'an_tillwhen.json'),
    ('border13', '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid', 'an_border.json'),
    ('border14', '14. Border of Life (ZUN).mid', 'an_border14.json'),
]
PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
GM_DRUM_RANGE = set(range(35, 52))          # GM 打击乐音高区
TEMPLATES = [
    ('maj', [0, 4, 7]), ('min', [0, 3, 7]), ('dim', [0, 3, 6]), ('aug', [0, 4, 8]),
    ('sus2', [0, 2, 7]), ('sus4', [0, 5, 7]),
    ('maj7', [0, 4, 7, 11]), ('min7', [0, 3, 7, 10]), ('dom7', [0, 4, 7, 10]),
    ('m7b5', [0, 3, 6, 10]), ('dim7', [0, 3, 6, 9]),
    ('6', [0, 4, 7, 9]), ('m6', [0, 3, 7, 9]),
    ('7sus4', [0, 5, 7, 10]), ('add9', [0, 2, 4, 7]),
]
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


# ---------------------------------------------------------------- MIDI 元信息




def scan_meta(path):
    """扫描 MTrk 里的 time signature(0x58) / key signature(0x59) meta。"""
    with open(path, 'rb') as f:
        data = f.read()
    hlen = int.from_bytes(data[4:8], 'big')
    ntrk = int.from_bytes(data[10:12], 'big')
    pos = 8 + hlen
    ts, ks = [], []
    for _ in range(ntrk):
        if pos + 8 > len(data):
            break
        cid = data[pos:pos + 4]
        clen = int.from_bytes(data[pos + 4:pos + 8], 'big')
        tstart = pos + 8
        tend = min(len(data), tstart + clen)
        pos = tend
        if cid != b'MTrk':
            continue
        p, tick, running = tstart, 0, 0
        while p < tend:
            delta, p = M.read_varlen(data, p, tend)
            tick += delta
            if p >= tend:
                break
            status = data[p]
            if status & 0x80:
                p += 1
                if status < 0xF0:
                    running = status
            else:
                status = running
                if not status:
                    break
            if status == 0xFF:
                mt = data[p]; p += 1
                ln, p = M.read_varlen(data, p, tend)
                payload = data[p:p + ln]; p += ln
                if mt == 0x58 and len(payload) >= 2:
                    ts.append((tick, payload[0], 1 << payload[1]))
                elif mt == 0x59 and len(payload) >= 2:
                    ks.append((tick, payload[0], payload[1]))
            elif status in (0xF0, 0xF7):
                ln, p = M.read_varlen(data, p, tend); p += ln
            else:
                hi = status & 0xF0
                p += 1 if hi in (0xC0, 0xD0) else 2
    return ts, ks






def tempo_segments(segs):
    """把 midi2js 的 tempo 分段转成带起止秒/小节号的表。"""
    out = []
    for i, (tick, sec, uspq) in enumerate(segs):
        end = segs[i + 1][1] if i + 1 < len(segs) else None
        out.append(dict(tick=tick, start_sec=round(sec, 3),
                        end_sec=round(end, 3) if end is not None else None,
                        uspq=uspq, bpm=round(60e6 / uspq, 3)))
    return out






def bar_grid(segs, div, duration, beats_per_bar=4):
    """4/4 小节网格：每小节起止秒。"""
    bars = []
    n = 0
    while True:
        t0 = M.tick_to_sec(segs, div, n * beats_per_bar * div)
        t1 = M.tick_to_sec(segs, div, (n + 1) * beats_per_bar * div)
        if t0 > duration + 0.001:
            break
        seg = segs[-1]
        for s in segs:
            if s[1] <= t0 + 1e-6:
                seg = s
        bars.append(dict(bar=n, start_sec=round(t0, 3), end_sec=round(t1, 3),
                         sec_per_bar=round(t1 - t0, 3),
                         bpm=round(60e6 / seg[2], 2)))
        n += 1
    return bars


# ---------------------------------------------------------------- 通道统计




def chan_metrics(notes, span):
    if not notes:
        return dict(count=0)
    ps = sorted(n['m'] for n in notes)
    onsets = collections.defaultdict(int)
    for n in notes:
        onsets[round(n['t'], 3)] += 1
    durs = [n['d'] for n in notes]
    vels = [n['v'] for n in notes]
    return dict(
        count=len(notes),
        pitch_min=ps[0], pitch_max=ps[-1],
        pitch_median=ps[len(ps) // 2],
        pitch_mean=float(sum(n['m'] * n['d'] for n in notes) / max(sum(durs), 1e-9)),
        pitch_set=sorted(set(ps)),
        distinct_pitches=len(set(ps)),
        progs=dict(collections.Counter(n['p'] for n in notes)),
        avg_vel=round(sum(vels) / len(vels), 2),
        avg_dur=round(sum(durs) / len(durs), 4),
        min_dur=round(min(durs), 4), max_dur=round(max(durs), 4),
        total_dur=round(sum(durs), 3),
        start_sec=round(min(n['t'] for n in notes), 3),
        end_sec=round(max(n['t'] + n['d'] for n in notes), 3),
        span_sec=round(span, 3),
        density=round(len(notes) / max(span, 1e-9), 3),
        avg_simultaneity=round(sum(onsets.values()) / len(onsets), 3),
        distinct_onsets=len(onsets),
    )






def is_drum_chan(m, notes):
    """鼓组判定：音高几乎全在 GM 打击乐区 + 高密度 + 短时值。"""
    ps = set(n['m'] for n in notes)
    in_drum = sum(1 for p in ps if p in GM_DRUM_RANGE)
    reason = []
    if ps and in_drum / len(ps) >= 0.9:
        reason.append('音高集合 %d/%d 落在 GM 打击乐区 35-51' % (in_drum, len(ps)))
    if m['density'] >= 8:
        reason.append('密度 %.2f 音符/秒（极密）' % m['density'])
    if m['avg_dur'] <= 0.16:
        reason.append('平均时值 %.3fs（极短）' % m['avg_dur'])
    prog_max = max(m['progs']) if m['progs'] else 0
    if prog_max >= 115:
        reason.append('program=%d（>=115 打击乐）' % prog_max)
    ok = (ps and in_drum / len(ps) >= 0.9 and m['density'] >= 8) or prog_max >= 115
    return ok, reason






def top_line(chans, drum_ch, step=0.05):
    """最高声线归属：0.05s 栅格上每格的最高音属于谁。"""
    grid = collections.defaultdict(list)
    tmax = 0.0
    for ch, c in chans.items():
        if ch in drum_ch:
            continue
        for n in c['notes']:
            t0 = int(n['t'] / step)
            t1 = int((n['t'] + n['d']) / step)
            for i in range(t0, t1 + 1):
                grid[i].append((ch, n['m']))
            tmax = max(tmax, n['t'] + n['d'])
    own = collections.Counter()
    held = collections.Counter()
    for i, lst in grid.items():
        mx = max(p for _, p in lst)
        chs = set(c for c, p in lst if p == mx)
        for c in chs:
            held[c] += 1
    for ch, c in chans.items():
        if ch in drum_ch:
            continue
        own[ch] = sum(1 for i, lst in grid.items() if any(cc == ch for cc, _ in lst))
    ratio = {ch: round(held[ch] / own[ch], 4) for ch in own if own[ch]}
    abs_ratio = {ch: round(held[ch] / max(len(grid), 1), 4) for ch in own}
    return dict(ratio=ratio, abs_ratio=abs_ratio, cells=len(grid))






def unison_stats(chans, a, b):
    """两通道的单音重合率（按 onset 对齐，取各自该 onset 的最高音）。"""
    if a not in chans or b not in chans:
        return None
    def top(ch):
        g = collections.defaultdict(list)
        for n in chans[ch]['notes']:
            g[round(n['t'], 3)].append(n)
        return {t: max(x['m'] for x in v) for t, v in g.items()}
    A, B = top(a), top(b)
    common = sorted(set(A) & set(B))
    if not common:
        return dict(aligned_onsets=0, same_pitch=0, same_pitch_rate=0.0,
                    diff_hist={}, note_onset_overlap=0.0)
    diffs = collections.Counter(A[t] - B[t] for t in common)
    same = diffs.get(0, 0)
    # note-onset level overlap (any pitch)
    sa = set(round(n['t'], 3) for n in chans[a]['notes'])
    sb = set(round(n['t'], 3) for n in chans[b]['notes'])
    ov = len(sa & sb) / max(len(sa | sb), 1)
    return dict(aligned_onsets=len(common), same_pitch=same,
                same_pitch_rate=round(same / len(common), 4),
                diff_hist={str(k): v for k, v in sorted(diffs.items(), key=lambda kv: -kv[1])[:10]},
                note_onset_overlap=round(ov, 4))






def melody_line(notes):
    """把一个通道按 onset 归并，取每 onset 的最高音 -> 单声部旋律线。"""
    g = collections.defaultdict(list)
    for n in notes:
        g[round(n['t'], 3)].append(n)
    out = []
    for t in sorted(g):
        v = g[t]
        mx = max(x['m'] for x in v)
        top = [x for x in v if x['m'] == mx]
        n = max(top, key=lambda x: x['d'])
        out.append(dict(t=round(n['t'], 3), m=n['m'], d=round(n['d'], 3), v=n['v']))
    return out


# ---------------------------------------------------------------- 段落切分




def motif_of(line):
    """旋律线的音程 n-gram 集合（用于判断段落重复）。"""
    if len(line) < 4:
        return set()
    seq = [line[i + 1]['m'] - line[i]['m'] for i in range(len(line) - 1)]
    grams = set()
    for L in (3, 4, 5):
        for i in range(len(seq) - L + 1):
            grams.add(tuple(seq[i:i + L]))
    return grams






def jacc(a, b):
    if not a or not b:
        return 0.0
    return round(len(a & b) / len(a | b), 3)


# ---------------------------------------------------------------- 和声




def harmony_by_bar(chans, roles, drum_ch, bars, weight_by_role):
    out = []
    for b in bars:
        notes = []
        for ch, c in chans.items():
            if ch in drum_ch:
                continue
            w = weight_by_role.get(roles.get(ch, 'counter'), 0.4)
            for n in c['notes']:
                if b['start_sec'] <= n['t'] < b['end_sec']:
                    notes.append((n['m'], w * (0.5 + n['d']), ch, n['d']))
        if not notes:
            out.append(dict(bar=b['bar'], start_sec=b['start_sec'], end_sec=b['end_sec'],
                            chord=None, confidence=0.0, bass_pitch=None,
                            pitches=[], channels=[]))
            continue
        bass = min(notes, key=lambda x: x[0])
        best = None
        for root in range(12):
            for qname, iv in TEMPLATES:
                tpl = set((root + i) % 12 for i in iv)
                score = 0.0
                total = 0.0
                for p, w, ch, d in notes:
                    total += w
                    if p % 12 in tpl:
                        score += w
                    else:
                        score -= 0.9 * w
                if bass[0] % 12 == root:
                    score += 0.35 * bass[1]
                elif bass[0] % 12 not in tpl:
                    score -= 0.35 * bass[1]
                if best is None or score > best[0]:
                    best = (score, root, qname, tpl, total)
        score, root, qname, tpl, total = best
        conf = round(max(0.0, min(1.0, score / max(total, 1e-9))), 3)
        pcs = sorted(set(p % 12 for p, _, _, _ in notes))
        out.append(dict(
            bar=b['bar'], start_sec=b['start_sec'], end_sec=b['end_sec'],
            chord='%s%s' % (PC[root], qname),
            root_pc=root, root_name=PC[root], quality=qname,
            chord_tones=sorted(PC[(root + i) % 12] for i in sorted(
                [0] + [x for x in range(12) if x in tpl])),
            pcs=[PC[x] for x in pcs],
            bass_pitch=bass[0], bass_name='%s%d' % (PC[bass[0] % 12], bass[0] // 12 - 1),
            confidence=conf,
            channels=sorted(set(ch for _, _, ch, _ in notes)),
            note_count=len(notes),
        ))
    return out


# ---------------------------------------------------------------- 调性




def key_of(notes):
    if not notes:
        return None
    hist = [0.0] * 12
    for n in notes:
        hist[n['m'] % 12] += n['d']
    tot = sum(hist) or 1.0
    hist = [h / tot for h in hist]
    best = None
    for root in range(12):
        for name, prof in (('major', MAJOR_PROFILE), ('minor', MINOR_PROFILE)):
            p = [prof[(i - root) % 12] for i in range(12)]
            mp = sum(hist) / 12.0
            pp = sum(p) / 12.0
            num = sum((h - mp) * (q - pp) for h, q in zip(hist, p))
            den = math.sqrt(sum((h - mp) ** 2 for h in hist) * sum((q - pp) ** 2 for q in p))
            r = num / den if den else 0.0
            if best is None or r > best[0]:
                best = (r, root, name)
    return dict(key='%s %s' % (PC[best[1]], best[2]), root=PC[best[1]],
                mode=best[2], confidence=round(best[0], 3))






def tritone_scan(chans, drum_ch):
    hits = []
    for ch, c in chans.items():
        if ch in drum_ch:
            continue
        g = collections.defaultdict(list)
        for n in c['notes']:
            g[round(n['t'], 3)].append(n)
        for t, v in g.items():
            ps = sorted(set(x['m'] for x in v))
            for i in range(len(ps)):
                for j in range(i + 1, len(ps)):
                    if abs(ps[j] - ps[i]) % 12 == 6:
                        hits.append(dict(ch=ch, t=round(t, 3), pitches=[ps[i], ps[j]],
                                         semitones=ps[j] - ps[i]))
    # 旋律跳进中的三全音
    leaps = []
    for ch, c in chans.items():
        if ch in drum_ch:
            continue
        line = melody_line(c['notes'])
        for i in range(len(line) - 1):
            if abs(line[i + 1]['m'] - line[i]['m']) == 6:
                leaps.append(dict(ch=ch, t=line[i + 1]['t'],
                                  pitches=[line[i]['m'], line[i + 1]['m']]))
    return dict(simultaneous_tritones=hits[:40], simultaneous_tritone_count=len(hits),
                melodic_tritone_leaps=leaps[:40], melodic_tritone_leap_count=len(leaps))


# ---------------------------------------------------------------- 主流程

# ---------------------------------------------------------------- 角色判定（数据驱动）

# ---------------------------------------------------------------- 角色判定（数据驱动）

# ---------------------------------------------------------------- 角色判定（数据驱动）

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


# ---------------------------------------------------------------- 和弦级数
DEG = {0: ('', 'I', 'i'), 1: ('b', 'II', 'ii'), 2: ('', 'II', 'ii'), 3: ('b', 'III', 'III'),
       4: ('', 'III', 'iii'), 5: ('', 'IV', 'iv'), 6: ('b', 'V', 'v'), 7: ('', 'V', 'v'),
       8: ('b', 'VI', 'VI'), 9: ('', 'VI', 'vi'), 10: ('b', 'VII', 'VII'), 11: ('', 'VII', 'vii')}
QUAL_SUF = {'maj': '', 'min': 'm', 'dim': 'dim', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
            'maj7': 'maj7', 'min7': 'm7', 'dom7': '7', 'm7b5': 'm7b5', 'dim7': 'dim7',
            '6': '6', 'm6': 'm6', '7sus4': '7sus4', 'add9': 'add9'}
MINORISH = set(['min', 'min7', 'm6', 'm7b5'])
DRUM_NAMES = {35: 'Kick2', 36: 'Kick', 37: 'SideStick', 38: 'Snare', 39: 'Clap', 40: 'Snare2',
              41: 'LowTom1', 42: 'ClosedHH', 43: 'LowTom2', 44: 'PedalHH', 45: 'MidTom',
              46: 'OpenHH', 47: 'LowMidTom', 48: 'HiTom', 49: 'Crash', 50: 'HiTom2',
              51: 'Ride', 52: 'China'}


def roman_of(chord, key):
    if not chord or not key or chord.get('root_pc') is None:
        return None
    kroot = PC.index(key['root']) if key['root'] in PC else 0
    kmode = key.get('mode', 'major')
    deg = (chord['root_pc'] - kroot) % 12
    acc, maj, mn = DEG[deg]
    num = maj if kmode == 'major' else mn
    q = chord['quality']
    if kmode == 'major' and q in MINORISH:
        num = num.lower()
    if kmode == 'minor' and q not in MINORISH:
        num = num.upper()
    return acc + num + QUAL_SUF.get(q, '')


# ---------------------------------------------------------------- 主分析
def analyze(key, fn, out_name):
    path = os.path.join(SRC, fn)
    midi = M.parse_midi(path)
    chans, tsegs, div = M.extract_channels(midi)
    ts, ks = scan_meta(path)
    duration = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    bars = bar_grid(tsegs, div, duration)
    tmap = tempo_segments(tsegs)

    metrics, drum_ch = {}, set()
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            continue
        span = max(n['t'] + n['d'] for n in ns) - min(n['t'] for n in ns)
        metrics[ch] = chan_metrics(ns, span)
    for ch in list(metrics):
        ok, reason = is_drum_chan(metrics[ch], chans[ch]['notes'])
        metrics[ch]['is_drum'] = ok
        metrics[ch]['drum_reason'] = reason
        if ok:
            drum_ch.add(ch)

    tl = top_line(chans, drum_ch)
    pairs = {}
    for a in sorted(chans):
        for b in sorted(chans):
            if a < b:
                pairs[(a, b)] = unison_stats(chans, a, b)

    cand = []
    for ch, m in metrics.items():
        if ch in drum_ch or m['count'] == 0:
            continue
        cover = m['span_sec'] / max(duration, 1e-9)
        cand.append(dict(ch=ch, score=round(tl['ratio'].get(ch, 0.0) * cover, 4),
                         top_line_ratio=round(tl['ratio'].get(ch, 0.0), 4),
                         coverage=round(cover, 3)))
    cand.sort(key=lambda d: (-d['score'], d['ch']))
    melody_ch = cand[0]['ch']
    mel_scores = dict((c['ch'], c['score']) for c in cand)

    roles, evid = assign_roles(chans, metrics, drum_ch, melody_ch, pairs,
                                tl['ratio'], duration, mel_scores)

    mel_notes = chans[melody_ch]['notes']
    mel_line = melody_line(mel_notes)
    segments = detect_segments(chans, drum_ch, melody_ch, bars, duration)
    line_by_seg = [[x for x in mel_line if s['start_sec'] <= x['t'] < s['end_sec']] for s in segments]
    grams = [motif_of(l) for l in line_by_seg]
    label_segments(segments, line_by_seg, grams)

    weights = {'lead': 0.25, 'lead_alt': 0.3, 'lead_double': 0.25, 'lead_octave': 0.3,
               'harmony': 0.9, 'pad': 0.7, 'bass': 1.0, 'bass_double': 0.6,
               'arp': 0.4, 'arp_double': 0.3, 'counter': 0.5, 'counter_double': 0.3,
               'drums': 0.0, 'empty': 0.0}
    harm = harmony_by_bar(chans, roles, drum_ch, bars, weights)
    whole_key = key_of(mel_notes)
    for h in harm:
        h['roman'] = roman_of(h, whole_key) if h.get('chord') else None
    seg_keys = []
    for i, s in enumerate(segments):
        ln = line_by_seg[i]
        k = key_of([dict(m=x['m'], d=x['d']) for x in ln]) if ln else None
        seg_keys.append(k)
        s['key'] = k
        s['key_roman_base'] = k['key'] if k else None
        tot = s['total_onsets'] or 1
        tex = []
        for kk, vv in sorted(s['notes_by_channel'].items(), key=lambda kv: -kv[1])[:4]:
            tex.append('ch%s:%s×%d(%.0f%%)' % (kk, roles.get(int(kk), '?'), vv, 100.0 * vv / tot))
        s['texture'] = ' + '.join(tex)

    tri = tritone_scan(chans, drum_ch)
    gtv = global_top_voice(chans, drum_ch)
    # 主旋律三全音跳进（只用主旋律通道）
    mel_leaps = []
    for i in range(len(mel_line) - 1):
        if abs(mel_line[i + 1]['m'] - mel_line[i]['m']) == 6:
            mel_leaps.append([round(mel_line[i + 1]['t'], 3), mel_line[i]['m'], mel_line[i + 1]['m']])
    gtv_leaps = []
    for i in range(len(gtv) - 1):
        if abs(gtv[i + 1]['m'] - gtv[i]['m']) == 6:
            gtv_leaps.append([round(gtv[i + 1]['t'], 3), gtv[i]['m'], gtv[i + 1]['m']])

    drums_by_bar = []
    for h in harm:
        hits = []
        cnt = collections.Counter()
        for ch in sorted(chans):
            if ch not in drum_ch:
                continue
            for n in chans[ch]['notes']:
                if h['start_sec'] <= n['t'] < h['end_sec']:
                    hits.append(dict(ch=ch, t=round(n['t'], 3), pitch=n['m'],
                                     dur=round(n['d'], 3), vel=n['v']))
                    cnt[n['m']] += 1
        drums_by_bar.append(dict(bar=h['bar'], start_sec=h['start_sec'], end_sec=h['end_sec'],
                                 hits=hits,
                                 counts=[dict(pitch=p, name=DRUM_NAMES.get(p, 'p%d' % p), n=c)
                                         for p, c in sorted(cnt.items())]))

    out = dict(
        meta=dict(
            key=key, source_file=fn, source_url='https://github.com/AyHa1810/touhou-midi-collection',
            division=div, track_count=len(midi.get('tracks', [])),
            duration_sec=round(duration, 3),
            time_signature=[dict(tick=t[0], num=t[1], denom=t[2]) for t in ts],
            key_signature=[dict(tick=k[0], sharps_flats=k[1], minor=k[2]) for k in ks],
            tempo_map=[dict(tick=t['tick'], start_sec=t['start_sec'], end_sec=t['end_sec'],
                            bpm=t['bpm'], uspq=t['uspq']) for t in tmap],
            bar_grid=[dict(bar=b['bar'], start_sec=b['start_sec'], end_sec=b['end_sec'],
                           sec_per_bar=b['sec_per_bar'], bpm=b['bpm']) for b in bars],
            total_bars=len(bars),
            melody_channel=melody_ch,
            melody_channel_selection=dict(
                rule='score = 最高声线持有率 x 该通道时间跨度占比，取最大者',
                ranking=cand),
            melody_range=[min(n['m'] for n in mel_notes), max(n['m'] for n in mel_notes)],
            melody_note_count=len(mel_notes),
            melody_key=whole_key,
            drums_channels=sorted(drum_ch),
            note_units='seconds (midi2js.extract_channels 已把 tick 换算成秒)',
        ),
        channels=dict(
            ('ch%d' % ch, dict(
                role=roles.get(ch, 'empty'),
                is_drum=metrics[ch]['is_drum'],
                drum_reason=metrics[ch]['drum_reason'],
                program=metrics[ch]['progs'],
                note_count=metrics[ch]['count'],
                pitch_min=metrics[ch]['pitch_min'], pitch_max=metrics[ch]['pitch_max'],
                pitch_median=metrics[ch]['pitch_median'], pitch_mean=metrics[ch]['pitch_mean'],
                distinct_pitches=metrics[ch]['distinct_pitches'],
                avg_velocity=metrics[ch]['avg_vel'], avg_duration=metrics[ch]['avg_dur'],
                min_duration=metrics[ch]['min_dur'], max_duration=metrics[ch]['max_dur'],
                start_sec=metrics[ch]['start_sec'], end_sec=metrics[ch]['end_sec'],
                span_sec=metrics[ch]['span_sec'], density_per_sec=metrics[ch]['density'],
                avg_simultaneity=metrics[ch]['avg_simultaneity'],
                top_line_ratio=round(tl['ratio'].get(ch, 0.0), 4),
                top_line_abs_ratio=round(tl['abs_ratio'].get(ch, 0.0), 4),
                role_evidence=evid.get(ch, []),
                unison_with_melody=pairs.get((min(ch, melody_ch), max(ch, melody_ch)))
                if ch != melody_ch else None,
            )) for ch in sorted(metrics)),
        segments=segments,
        melody_notes=[[round(n['t'], 3), n['m'], round(n['d'], 3), n['v']] for n in mel_notes],
        melody_line=[[x['t'], x['m'], round(x['d'], 3), x['v']] for x in mel_line],
        melody_top_voice=[[x['t'], x['m'], round(x['d'], 3), x['v']] for x in gtv],
        melody_top_voice_leaps=gtv_leaps,
        melody_leaps_tritone=mel_leaps,
        segment_keys=seg_keys,
        harmony_by_bar=harm,
        drums_by_bar=drums_by_bar,
        tritones=tri,
    )
    with open(os.path.join(BASE, out_name), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out, chans, segments, bars, roles, metrics, tl, drum_ch, duration


# ---------------------------------------------------------------- 报告
FENCE = chr(96) * 3


def md_table(header, rows):
    out = ['| ' + ' | '.join(str(h) for h in header) + ' |',
           '|' + '|'.join(['---'] * len(header)) + '|']
    for r in rows:
        out.append('| ' + ' | '.join('' if x is None else str(x) for x in r) + ' |')
    return '\n'.join(out)


def spans_of(notes, gap=1.2):
    """音符表 -> 连续活动区间。notes: [[t,m,d,v]]"""
    out = []
    if not notes:
        return out
    t0 = t1 = notes[0][0]
    for n in notes[1:]:
        if n[0] - t1 > gap:
            out.append((round(t0, 3), round(t1, 3)))
            t0 = n[0]
        t1 = max(t1, n[0] + n[2])
    out.append((round(t0, 3), round(t1, 3)))
    return out


def bar_runs(bars):
    runs = []
    for b in bars:
        if runs and abs(runs[-1][2] - b['bpm']) < 0.01 and runs[-1][1] == b['bar'] - 1:
            runs[-1][1] = b['bar']
            runs[-1][3] = b['end_sec']
            runs[-1][4] = b['start_sec']
        else:
            runs.append([b['bar'], b['bar'], b['bpm'], b['end_sec'], b['start_sec']])
    return runs


def chord_runs(harm):
    runs = []
    for h in harm:
        key = (h.get('chord'), h.get('roman'))
        if runs and runs[-1][0] == key[0] and runs[-1][2] == h['bar'] - 1:
            runs[-1][2] = h['bar']
            runs[-1][5] = h.get('bass_name')
            runs[-1][6] = ','.join(h.get('pcs') or [])
        else:
            runs.append([h.get('chord'), h.get('roman'), h['bar'], h['bar'],
                         h.get('bass_name'), ','.join(h.get('pcs') or []), h.get('confidence')])
    return runs


def write_report(results, path):
    L = []
    A = L.append
    A('# ZUN 原曲 MIDI 音符级分析报告')
    A('')
    A('- 生成脚本：tools/build/_midi/analyze.py（只读分析；重复运行 python tools/build/_midi/analyze.py 即可复现全部数字）')
    A('- 数据源：tools/build/_midi/src/*.mid（原压缩包 tools/build/_midi/midi.zip，来源 https://github.com/AyHa1810/touhou-midi-collection）')
    A('- 本次未修改 src/ 下任何曲目或代码文件，未执行 git add/commit。')
    A('- 时间单位一律为秒（midi2js.extract_channels 已把 tick 换算成秒；division=480 ticks/四分音符）。')
    A('- 本报告所有数字均由脚本直接统计得出，判定依据见第 0 节口径表。')
    A('')
    A('## 0. 判定口径（可复现）')
    A('')
    A(md_table(['项目', '口径'], [
        ['主旋律通道', 'score = 最高声线持有率 x 该通道时间跨度占比，取最大者。最高声线 = 0.05s 栅格上每格最高的非鼓音符记给其通道；持有率 = 该通道在自己发声的栅格中占据最高位的比例。'],
        ['鼓通道', 'program >= 115，或 >=90% 音符落在 GM 打击乐音高 35-51 且密度 >= 8 音/秒。'],
        ['通道角色', '见各曲「通道与角色」表的依据列（每条依据都带数字）。同音双轨 = 两通道对齐 onset 中音高相同比例 >= 0.85；八度关系 = 音高差 +-12 半音命中比例 >= 0.55。'],
        ['段落边界', '(a) 主旋律音符停顿 > 1.2s，取停顿时段中点；(b) 织体能量分布 L1 突变 >= 0.45（前后各 2s 通道占比向量）。两者合并后吸附到最近小节线（误差 <= 0.4s）。'],
        ['段落标签', '无主旋律音符 = interlude（首段 = intro，末段追加 +outro）；主旋律平均时值 <= 0.22s 且 >=20 音 = ostinato；段落音符密度 >= 有旋律段中位数 x1.5 = chorus；<= x0.6 = verse；其余 = theme；与前段动机 n-gram Jaccard >= 0.35 = theme_recap。'],
        ['和弦', '逐小节模板匹配（maj/min/dim/aug/sus2/sus4/maj7/min7/dom7/m7b5/dim7/6/m6/7sus4/add9），权重 bass 1.0 / harmony 0.9 / pad 0.7 / counter 0.5 / arp 0.4 / lead 0.25，根音优先取最低音；级数按全曲调性换算。'],
        ['三全音', '同时三全音 = 同一 onset 内两音相差 6 个半音；旋律三全音跳进 = 相邻两音相差 6 个半音。'],
    ]))
    A('')

    titles = {
        'tillwhen': 'pre5《広有射怪鳥事 ～ Till When?》（魂魄妖梦主题，原 155 BPM）',
        'border13': 'stage5《幽雅に咲かせ、墨染の桜 ～ Border of Life》（西行寺幽幽子主题，144 -> 155 BPM）',
        'border14': '参考《Border of Life》（另一版，152 BPM，仅作对照）',
    }
    for idx, (key, out) in enumerate(results.items(), start=1):
        meta = out['meta']
        ch = out['channels']
        A('## %d. %s' % (idx, titles.get(key, key)))
        A('')
        A('### %d.1 文件头与速度地图' % idx)
        A('')
        A('- MIDI 文件：%s' % meta['source_file'])
        A('- division = %d ticks/四分音符，track 数 = %d' % (meta['division'], meta['track_count']))
        A('- 总时长 = %.3f s；拍号 = %s；共 %d 小节（4/4）' % (
            meta['duration_sec'],
            ' / '.join('%d/%d' % (t['num'], max(t['denom'], 1)) for t in meta['time_signature']) or '无',
            meta['total_bars']))
        A('- 调号元信息：%s' % (', '.join('tick%d sf=%d mi=%d' % (k['tick'], k['sharps_flats'], k['minor'])
                                   for k in meta['key_signature']) or '无'))
        A('')
        A('**tempo map（全部 %d 段）**' % len(meta['tempo_map']))
        A('')
        rows = []
        for i, t in enumerate(meta['tempo_map']):
            end = t['end_sec'] if t['end_sec'] is not None else meta['duration_sec']
            rows.append([i, t['tick'], '%.3f' % t['start_sec'], '%.3f' % end, '%.3f' % t['bpm'],
                         '%.4f' % (240.0 / t['bpm'])])
        A(md_table(['#', '起始 tick', '起始秒', '结束秒', 'BPM', '每小节秒数(4/4)'], rows))
        A('')
        A('**小节网格（按 BPM 分段）**')
        A('')
        rows = []
        for r in bar_runs(meta['bar_grid']):
            rows.append(['bar %d-%d' % (r[0], r[1]), '%.3f' % r[4], '%.3f' % r[3],
                         '%.2f' % r[2], '%.3f' % (r[3] - r[4])])
        A(md_table(['小节', '起始秒', '结束秒', 'BPM', '小节时长秒'], rows))
        A('')
        A('### %d.2 通道统计与角色判定' % idx)
        A('')
        rows = []
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            rows.append([name, c['role'], c['note_count'],
                         '%d-%d' % (c['pitch_min'], c['pitch_max']),
                         ', '.join('%d x%d' % (k, v) for k, v in sorted(c['program'].items(), key=lambda kv: int(kv[0]))),
                         c['avg_velocity'], '%.2f' % c['density_per_sec'],
                         '%.2f' % c['avg_simultaneity'],
                         '%.3f-%.3f' % (c['start_sec'], c['end_sec']),
                         '%.3f' % c['top_line_ratio']])
        A(md_table(['通道', '角色', '音符数', '音域', '音色(program x 音符数)', '力度均值',
                    '密度(音/秒)', '同时发音', '跨度(秒)', '最高声线持有率'], rows))
        A('')
        A('**角色判定依据**')
        A('')
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            A('- %s（%s）：%s' % (name, c['role'], '；'.join(c['role_evidence'])))
        A('')
        A('### %d.3 段落结构' % idx)
        A('')
        rows = []
        for s in out['segments']:
            rows.append([s['index'], '%.3f-%.3f' % (s['start_sec'], s['end_sec']),
                         'bar %d-%d' % (s['start_bar'], s['end_bar']), s['label'],
                         s['melody_onsets'], '%.2f' % s['onset_rate'], s['drum_onsets'],
                         s['key']['key'] if s.get('key') else '-', s['boundary_reason']])
        A(md_table(['#', '起止秒', '小节', '结构', '主旋律音数', '全曲音/秒', '鼓击数', '该段调性', '边界原因'], rows))
        A('')
        A('**每段织体与判定**')
        A('')
        for s in out['segments']:
            A('- 段落 #%d（%.3f-%.3f s，%s）：%s' % (s['index'], s['start_sec'], s['end_sec'], s['label'], s['texture']))
            A('  - 判定：%s' % s['label_reason'])
        A('')
        A('### %d.4 主旋律' % idx)
        A('')
        mn = out['melody_notes']
        A('- 主旋律通道：ch%d，%d 个音符，音域 %d-%d，全曲调性估计 %s（相关系数 %s）'
          % (meta['melody_channel'], len(mn), meta['melody_range'][0], meta['melody_range'][1],
             meta['melody_key']['key'], meta['melody_key']['confidence']))
        A('- 主旋律活动区间（间隔 > 1.2s 断开）：%s'
          % '，'.join('%.3f-%.3f s' % sp for sp in spans_of(mn)))
        A('- 全曲最高声线（所有非鼓通道叠加）%d 个音点；三全音跳进 %d 处。'
          % (len(out['melody_top_voice']), len(out['melody_top_voice_leaps'])))
        A('')
        A('**主旋律前 24 音符（[起始秒, MIDI音高, 时值秒, 力度]）**')
        A('')
        A(FENCE)
        for row in mn[:24]:
            A('%8.3f  %3d  %6.3f  %3d' % (row[0], row[1], row[2], row[3]))
        A(FENCE)
        A('')
        A('### %d.5 和声骨架（逐小节）' % idx)
        A('')
        rows = []
        for r in chord_runs(out['harmony_by_bar']):
            rows.append(['bar %d-%d' % (r[2], r[3]), r[0], r[1], r[4], r[5], r[6]])
        A(md_table(['小节', '和弦', '级数', '低音', '音级集合', '匹配度'], rows))
        A('')
        A('### %d.6 鼓组' % idx)
        A('')
        pit = collections.Counter()
        for b in out['drums_by_bar']:
            for h in b['hits']:
                pit[h['pitch']] += 1
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            if not c['is_drum']:
                continue
            A('- %s：%d 个打击乐音符，音高集 %s，跨度 %.3f-%.3f s，密度 %.2f 音/秒'
              % (name, c['note_count'],
                 ', '.join('%d(%s) x%d' % (p, DRUM_NAMES.get(p, '?'), pit[p]) for p in sorted(pit)),
                 c['start_sec'], c['end_sec'], c['density_per_sec']))
        A('')
        A('### %d.7 重配器要点' % idx)
        A('')
        A('- **逐音搬入**：主旋律 = ch%d 的 %d 个音符（含时值与力度），JSON 字段 melody_notes；'
          '真正在响的最高声线版本见 melody_top_voice（%d 点）。'
          % (meta['melody_channel'], len(mn), len(out['melody_top_voice'])))
        keys = [(s['index'], s['key']['key'], s['key']['confidence']) for s in out['segments'] if s.get('key')]
        if keys:
            A('- **转调需求**：全曲 %s；分段调性估计：%s' % (
                meta['melody_key']['key'],
                '，'.join('段落#%d %s(%s)' % (i, k, c) for i, k, c in keys)))
        A('- **音域**：主旋律 %d-%d（MIDI），重配保持在同一音区；若降八度须保留音程关系。'
          % (meta['melody_range'][0], meta['melody_range'][1]))
        tri = out['tritones']
        A('- **三全音检查**：全曲同时三全音 %d 处、旋律三全音跳进 %d 处（明细见 JSON tritones / melody_leaps_tritone）。'
          % (tri['simultaneous_tritone_count'], tri['melodic_tritone_leap_count']))
        doubles = [(n, c) for n, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:]))
                   if 'double' in c['role'] or c['role'] == 'lead_octave']
        if doubles:
            A('- **同音/八度叠录（重配可只保留一条）**：%s'
              % '，'.join('%s=%s' % (n, c['role']) for n, c in doubles))
        A('- **纪律**：只做 ZUN 原 MIDI 逐音搬入 + 重配器；禁止 blast beat、三全音簇、Eurobeat 外套等外来语法。')
        A('')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')


def main():
    results = {}
    for key, fn, out_name in SONGS:
        out, chans, segments, bars, roles, metrics, tl, drum_ch, duration = analyze(key, fn, out_name)
        results[key] = out
        print('%s -> %s  dur=%.2fs bars=%d melody=ch%d segments=%d'
              % (key, out_name, duration, len(bars), out['meta']['melody_channel'], len(segments)))
    write_report(results, os.path.join(BASE, 'REPORT_MIDI.md'))
    print('REPORT_MIDI.md written')


if __name__ == '__main__':
    main()
