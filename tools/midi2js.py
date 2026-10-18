#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/midi2js.py —— 东方 BOSS 曲 MIDI -> src/engine/songs/touhou.js

原生 JS + WebAudio 项目，没有第三方依赖，也没有 mido。
这里自带一个极简只读 MIDI 解析器：header / track / delta-time /
note-on / note-off / program_change / set_tempo，其余 meta 一律按长度跳过
（部分曲子的元数据块长度是坏的，mido 会 IndexError，本解析器容错跳过）。

用法：
    python tools/midi2js.py            # 生成 src/engine/songs/touhou.js
    python tools/midi2js.py --check    # 只做解析 + 自检打印，不写文件

输出数据格式见 src/engine/songs/index.js 顶部注释。
"""

import os
import sys
import json
import math

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_BASE = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
            r'\touhou-midi-collection-main\1 - Shooter Games')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
BUILD_DIR = os.path.join(ROOT, 'tools', 'build')

# 每首曲子的来源与展示信息
SONGS = [
    dict(key='stage1', title='妖魔夜行',
         file=r'6 - The Embodiment of Scarlet Devil\3. Apparitions Stalk the Night (ZUN).mid'),
    dict(key='stage2', title='蠢々秋月 ～ Mooned Insect',
         file=r'8 - Imperishable Night\3. Wriggling Autumn Moon ~ Mooned Insect (Unknown).mid'),
    dict(key='stage3', title='おてんば恋娘',
         file=r'6 - The Embodiment of Scarlet Devil\5. Tomboyish Girl in Love (ZUN).mid'),
    dict(key='stage4', title='風神少女',
         file=r'9 - Phantasmagoria of Flower View\11. Wind God Girl (Kanade_KND34).mid'),
    dict(key='stage5', title='幽雅に咲かせ、墨染の桜 ～ Border of Life',
         file=r'7 - Perfect Cherry Blossom\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'),
    dict(key='stage6', title='竹取飛翔 ～ Lunatic Princess',
         file=r'8 - Imperishable Night\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid'),
    dict(key='extra', title='U.N.オーエンは彼女なのか？',
         file=r'6 - The Embodiment of Scarlet Devil\15. U.N. Owen was her (ZUN).mid'),
]

# 鼓音高 -> 游戏鼓 kind（0=底鼓 1=军鼓 2=闭镲 3=开镲 4=吊镲）
DRUM_MAP = {
    35: 0, 36: 0,
    37: 1, 38: 1, 39: 1, 40: 1, 41: 1, 43: 1, 45: 1, 47: 1, 48: 1,
    42: 2, 44: 2, 51: 2, 53: 2, 59: 2,
    46: 3,
    49: 4, 52: 4, 55: 4, 57: 4,
}

LEAD_PROGS = set(range(73, 88))
BASS_PROGS = set(range(32, 40))

CROP_MAX = 175.0        # 循环片段最长（秒），超过就裁掉
DUR_MIN = 20.0          # 循环片段最短（秒）
SOLO_LIMIT = 78 * 1024  # 单曲序列化预算（字节）
TOTAL_LIMIT = 600 * 1024


# ---------------------------------------------------------------------------
# 极简 MIDI 解析
# ---------------------------------------------------------------------------

def read_varlen(data, pos, end):
    """读 7-bit 变长整数，损坏时尽量返回已有位。"""
    val = 0
    n = 0
    while pos < end:
        b = data[pos]
        pos += 1
        n += 1
        val = (val << 7) | (b & 0x7F)
        if not (b & 0x80):
            break
        if n >= 4:            # 超过 4 字节视为损坏，截断
            break
    return val, pos


def parse_midi(path):
    """返回 dict：division, tracks[{name, events}]，events 为 (tick, type, ...)。"""
    with open(path, 'rb') as f:
        data = f.read()

    if data[:4] != b'MThd':
        raise ValueError('不是 MIDI 文件: %s' % path)
    hlen = int.from_bytes(data[4:8], 'big')
    ntrk = int.from_bytes(data[10:12], 'big')
    division = int.from_bytes(data[12:14], 'big')
    pos = 8 + hlen

    tracks = []
    while pos + 8 <= len(data) and len(tracks) < max(ntrk, 64):
        cid = data[pos:pos + 4]
        clen = int.from_bytes(data[pos + 4:pos + 8], 'big')
        tstart = pos + 8
        tend = min(len(data), tstart + clen)
        pos = tend
        if cid == b'MTrk':
            tracks.append(parse_track(data, tstart, tend))
        # 其它块（如 mido 坏掉的那种）直接跳过

    return dict(division=division, tracks=tracks)


def parse_track(data, pos, end):
    name = ''
    events = []
    tick = 0
    running = 0

    while pos < end:
        delta, pos = read_varlen(data, pos, end)
        tick += delta
        if pos >= end:
            break
        status = data[pos]
        if status & 0x80:
            pos += 1
            if status < 0xF0:
                running = status
        else:
            status = running
            if not status:
                break

        if status == 0xFF:                          # meta
            if pos >= end:
                break
            mtype = data[pos]
            pos += 1
            ln, pos = read_varlen(data, pos, end)
            payload = data[pos:pos + ln]
            pos += ln
            if mtype == 0x51 and len(payload) >= 3:
                uspq = int.from_bytes(payload[:3], 'big')
                if 10000 <= uspq <= 6000000:
                    events.append((tick, 'tempo', uspq))
            elif mtype == 0x03 and not name:
                for enc in ('utf-8', 'shift_jis', 'latin-1'):
                    try:
                        name = payload.decode(enc).strip()
                        break
                    except Exception:
                        continue
            elif mtype == 0x2F:
                break
            continue

        if status in (0xF0, 0xF7):                  # sysex
            ln, pos = read_varlen(data, pos, end)
            pos += ln
            continue

        hi = status & 0xF0
        ch = status & 0x0F

        if hi in (0x80, 0x90, 0xA0, 0xB0, 0xE0):
            if pos + 1 >= end:
                break
            d1 = data[pos]
            d2 = data[pos + 1]
            pos += 2
            if hi == 0x90 and d2 > 0:
                events.append((tick, 'on', ch, d1 & 0x7F, d2 & 0x7F))
            elif hi == 0x80 or hi == 0x90:
                events.append((tick, 'off', ch, d1 & 0x7F))
        elif hi in (0xC0, 0xD0):
            if pos >= end:
                break
            d1 = data[pos]
            pos += 1
            if hi == 0xC0:
                events.append((tick, 'prog', ch, d1 & 0x7F))
        else:
            break                                   # 无法识别的状态字节：停

    return dict(name=name, events=events)


# ---------------------------------------------------------------------------
# 时间轴 / 声部提取
# ---------------------------------------------------------------------------

def build_tempo_map(tracks, division):
    """tick 换算基准：delta_tick * uspq / 1e6 / division = 秒。"""
    pairs = []
    for tr in tracks:
        for ev in tr['events']:
            if ev[1] == 'tempo':
                pairs.append((ev[0], ev[2]))
    pairs.sort()
    # 同 tick 去重（后出现的生效），tick 0 必须有默认值
    dedup = {}
    for tick, uspq in pairs:
        dedup[tick] = uspq
    pts = sorted(dedup.items())
    if not pts or pts[0][0] > 0:
        pts.insert(0, (0, 500000))

    segs = []       # (tick, seconds_at_tick, uspq)
    t = 0.0
    for i, (tick, uspq) in enumerate(pts):
        if i == 0:
            segs.append((tick, 0.0, uspq))
            continue
        ptick, puspq = pts[i - 1]
        t += (tick - ptick) * puspq / 1e6 / division
        segs.append((tick, t, uspq))
    return segs


def tick_to_sec(segs, division, tick):
    """按 tempo map 把绝对 tick 换算成秒。"""
    lo, hi = 0, len(segs) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if segs[mid][0] <= tick:
            lo = mid
        else:
            hi = mid - 1
    st, sec, uspq = segs[lo]
    return sec + (tick - st) * uspq / 1e6 / division


def extract_channels(midi):
    """把每条轨的事件按通道汇总，配对 note-on / note-off。"""
    segs = build_tempo_map(midi['tracks'], midi['division'] or 480)
    div = midi['division'] or 480

    chans = {}          # ch -> dict(notes=[(tick_on, tick_off, pitch, vel, prog)], progs=Counter)
    max_tick = 0

    for tr in midi['tracks']:
        progs = {}
        pending = {}    # (ch, pitch) -> [ (tick, vel, prog) ... ]
        notes = {}

        for ev in tr['events']:
            kind = ev[1]
            if kind == 'prog':
                progs[ev[2]] = ev[3]
            elif kind == 'on':
                ch, pitch, vel = ev[2], ev[3], ev[4]
                pending.setdefault((ch, pitch), []).append(
                    (ev[0], vel, progs.get(ch, 0)))
                max_tick = max(max_tick, ev[0])
            elif kind == 'off':
                ch, pitch = ev[2], ev[3]
                stack = pending.get((ch, pitch))
                if stack:
                    on_tick, vel, prog = stack.pop(0)
                    notes.setdefault(ch, []).append(
                        (on_tick, max(ev[0], on_tick + 1), pitch, vel, prog))
                    max_tick = max(max_tick, ev[0])

        # 没有 note-off 的悬挂音符：收到本轨最后时刻
        for (ch, pitch), stack in pending.items():
            for on_tick, vel, prog in stack:
                notes.setdefault(ch, []).append(
                    (on_tick, max(on_tick + 1, max_tick), pitch, vel, prog))

        for ch, lst in notes.items():
            c = chans.setdefault(ch, dict(notes=[], progs={}))
            c['notes'].extend(lst)
            for ch2, p in progs.items():
                if ch2 == ch:
                    c['progs'][p] = c['progs'].get(p, 0) + 1

    # tick -> 秒，量化到 1ms
    for ch, c in chans.items():
        conv = []
        for (ton, toff, pitch, vel, prog) in c['notes']:
            t = round(tick_to_sec(segs, div, ton), 3)
            d = round(tick_to_sec(segs, div, toff) - t, 3)
            if t + d < 0:
                continue
            if d < 0.03:
                d = 0.03
            conv.append(dict(t=max(0.0, t), d=d, m=pitch, v=vel, p=prog))
        conv.sort(key=lambda n: (n['t'], n['m']))
        c['notes'] = conv

    return chans, segs, div


def chan_stats(notes):
    """音符数 / 中位音高 / 复音比例 / 平均时值 / 平均力度 / 平均音程跳进。"""
    if not notes:
        return dict(count=0, med=0, poly=0, avg_dur=0, avg_vel=0, leap=12.0, span=0.0)
    pitches = sorted(n['m'] for n in notes)
    med = pitches[len(pitches) // 2]
    # 复音比例：note-on 时是否已有音在响
    poly = 0
    active = []     # 结束时间
    for n in notes:
        active = [e for e in active if e > n['t'] + 1e-6]
        if active:
            poly += 1
        active.append(n['t'] + n['d'])
    avg_dur = sum(n['d'] for n in notes) / len(notes)
    avg_vel = sum(n['v'] for n in notes) / len(notes)
    leaps = [abs(notes[i + 1]['m'] - notes[i]['m']) for i in range(len(notes) - 1)]
    avg_leap = sum(leaps) / len(leaps) if leaps else 12.0
    span = max(n['t'] for n in notes) - notes[0]['t']
    return dict(count=len(notes), med=med, poly=poly / len(notes),
                avg_dur=avg_dur, avg_vel=avg_vel, leap=avg_leap, span=span)


def melody_score(st, dur):
    """主旋律评分：单音性 + 级进 + 跨全曲 + 音区 + 密度。

    东方原曲里很多是钢琴改编 MIDI，主旋律不一定挂着 lead program；
    这时用这个评分找「单音性强、音程以级进为主、贯穿全曲、音区偏高」的通道。
    """
    mono = 1.0 - st['poly']
    cov = min(1.0, st['span'] / max(1.0, dur))
    reg = min(1.0, max(0.0, (st['med'] - 48) / 36.0))
    step = max(0.0, 1.0 - min(st['leap'], 12.0) / 12.0)
    dens = min(1.0, st['count'] / max(1.0, dur * 2.0))
    return mono * 0.25 + cov * 0.20 + reg * 0.15 + step * 0.30 + dens * 0.10


def main_prog(progs):
    if not progs:
        return -1
    return max(progs.items(), key=lambda kv: kv[1])[0]


def fmt_progs(progs):
    if not progs:
        return '-'
    items = sorted(progs.items(), key=lambda kv: -kv[1])
    return ','.join('%d(%d)' % (p, c) for p, c in items[:3])


# ---------------------------------------------------------------------------
# 声部挑选
# ---------------------------------------------------------------------------

def jaccard(seta, setb):
    if not seta or not setb:
        return 0.0
    return len(seta & setb) / len(seta | setb)


def onset_overlap(a, b):
    return jaccard(set(round(n['t'], 2) for n in a),
                   set(round(n['t'], 2) for n in b))


def note_overlap(a, b):
    return jaccard(set((round(n['t'], 2), n['m']) for n in a),
                   set((round(n['t'], 2), n['m']) for n in b))


def cluster_channels(items):
    """合并同一条旋律的复制/八度 doubling 通道，每组只留最像主旋律的一条。

    这些 MIDI 常把同一条旋律复制到多个通道（不同八度/不同音色），
    不去重的话主旋律会和声部一起被叠一遍，听起来发糊。
    """
    n = len(items)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            a, b = items[i], items[j]
            dup = note_overlap(a['notes'], b['notes']) > 0.7
            octave = (onset_overlap(a['notes'], b['notes']) > 0.7
                      and abs(a['med'] - b['med']) in (11, 12, 13, 23, 24, 25, 35, 36, 37))
            if dup or octave:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    kept, dropped = [], []
    for idxs in groups.values():
        best = max(idxs, key=lambda i: (items[i]['prog'] in LEAD_PROGS,
                                        items[i]['count'], items[i]['med']))
        kept.append(items[best])
        for i in idxs:
            if i != best:
                dropped.append((items[i], items[best]))
    return kept, dropped


def channel_metrics(notes):
    """密度 / 内部最大静默 / 同音重复率 / 首末时间 / 发声覆盖率。"""
    ns = sorted(notes, key=lambda n: (n['t'], n['m']))
    if not ns:
        return dict(dens=0.0, gap=0.0, rep=0.0, first=0.0, last=0.0, cov=0.0)
    first = ns[0]['t']
    last = ns[0]['t']
    gap = 0.0
    t = ns[0]['t']
    sung = 0.0
    for n in ns:
        if n['t'] - t > gap:
            gap = n['t'] - t
        if n['t'] + n['d'] > t:
            sung += n['t'] + n['d'] - max(t, n['t'])
            t = n['t'] + n['d']
        if n['t'] > last:
            last = n['t']
    rep = sum(1 for i in range(len(ns) - 1) if ns[i + 1]['m'] == ns[i]['m']) / max(1, len(ns) - 1)
    return dict(dens=len(ns) / max(1.0, last - first), gap=gap, rep=rep,
                first=ns[0]['t'], last=last, cov=min(1.0, sung / max(1.0, last - ns[0]['t'])))


def melody_score(st, dur):
    """主旋律评分：单音性 + 覆盖率 + 音区 + 级进 + 密度。"""
    mono = 1.0 - st['poly']
    cov = st['cov']
    reg = min(1.0, max(0.0, (st['med'] - 48) / 36.0))
    step = max(0.0, 1.0 - min(st['leap'], 12.0) / 12.0)
    dens = min(1.0, st['dens'] / 2.0)
    return mono * 0.25 + cov * 0.20 + reg * 0.15 + step * 0.30 + dens * 0.10


def pick_voices(chans, dur):
    """返回 (lead, bass, harmony, reasons)。

    1) 先把「音符完全重合 / 整八度 doubling」的通道合并，只留最像主旋律的一条；
    2) 贝斯：音区低、program 32-39 优先，且要有足够音符（排除装饰性片段）；
    3) 主旋律：密度 >=1.8 音/秒、音区不低于 C3、不是同音反复型、内部空洞能被其它
       旋律通道补上；在这些候选里按 melody_score 取最高（lead 类 program 加 0.06）。
    """
    melodic = []
    for ch, c in chans.items():
        if ch == 9 or not c['notes']:
            continue
        st = chan_stats(c['notes'])
        st.update(channel_metrics(c['notes']))
        st['ch'] = ch
        st['prog'] = main_prog(c['progs'])
        st['notes'] = c['notes']
        melodic.append(st)
    melodic.sort(key=lambda s: -s['count'])
    if not melodic:
        return None, None, [], ['无旋律通道']

    reasons = []
    reps, dropped = cluster_channels(melodic)
    for d, won in dropped[:6]:
        reasons.append('  重复通道 ch%d(prog=%d,%d音) 与 ch%d(prog=%d,%d音) 重合/八度 doubling，丢弃'
                       % (d['ch'], d['prog'], d['count'], won['ch'], won['prog'], won['count']))
    reps.sort(key=lambda s: -s['count'])
    max_count = reps[0]['count']

    # --- 贝斯 ---
    low_pool = [s for s in reps
                if s['med'] <= 64 and s['count'] >= max(30, max_count * 0.08)]
    if not low_pool:
        low_pool = [s for s in reps if s['med'] <= 64] or reps
    pref = [s for s in low_pool if s['prog'] in BASS_PROGS]
    pool = pref or low_pool
    bass = min(pool, key=lambda s: (s['med'], -s['count']))
    reasons.append(
        '贝斯 ch%d: prog=%d 音符=%d 中位音高=%d 复音=%.0f%% 密度=%.1f音/秒（%s）'
        % (bass['ch'], bass['prog'], bass['count'], bass['med'],
           bass['poly'] * 100, bass['dens'],
           'program 32-39 优先 + 音区最低' if pref else '音区最低（无 32-39 program）'))

    rest = [s for s in reps if s['ch'] != bass['ch']]
    others = [s for s in rest if s['rep'] <= 0.5]

    def fillable(s):
        """内部空洞是否能被别的旋律通道补上（覆盖率 >= 0.6）。"""
        rs = runs_of(s['notes'], 4.0)
        for i in range(len(rs) - 1):
            a, b = rs[i][1], rs[i + 1][0]
            if b - a <= 4.0:
                continue
            best = 0.0
            for o in others:
                if o['ch'] == s['ch']:
                    continue
                inside = [n for n in o['notes'] if a <= n['t'] < b]
                if not inside:
                    continue
                cov = min(1.0, sum(min(n['d'], b - n['t']) for n in inside) / (b - a))
                best = max(best, cov)
            if best < 0.6:
                return False
        return True

    def lead_score(s):
        sc = melody_score(s, dur)
        if s['prog'] in LEAD_PROGS:
            sc += 0.06
        if s['rep'] > 0.5:
            sc -= 0.35
        if s['med'] < 55:
            sc -= 0.40
        if s['dens'] < 1.8:
            sc -= 0.15
        if s['gap'] > 20 and not fillable(s):
            sc -= 0.15
        return sc

    ranked = sorted(rest, key=lambda s: -lead_score(s))
    lead = ranked[0]
    reasons.append(
        '主旋律 ch%d: prog=%d 音符=%d 中位音高=%d 复音=%.0f%% 级进=%.2f 密度=%.1f音/秒 '
        '发声覆盖=%.0f%% 内部最大空洞=%.1fs（综合分 %.2f：单音性/覆盖/音区/级进/密度）'
        % (lead['ch'], lead['prog'], lead['count'], lead['med'], lead['poly'] * 100,
           lead['leap'], lead['dens'], lead['cov'] * 100, lead['gap'], lead_score(lead)))

    # --- 和声/伴奏：和弦/琶音性质，排除与主旋律同节奏同音高的重复 ---
    pool_h = [s for s in reps
              if s['ch'] not in (bass['ch'], lead['ch'])
              and s['count'] >= max(20, max_count * 0.08)
              and note_overlap(s['notes'], lead['notes']) < 0.3]
    pool_h.sort(key=lambda s: -(s['count'] * (0.35 + s['poly'])))
    harm = pool_h[:3]
    for s in harm:
        reasons.append('和声 ch%d: prog=%d 音符=%d 中位音高=%d 复音=%.0f%%（和弦型优先，合并抽稀）'
                       % (s['ch'], s['prog'], s['count'], s['med'], s['poly'] * 100))
    if not harm:
        reasons.append('和声：无可用通道（只保留 lead + bass）')
    lead['_pool'] = [s for s in others if s['ch'] != lead['ch']]
    return lead, bass, harm, reasons


def runs_of(notes, max_gap=3.5):
    """把音符切成「连续发声段」，静默超过 max_gap 就断开。"""
    ns = sorted(notes, key=lambda n: (n['t'], n['m']))
    runs = []
    cur = None
    for n in ns:
        e = n['t'] + n['d']
        if cur is None or n['t'] - cur[1] > max_gap:
            cur = [n['t'], e, [n]]
            runs.append(cur)
        else:
            cur[1] = max(cur[1], e)
            cur[2].append(n)
    return runs


def stitch_lead(primary_notes, pool, max_gap=3.5):
    """主旋律通道在改编 MIDI 里常分段出现（乐器轮换）。

    空窗超过 max_gap 的区段用该段最像旋律的其它通道补上，
    保证 lead 声部基本连续；返回 (notes, fills[])。
    """
    ns = sorted(primary_notes, key=lambda n: (n['t'], n['m']))
    runs = runs_of(ns, max_gap)
    out = list(ns)
    fills = []
    for i in range(len(runs) - 1):
        a, b = runs[i][1], runs[i + 1][0]
        if b - a <= max_gap:
            continue
        best, best_sc = None, -9
        for c in pool:
            inside = [n for n in c['notes'] if a + 0.05 <= n['t'] < b - 0.05]
            if len(inside) < 4:
                continue
            cov = min(1.0, sum(min(n['d'], b - n['t']) for n in inside) / (b - a))
            sc = cov * 0.6 + min(1.0, len(inside) / ((b - a) * 2.0)) * 0.25 \
                 + (0.1 if c['prog'] in LEAD_PROGS else 0.0) \
                 + (0.05 if c['med'] >= 60 else 0.0)
            if sc > best_sc:
                best, best_sc = c, sc
        if best is None:
            continue
        add = [n for n in best['notes'] if a + 0.02 <= n['t'] < b - 0.02]
        add = mono_ize(add, keep='high')
        fills.append((round(a, 1), round(b, 1), best['ch'], best['prog'], len(add), round(best_sc, 2)))
        out.extend(add)
    return out, fills


# ---------------------------------------------------------------------------
# 音符整理
# ---------------------------------------------------------------------------

def dedupe(notes):
    seen = set()
    out = []
    for n in notes:
        k = (n['t'], n['m'])
        if k in seen:
            continue
        seen.add(k)
        out.append(n)
    out.sort(key=lambda n: (n['t'], n['m']))
    return out


def mono_ize(notes, keep='high', min_dur=0.05):
    """同一时刻只保留一个音，并把前一个音截断到下一个起点，避免叠音。"""
    notes = dedupe(notes)
    groups = {}
    for n in notes:
        groups.setdefault(n['t'], []).append(n)
    picked = []
    for t, group in groups.items():
        group.sort(key=lambda n: n['m'])
        picked.append(group[-1] if keep == 'high' else group[0])
    picked.sort(key=lambda n: n['t'])
    for i in range(len(picked) - 1):
        max_d = picked[i + 1]['t'] - picked[i]['t'] - 0.005
        if picked[i]['d'] > max_d:
            picked[i]['d'] = max(min_dur, round(max_d, 3))
    return picked


def cap_poly(notes, max_simul=2):
    """最多 max_simul 个音同时发声，超出按优先级丢。"""
    notes = dedupe(notes)
    active = []
    out = []
    for n in notes:
        active = [e for e in active if e > n['t'] + 1e-6]
        if len(active) >= max_simul:
            continue
        out.append(n)
        active.append(n['t'] + n['d'])
    return out


def map_drums(notes):
    out = []
    seen = set()
    for n in notes:
        kind = DRUM_MAP.get(n['m'])
        if kind is None:
            continue
        t = n['t']
        k = (t, kind)
        if k in seen:
            continue
        seen.add(k)
        out.append((t, kind, n['v']))
    out.sort()
    return out


def thin_drums(drums, max_per_sec=20):
    """保底鼓/军鼓/吊镲，闭镲太密就抽稀。"""
    prio = {0: 5, 1: 4, 4: 3, 3: 2, 2: 1}
    drums = sorted(drums, key=lambda d: (-prio[d[1]], d[0]))
    used = {}
    out = []
    for d in drums:
        slot = int(d[0] * 4)     # 250ms 桶
        n = used.get(slot, 0)
        limit = 4 if d[1] in (0, 1) else 2
        if n >= limit:
            continue
        used[slot] = n + 1
        out.append(d)
    out.sort()
    return out


def importance(n):
    return n['v'] * (n['d'] ** 0.35)


def reduce_notes(notes, frac):
    """按重要度丢掉 frac 比例的低价值音。"""
    if frac <= 0 or not notes:
        return notes
    keep = max(1, int(len(notes) * (1 - frac)))
    ranked = sorted(notes, key=lambda n: -importance(n))[:keep]
    ranked.sort(key=lambda n: (n['t'], n['m']))
    return ranked


# ---------------------------------------------------------------------------
# 序列化
# ---------------------------------------------------------------------------

def num(x):
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    s = ('%.3f' % x).rstrip('0').rstrip('.')
    return s if s not in ('', '-') else '0'


def notes_js(notes):
    return '[' + ','.join('[%s,%d,%s,%d]' % (num(n['t']), n['m'], num(n['d']), int(n['v']))
                          for n in notes) + ']'


def drums_js(drums):
    return '[' + ','.join('[%s,%d,%d]' % (num(d[0]), d[1], int(d[2])) for d in drums) + ']'


def bpm_of(segs):
    if not segs:
        return 120
    return int(round(60e6 / segs[0][2]))


def build_song(song, chans, segs, limit=SOLO_LIMIT, verbose=False):
    # 全曲末端（用于选声部与窗口规划）
    raw_end = 0.0
    for c in chans.values():
        for n in c['notes']:
            raw_end = max(raw_end, n['t'] + n['d'])
    if raw_end <= 0:
        raise SystemExit('空 MIDI: %s' % song['key'])

    lead_s, bass_s, harm_s, reasons = pick_voices(chans, raw_end)
    lead_ch, bass_ch = lead_s['ch'], bass_s['ch']
    harm_chs = [s['ch'] for s in harm_s]

    st = chan_stats(chans[lead_ch]['notes'])
    st_bass = chan_stats(chans[bass_ch]['notes'])

    def clip_range(notes):
        return [n for n in notes if 12 <= n['m'] <= 120]

    # --- 循环窗口：从主旋律第一个音开始（跳过前奏），长度 <= CROP_MAX ---
    lead_raw = clip_range(mono_ize(chans[lead_ch]['notes'], keep='high'))
    t0 = max(0.0, lead_raw[0]['t'] - 0.25)
    win = min(CROP_MAX, raw_end - t0)
    t1 = t0 + win

    # 主旋律空窗用其它旋律通道补缝
    lead_raw, fills = stitch_lead(lead_raw, lead_s.get('_pool', []))
    for f in fills:
        reasons.append('  补缝 %.1f-%.1fs 用 ch%d(prog=%d) 的 %d 音' % (f[0], f[1], f[2], f[3], f[4]))

    lead = clip_range(mono_ize(lead_raw, keep='high'))
    bass = clip_range(mono_ize(chans[bass_ch]['notes'], keep='low'))

    harm = []
    for ch in harm_chs:
        harm.extend(clip_range(chans[ch]['notes']))
    harm = cap_poly(harm, 2)

    drums = map_drums(chans.get(9, {}).get('notes', []))
    drums = thin_drums(drums)

    # --- 裁剪到 [t0, t1) 并平移到 0 ---
    def crop(notes):
        out = []
        for n in notes:
            if n['t'] < t0 or n['t'] >= t1:
                continue
            n = dict(n)
            n['t'] = round(n['t'] - t0, 3)
            n['d'] = max(0.02, round(min(n['d'], t1 - 0.001 - (n['t'] + t0)), 3))
            out.append(n)
        return out

    lead = crop(lead)
    bass = crop(bass)
    harm = crop(harm)
    drums = [(round(d[0] - t0, 3), d[1], d[2]) for d in drums if t0 <= d[0] < t1]

    # 去重（同时间同音高）
    lead = dedupe(lead)
    bass = dedupe(bass)
    harm = dedupe(harm)

    # 末端
    end = 0.0
    for n in lead + bass + harm:
        end = max(end, n['t'] + n['d'])
    if drums:
        end = max(end, drums[-1][0])
    duration = round(max(DUR_MIN, min(CROP_MAX, end + 0.3)), 3)
    if duration < 20:
        duration = 20.0

    # 主旋律连续性统计
    lg = channel_metrics(lead)
    st['lead_dens'] = lg['dens']
    st['lead_gap'] = lg['gap']
    st['lead_first'] = lg['first']
    reasons.append('  裁剪窗口 %.1f-%.1fs → 0-%.1fs；lead 最终 %d 音、密度 %.1f音/秒、'
                   '最大静默 %.1fs' % (t0, t1, duration, len(lead), lg['dens'], lg['gap']))

    tracks = [dict(wave='square', gain=0.15, notes=lead, _name='lead', _w=1.0),
              dict(wave='triangle', gain=0.15, notes=bass, _name='bass', _w=0.8)]
    if harm:
        tracks.append(dict(wave='square', gain=0.05, notes=harm, _name='harmony', _w=0.35))

    data = dict(key=song['key'], title=song['title'], duration=duration,
                bpm=bpm_of(segs), tracks=tracks, drums=drums)

    # --- 体积收缩：反复砍最大声部的低价值音 ---
    while True:
        body = render_song_js(data, reasons, notes_only=True)
        size = len(body.encode('utf-8'))
        if size <= limit:
            break
        biggest = None
        for tr in tracks:
            if not tr['notes']:
                continue
            sz = len(notes_js(tr['notes']).encode('utf-8')) * 1.0 / max(1e-6, tr['_w'])
            if biggest is None or sz > biggest[0]:
                biggest = (sz, tr)
        if biggest is None:
            break
        tr = biggest[1]
        tr['notes'] = reduce_notes(tr['notes'], 0.10)
        if tr['notes'] and tr['notes'][-1]['t'] >= duration:
            tr['notes'] = [n for n in tr['notes'] if n['t'] < duration]
    data['size'] = size
    data['reasons'] = reasons
    data['lead_stats'] = st
    data['bass_stats'] = st_bass
    return data


def render_song_js(data, reasons, notes_only=False):
    tracks_js = []
    for tr in data['tracks']:
        tracks_js.append("      { wave: '%s', gain: %s, notes: %s }"
                         % (tr['wave'], ('%.2f' % tr['gain']).rstrip('0').rstrip('.'),
                            notes_js(tr['notes'])))
    drums_js_str = drums_js(data['drums'])
    head = ("  %s: {\n"
            "    // %s\n"
            "    title: '%s',\n"
            "    duration: %s,\n"
            "    bpm: %d,\n"
            "    tracks: [\n%s\n    ],\n"
            "    drums: %s,\n"
            "  }") % (
        data['key'], ' | '.join(reasons), data['title'], num(data['duration']),
        data['bpm'], ',\n'.join(tracks_js), drums_js_str)
    return head


def render_header(results):
    lines = []
    for d in results:
        for r in d['reasons']:
            lines.append(' *  %s: %s' % (d['key'], r))
    return """/**
 * 各关 BOSS 的原作主题曲 —— 8-bit 合成器版本。
 *
 * 数据格式见 src/engine/songs/index.js 顶部注释。
 * 由 tools/midi2js.py 从本地 MIDI 集合提取，勿手改。
 *
 * key: stage1..stage6 / extra
 *
 * 提取规则（详见 tools/midi2js.py）：
 * - 鼓：MIDI 通道 10（0-based 9）；底鼓 35/36、军鼓 37-41/43/45/47/48、
 *   闭镲 42/44/51/53/59、开镲 46、吊镲 49/52/55/57。
 * - 贝斯：音区最低、以 C2-C4 为主，program 32-39 的通道优先；三角波。
 * - 主旋律：program 73-87 中音符最多者（并列时取同时发声少、音区高者）；
 *   无 lead 类 program 时取「单音性最强 + 音区最高」的通道；方波。
 * - 和声：其余通道合并抽稀，同一时刻最多 2 个音；方波，增益压低。
 * - 时间：用 set_tempo 建立的 tempo map 逐段换算成秒（保留原曲的渐慢），
 *   量化到 1ms，不做固定 BPM 重采样。
 * - 每首 ≤4 条轨；同一时刻最多 4 个旋律声部发声；循环片段 ≤%d 秒。
 *
 * 各曲通道选择依据：
%s
 */
""" % (int(CROP_MAX), '\n'.join(lines))


def main():
    check_only = '--check' in sys.argv
    results = []
    sources = []

    for song in SONGS:
        path = os.path.join(SRC_BASE, song['file'])
        print('\n=== %s %s' % (song['key'], os.path.basename(song['file'])))
        if not os.path.exists(path):
            print('  !! 文件不存在: %s' % path)
            continue
        midi = parse_midi(path)
        chans, segs, div = extract_channels(midi)
        print('  tracks=%d division=%d tempo点=%d 通道=%s'
              % (len(midi['tracks']), div, len(segs), sorted(chans.keys())))

        # 每通道诊断
        for ch in sorted(chans.keys()):
            st = chan_stats(chans[ch]['notes'])
            print('    ch%-2d prog=%-12s notes=%-5d 中位音高=%-3d 复音=%3.0f%% 平均时值=%.2fs'
                  % (ch, fmt_progs(chans[ch]['progs']), st['count'], st['med'],
                     st['poly'] * 100, st['avg_dur']))

        data = build_song(song, chans, segs)
        print('  -> %s | duration=%ss bpm=%d 大小=%.1fKB'
              % (' / '.join(data['reasons']), data['duration'], data['bpm'],
                 data['size'] / 1024.0))
        for tr in data['tracks']:
            print('     %-8s %-8s gain=%.2f notes=%d'
                  % (tr['_name'], tr['wave'], tr['gain'], len(tr['notes'])))
        print('     drums  %d' % len(data['drums']))

        # 自检：lead 前 12 个音
        sample = ', '.join('%s/%d/%.2f' % (num(n['t']), n['m'], n['d'])
                           for n in data['tracks'][0]['notes'][:12])
        print('     lead 前12音(t/midi/dur): %s' % sample)

        results.append(data)
        sources.append((song, chans, segs))

    if check_only:
        print('\n--check：未写入文件')
        return

    # 体积控制：若总量超预算，逐轮压低每首预算后重算
    limit = SOLO_LIMIT
    for _ in range(12):
        total = len(render_header(results).encode('utf-8'))
        for data in results:
            total += len(render_song_js(data, data['reasons']).encode('utf-8')) + 4
        if total <= TOTAL_LIMIT:
            break
        limit = int(limit * 0.92)
        print('\n[体积超预算] 单曲预算收紧到 %.1fKB，重算...' % (limit / 1024.0))
        results = [build_song(song, chans, segs, limit=limit)
                   for (song, chans, segs) in sources]

    header = render_header(results)
    parts = [render_song_js(d, d['reasons']) for d in results]
    out = header + 'export const BOSS_SONGS = {\n' + ',\n'.join(parts) + ',\n};\n'

    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)

    os.makedirs(BUILD_DIR, exist_ok=True)
    meta = [dict(key=d['key'], title=d['title'], duration=d['duration'],
                 bpm=d['bpm'], reasons=d['reasons'],
                 tracks=[dict(name=t['_name'], wave=t['wave'], gain=t['gain'],
                              notes=len(t['notes'])) for t in d['tracks']],
                 drums=len(d['drums'])) for d in results]
    with open(os.path.join(BUILD_DIR, 'touhou_meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    size = len(out.encode('utf-8'))
    print('\n写入 %s：%.1f KB（%d 首）' % (OUT_JS, size / 1024.0, len(results)))
    if size > TOTAL_LIMIT:
        print('!! 超过 600KB 预算')
        sys.exit(1)


if __name__ == '__main__':
    main()
