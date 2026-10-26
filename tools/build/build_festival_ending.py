# -*- coding: utf-8 -*-
"""EXTRA 结局曲《今宵未尽的祭典》—— 八音盒版《魔法少女達の百年祭》（整曲）。

口径：旋律 / 贝斯 / 和弦 / 琶音全部照原谱搬，一个音不改；只做编制减法、
速度与力度处理。渲染走 tools/build/_make_festival_wav.py（真八音盒泛音模型
+ 环形大厅混响），产物 src/assets/bgm/festival_box.wav；本脚本同时生成一份
精简的同曲合成数据，作为 WAV 加载失败时的回退。

曲式（原曲 94 小节 / 149 BPM）：
  1-8   前奏（ch2 riff + ch3 和弦）
  9-17  A（全奏）
  18-19 断
  20-28 B（主旋律，颤音琴 + 钟琴）
  29-33 C
  34-39 D
  40-55 A'（再现，两个 8 小节循环；这里只取 40-47，去掉逐字重复的后半）
  56-58 断
  59-60 半音滑奏
  61-76 终段 1（小号/弦乐主旋律）
  77-78 空
  79-94 终段 2（高潮主旋律，93/94 收在 G）

输出：
  src/engine/songs/extra_ending.js   （EXTRA_ENDING.endingW，含回退 tracks）
  tools/build/festival_notes.json    （给 WAV 渲染器的完整音符模型）
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M  # noqa: E402

SRC = 'tools/build/midi/centennial.mid'
OUT_JS = 'src/engine/songs/extra_ending.js'
OUT_JSON = 'tools/build/festival_notes.json'

BPM = 96                         # 原曲 149 → 放慢到 0.644 倍，八音盒的婉柔
SRC_BPM = 149.0
BAR_OUT = 4 * 60.0 / BPM         # 2.3077s
BAR_SRC = 4 * 60.0 / SRC_BPM     # 1.6107s
TAIL = 2.2                       # 尾音留白（让最后一和弦自然衰减进循环点）

# 保留的原曲小节（半开区间，1-based）：整曲只砍掉 A' 的第二遍逐字重复
CUT = [(1, 48), (56, 95)]

# 原曲段落（1-based 闭区间）
SECTIONS = [
    (1, 8, 'intro'), (9, 17, 'A'), (18, 19, 'brk1'), (20, 28, 'B'),
    (29, 33, 'C'), (34, 39, 'D'), (40, 55, 'Ap'), (56, 58, 'brk2'),
    (59, 60, 'gliss'), (61, 76, 'fin1'), (77, 78, 'brk3'), (79, 94, 'fin2'),
]

# 段落力度（乘在 vel 上）：前奏轻、B 段最柔、A' 与终段最满
SEC_DYN = dict(intro=0.78, A=0.90, brk1=0.62, B=0.96, C=0.96, D=0.92,
               Ap=1.00, brk2=0.66, gliss=0.80, fin1=0.96, brk3=0.72, fin2=0.98)

# A 段（9-17 小节）：弹成「远处的影子」——只留旋律和低音，和声块 / 琶音 /
# 钟琴全部撤掉，旋律再压到六成。B 段主题进来时才觉得房间是空的。
A_SPARSE = ('harm', 'pad', 'arp', 'glass', 'spark')
A_DYN = dict(lead=0.58, bass=0.82)
# 想让 A 段不那么秃时改成 True：和声块压到 0.42 留一层远钟（默认仍是最空的版本）
A_SOFT_HARM = False


def sec_of(bar):
    for (b0, b1, tag) in SECTIONS:
        if b0 <= bar < b1 + 1:
            return tag
    return 'fin2'


def tempo_mult(bar):
    """表情速度：起手慢一点、主题段稍宽、断口前收一点、最后几小节渐慢。"""
    m = 1.0
    if bar < 3.0:
        m *= 1.09
    if 20.0 <= bar < 29.0:              # B 段主旋律：把呼吸放长一点
        m *= 1.03
    if 29.0 <= bar < 34.0:              # C 段延续这份宽度
        m *= 1.02
    if 44.0 <= bar < 48.0:
        m *= 1.05
    if 54.0 <= bar < 58.0:
        m *= 1.04
    if bar > 90.0:                      # 尾句渐慢 1.00 → 1.32
        m *= 1.0 + 0.32 * min(1.0, (bar - 90.0) / 4.0)
    return m


# ---------------------------------------------------------------- 时间映射
def build_warp():
    """把原曲时间映射到输出时间（含渐慢），返回 (segments, total_seconds)。"""
    step = 0.05
    segs = []
    t = 0.0
    for (b0, b1) in CUT:
        bars = np.arange(b0, b1 - 1e-9, step)
        mult = np.array([tempo_mult(b) for b in bars])
        cum = np.concatenate([[0.0], np.cumsum(step * BAR_OUT * mult)])
        segs.append((float(b0), float(b1), bars, cum, t))
        t += float(cum[-1])
    return segs, t


SEGS, MUSIC_DUR = build_warp()
DURATION = round(MUSIC_DUR + TAIL, 3)


def warp(t_src):
    bar = t_src / BAR_SRC + 1.0          # 1-based 小节号
    for (b0, b1, bars, cum, off) in SEGS:
        if b0 <= bar < b1:
            i = int(np.searchsorted(bars, bar)) - 1
            i = max(0, min(i, len(bars) - 2))
            frac = (bar - bars[i]) / (bars[i + 1] - bars[i])
            out = cum[i] + frac * (cum[i + 1] - cum[i])
            return off + out
    return None                                  # 落在被砍掉的小节里


def warp_dur(t_src, dur_src):
    t0 = warp(t_src)
    t1 = warp(t_src + dur_src)
    if t0 is None or t1 is None:
        return None
    return max(0.12, min(3.0, t1 - t0))


# ---------------------------------------------------------------- 取音
def notes_of(chans, ch):
    return chans[ch]['notes'] if ch in chans else []


def thin_grid(notes, grid_src, keep=1, pick='top'):
    """按网格抽稀：每个格子里只留最高（或最低）的 keep 个音。"""
    buckets = {}
    for n in notes:
        k = int(round(n['t'] / grid_src))
        buckets.setdefault(k, []).append(n)
    out = []
    for k in sorted(buckets):
        grp = sorted(buckets[k], key=lambda n: n['m'])
        if pick == 'top':
            grp = grp[-keep:]
        else:
            grp = grp[:keep]
        out.extend(grp)
    return out


def top_per_onset(notes, keep=2):
    buckets = {}
    for n in notes:
        buckets.setdefault(round(n['t'], 3), []).append(n)
    out = []
    for k in sorted(buckets):
        grp = sorted(buckets[k], key=lambda n: n['m'])
        out.extend(grp[-keep:])
    return out


def main():
    mid = M.parse_midi(SRC)
    chans, _segs, _div = M.extract_channels(mid)

    # 每声部：(voice, 源通道, vel 倍数, 前处理)
    parts = []

    # ch2 主旋律（1-17 是 riff，20-33 是歌；同刻取最高音）
    parts.append(('lead', 2, 1.00, lambda ns: top_per_onset(ns, 1)))
    # ch10 终段主旋律
    parts.append(('lead', 10, 1.06, lambda ns: top_per_onset(ns, 1)))
    # ch1 贝斯
    parts.append(('bass', 1, 1.00, None))
    # ch3 和弦块：一个块 4 音，取最高两个当铃
    parts.append(('harm', 3, 0.85, lambda ns: top_per_onset(ns, 2)))
    # ch4 弦乐：B/C 段是长音垫，其余是分解线；ti=20-34 长音走 pad
    parts.append(('ch4', 4, 0.80, None))
    # ch9 吉他分解：按十六分格抽最高音，只留八分密度
    parts.append(('arp', 9, 1.00, lambda ns: thin_grid(ns, BAR_SRC / 8.0, 1, 'top')))
    # ch7/ch8 颤音琴 + 钟琴
    parts.append(('glass', 7, 0.95, None))
    parts.append(('glass', 8, 0.95, None))
    # ch11 终段内声部
    parts.append(('harm', 11, 0.80, None))
    # ch6 高音副 riff：只在 A' 出现（A 段留白，第二遍再点亮）
    parts.append(('spark', 6, 0.75, None))

    voices = {}
    stats = {}

    def put(voice, t, m, d, v):
        if t is None or d is None:
            return
        if not (12 <= m <= 120) or t < 0 or t >= MUSIC_DUR:
            return
        voices.setdefault(voice, []).append([round(t, 3), int(m), round(d, 3), int(v)])
        stats[voice] = stats.get(voice, 0) + 1

    for (voice, ch, vs, prep) in parts:
        src = [n for n in notes_of(chans, ch)]
        if not src:
            continue
        if prep:
            src = prep(src)
        for n in src:
            bar = n['t'] / BAR_SRC + 1.0     # 1-based 小节号
            if not any(b0 <= bar < b1 for (b0, b1) in CUT):
                continue
            # ch4 在 61-78 与 ch10 完全同谱：去掉重复
            if ch == 4 and 59 <= bar < 79:
                continue
            # ch6 只在 A' 段出现
            if ch == 6 and not (38 <= bar < 59):
                continue
            vv = voice
            if ch == 4:
                vv = 'pad' if 20 <= bar < 34 else 'harm'
            sec = sec_of(bar)
            vdyn = 1.0
            if sec == 'A':
                if vv in A_SPARSE and not (A_SOFT_HARM and vv == 'harm'):
                    continue
                vdyn = 0.42 if (A_SOFT_HARM and vv == 'harm') else A_DYN.get(vv, 1.0)
            t = warp(n['t'])
            d = warp_dur(n['t'], n['d'])
            vel = int(round(n['v'] * vs * SEC_DYN.get(sec, 1.0) * vdyn))
            vel = max(12, min(127, vel))
            put(vv, t, int(n['m']), d, vel)

    # 排序 + 去掉同 voice 同刻同音高的重复
    for vname in list(voices):
        seen, out = set(), []
        for n in sorted(voices[vname], key=lambda x: (x[0], x[1])):
            k = (n[0], n[1])
            if k in seen:
                continue
            seen.add(k)
            out.append(n)
        voices[vname] = out
        stats[vname] = len(out)

    # 原谱开头有 2.4s 空白：把第一个音提到 0.6s，尾巴正好折进循环开头
    LEAD_IN = 0.6
    tmin = min(n[0] for ns in voices.values() for n in ns)
    shift = LEAD_IN - tmin
    for ns in voices.values():
        for n in ns:
            n[0] = round(n[0] + shift, 3)
    global DURATION
    DURATION = round(max(n[0] for ns in voices.values() for n in ns) + 3.4, 2)

    # ---------------------------------------------------------------- 回退合成数据
    # WAV 加载失败时用 audio.js 的振荡器代奏：只保留旋律 / 贝斯 / 和声 / 钟琴
    FB = [
        ('lead', 'sine', 0.13),
        ('harm', 'sine', 0.055),
        ('glass', 'sine', 0.026),
        ('bass', 'triangle', 0.075),
    ]
    tracks = []
    for (vname, wave, gain) in FB:
        ns = voices.get(vname) or []
        if ns:
            tracks.append(dict(wave=wave, gain=gain, notes=ns))

    def num(x):
        s = ('%.3f' % float(x)).rstrip('0').rstrip('.')
        return s if s not in ('', '-0') else '0'

    def js_notes(ns):
        return '[' + ','.join('[%s,%d,%s,%d]' % (num(t), m, num(d), v) for (t, m, d, v) in ns) + ']'

    head = """// 由 tools/build/build_festival_ending.py 生成，请勿手改。
// 《今宵未尽的祭典》—— 八音盒版《魔法少女達の百年祭》（整曲 / EXTRA 结局）
// 成品音频由 tools/build/_make_festival_wav.py 渲染，这里的 tracks 是加载失败时的回退。
export const EXTRA_ENDING = {
  endingW: {
    title: '今宵未尽的祭典',
    duration: %s,
    bpm: %d,
    soft: true,
    tracks: [
""" % (repr(round(float(DURATION), 2)), BPM)
    body = ''.join("      { wave: '%s', gain: %s, notes: %s },\n" % (
        t['wave'], repr(t['gain']), js_notes(t['notes'])) for t in tracks)
    js = head + body + '    ],\n  },\n};\n'

    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)

    model = dict(title='今宵未尽的祭典', bpm=BPM, duration=DURATION,
                 music_duration=round(MUSIC_DUR, 3), tail=TAIL,
                 voices={k: v for k, v in sorted(voices.items())})
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(model, f, separators=(',', ':'))

    print('BPM %d  bar %.4fs  原曲小节 %d → 输出 %.2fs（含尾音）'
          % (BPM, BAR_OUT, sum(b1 - b0 for (b0, b1) in CUT), DURATION))
    tot = 0
    for k in sorted(voices):
        ns = voices[k]
        tot += len(ns)
        print('  %-6s %5d 音  t %6.2f..%6.2f  m %3d..%3d  vel %3d..%3d'
              % (k, len(ns), ns[0][0], max(n[0] + n[2] for n in ns),
                 min(n[1] for n in ns), max(n[1] for n in ns),
                 min(n[3] for n in ns), max(n[3] for n in ns)))
    print('  合计 %d 音 / %.2fs = %.1f 音每秒' % (tot, MUSIC_DUR, tot / MUSIC_DUR))
    print('  duration %.2fs（含尾音）' % DURATION)
    print('写入 %s  %.1f KB' % (OUT_JS, len(js.encode('utf-8')) / 1024.0))
    print('写入 %s  %.1f KB' % (OUT_JSON, os.path.getsize(OUT_JSON) / 1024.0))


if __name__ == '__main__':
    main()
