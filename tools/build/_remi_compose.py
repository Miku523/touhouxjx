# -*- coding: utf-8 -*-
"""
EX 拦路《亡き王女の為のセプテット》—— 红月王座·威严编（v2）

沿用《红月下追逐不止的女仆》《恶魔之妹》v7 的做法：旋律/对位/贝斯全部逐音
来自 ZUN 原曲 MIDI（只去掉重复层与空引子），重新配器成「宫廷 / 大教堂」编制：

  4 小节新引子（管风琴踏板 + 弦乐渐强 + 羽管键琴琶音 + 钟声）
  -> 原曲 b1-82（引子 / 主题 A / 王座间奏 / 主题再现 / 半音段 / 圆舞段 / 终曲）
  -> 4 小节尾声（全奏 Bb 小调终止 + 定音鼓 + 钟声，末拍接回引子）

配器：主旋律 = 铜管（原曲小号声部）+ 弦乐同度 + 低八度加厚；和声 = 弦乐 + 合唱；
      竖琴琶音 = 原曲吉他分解；羽管键琴 = 原曲钢琴左手；低音 = 贝斯 + 低八度正弦。
鼓组全部重写：定音鼓式底鼓、军鼓进行曲、通鼓/定音鼓过门、吊镲、ride、反向吊镲。

用法：python tools/build/_remi_compose.py
"""
import os
import sys
import json
import bisect
import types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools'))

import _ex_arrange as EX                      # noqa: E402

def _num(x):
    s = ('%.4f' % float(x)).rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'

def notes_js(notes):
    return '[' + ','.join('[%s,%d,%s,%d]' % (_num(n[0]), int(n[1]), _num(n[2]), int(n[3]))
                          for n in notes) + ']'

def drums_js(evs):
    out = []
    for e in evs:
        if len(e) > 3:
            out.append('[%s,%d,%d,%s]' % (_num(e[0]), int(e[1]), int(e[2]), _num(e[3])))
        else:
            out.append('[%s,%d,%d]' % (_num(e[0]), int(e[1]), int(e[2])))
    return '[' + ','.join(out) + ']'

MIDI_NAME = '13. Septette for a Dead Princess (ZUN).mid'
TITLE = '亡き王女の為のセプテット（红月王座编）'
SRC = os.path.join(ROOT, 'src', 'engine', 'songs', 'remilia_septette.js')
JSN = os.path.join(HERE, '_remi_lead', 'song.json')

BPM = 145.0
BAR0 = 60.0 / BPM * 4.0          # 新引子/尾声的小节长（145 BPM 4/4）

import midi2js as M2
chans, bar_t, _bt = EX.load(MIDI_NAME)
_m = M2.parse_midi(os.path.join(EX.MIDI_DIR, MIDI_NAME))
_ch, _segs, _div = M2.extract_channels(_m)

def tick_at(t):
    return M2.tick_to_sec(_segs, _div, int(round(t)))

# 原 MIDI 的节奏网格整体比文件小节线晚 440 tick：
# 所有 note-on 都落在 tick % 480 == 440 上，底鼓/开镲只有按 440 偏移才落拍。
MUSIC0 = 2360        # 原曲第 1 小节真实起点（tick）
GRID = 1920          # 4/4 一小节 tick
SHIFT = tick_at(MUSIC0)
END_TICK = MUSIC0 + 81 * GRID          # 原曲 81 小节（末和弦）之后收束
BODY = tick_at(END_TICK) - SHIFT
INTRO = 4 * BAR0
OUT = INTRO + BODY
DUR = round(OUT + 4 * BAR0, 3)

def nb_start(nb):
    if nb <= 4:
        return (nb - 1) * BAR0
    if nb <= 86:
        return INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID) - SHIFT)
    return OUT + (nb - 86) * BAR0

NB0 = [round(nb_start(nb), 5) for nb in range(0, 96)]

def T(nb, beat=0.0):
    if nb <= 4:
        return round((nb - 1) * BAR0 + beat * BAR0 / 4.0, 4)
    if nb <= 85:
        return round(INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID + beat * 480) - SHIFT), 4)
    return round(OUT + (nb - 86) * BAR0 + beat * BAR0 / 4.0, 4)

def BL(nb):
    return (NB0[nb + 1] - NB0[nb]) / 4.0

def orig_t(b):
    return tick_at(MUSIC0 + (b - 1) * GRID) - SHIFT

# 原曲小节号 -> 时间（用于 MIDI 声部的分段力度窗）
ORIG0 = [round(orig_t(b), 5) for b in range(0, 92)]

def orig_bar(t):
    return max(0, bisect.bisect_right(ORIG0, t + 1e-6) - 1)

TRACKS = []       # 每项 dict(name, wave, gain, notes)

def track(name, wave, gain):
    t = types.SimpleNamespace(name=name, wave=wave, gain=gain, notes=[])
    TRACKS.append(t)
    return t

# ---------------------------------------------------------------- MIDI 声部
def midi_layer(L):
    """取一条原曲通道，按分段力度窗处理后平移到新时间轴。"""
    ns = EX.layer_notes(chans, L, 0, SHIFT, BODY)
    wins = [(orig_t(b0), orig_t(b1), k)
            for (b0, b1, k) in L.get('wins', [])]
    out = []
    for n in ns:
        m = 1.0
        if wins:
            m = 0.0
            for (w0, w1, k) in wins:
                if w0 <= n['t'] < w1:
                    m = k
                    break
        v = int(round(n['v'] * m))
        if v <= 0:
            continue
        out.append([round(n['t'] + INTRO, 4), n['m'], round(n['d'], 4), min(127, v)])
    out.sort(key=lambda x: (x[0], x[1]))
    return out

W = lambda *pairs: list(pairs)

def main():
    # ---- 声部表：name 决定离线渲染音色；wave 供游戏内合成回退
    lead = track('brass', 'square', 0.190)
    lead.notes += midi_layer(dict(ch=3, poly=3, wins=W(
        (1, 9, 0.0), (9, 17, 0.95), (17, 25, 0.85), (25, 41, 1.0),
        (41, 49, 0.95), (49, 65, 0.88), (65, 92, 1.0))))
    lead_s = track('strings', 'sawtooth', 0.062)
    lead_s.notes += midi_layer(dict(ch=3, poly=2, wins=W(
        (1, 25, 0.0), (25, 65, 0.8), (65, 92, 0.9))))
    lead_l = track('counter', 'triangle', 0.068)
    lead_l.notes += midi_layer(dict(ch=10, poly=2, wins=W(
        (1, 25, 0.0), (25, 49, 0.7), (49, 65, 0.62), (65, 92, 0.85))))

    strings = track('strings', 'sawtooth', 0.115)
    strings.notes += midi_layer(dict(ch=4, poly=4, wins=W(
        (1, 9, 0.45), (9, 25, 0.8), (25, 65, 1.0), (65, 92, 1.0))))
    choir = track('choir', 'sine', 0.066)
    choir.notes += midi_layer(dict(ch=4, poly=3, wins=W(
        (1, 25, 0.0), (25, 49, 0.45), (49, 65, 0.75), (65, 92, 0.85))))
    piano = track('piano', 'sine', 0.080)
    piano.notes += midi_layer(dict(ch=2, poly=3, max_dur=2.0, wins=W(
        (1, 9, 1.0), (9, 17, 0.8), (17, 25, 0.85), (25, 65, 0.72), (65, 92, 0.72))))
    pno_in = track('piano', 'sine', 0.040)
    pno_in.notes += midi_layer(dict(ch=8, poly=2, max_dur=2.5, wins=W((1, 9, 1.0))))
    harpsi = track('harpsi', 'square', 0.058)
    harpsi.notes += midi_layer(dict(ch=13, poly=2, max_dur=1.5, wins=W(
        (1, 17, 1.0), (17, 65, 0.6), (65, 92, 0.65))))
    arp = track('arp', 'sine', 0.045)
    arp.notes += midi_layer(dict(ch=5, max_dur=1.0, wins=W((9, 49, 0.85))))
    cnt6 = track('counter', 'triangle', 0.040)
    cnt6.notes += midi_layer(dict(ch=6, poly=2, wins=W((25, 42, 0.8))))
    cnt7 = track('brass', 'square', 0.032)
    cnt7.notes += midi_layer(dict(ch=7, poly=2, wins=W((25, 42, 0.75))))
    bass = track('bass', 'triangle', 0.082)
    bass.notes += midi_layer(dict(ch=1, mono=True, max_dur=4.0, wins=W((1, 92, 1.0))))
    sub = track('bass', 'sine', 0.015)
    sub.notes += midi_layer(dict(ch=1, mono=True, max_dur=4.0, tr=-12, wins=W((1, 92, 1.0))))
    stab = track('brass', 'square', 0.055)
    stab.notes += midi_layer(dict(ch=11, poly=2, max_dur=0.5, wins=W(
        (17, 25, 0.9), (25, 49, 0.65), (49, 92, 0.45))))
    organ = track('pad', 'sine', 0.082)
    organ.notes += midi_layer(dict(ch=14, poly=3, wins=W((49, 66, 0.9))))
    strhi = track('strings', 'sawtooth', 0.075)
    strhi.notes += midi_layer(dict(ch=12, poly=2, wins=W((49, 92, 0.8))))
    # 终曲（原曲 b65-81 = 新 69-85）高音弦乐八度加倍：让 ff 段的天顶亮起来
    _f0, _f1 = T(69, 0), T(86, 0)
    for n in list(lead.notes):
        if _f0 <= n[0] < _f1 and n[1] + 12 <= 100:
            strhi.notes.append([n[0], n[1] + 12, n[2], int(n[3] * 0.6)])
    # 终曲主旋律再抬 0.9dB：让「王座」那一段真正由小号领奏
    for n in lead.notes:
        if _f0 <= n[0] < _f1:
            n[3] = min(127, int(round(n[3] * 1.10)))

    # ---- 新写素材：引子 / 尾声 / 钟声
    bell = track('bell', 'sine', 0.105)
    pad = track('pad', 'sine', 0.070)
    swell = track('strings', 'sawtooth', 0.085)
    tutti = track('brass', 'square', 0.110)
    chor2 = track('choir', 'sine', 0.060)
    ped = track('bass', 'triangle', 0.080)

    def W_(tr, nb, beat, p, d, v):
        tr.notes.append([T(nb, beat), p, round(d, 4), int(v)])

    # 引子 1-4：Bb 小调管风琴踏板 + 弦乐渐强 + 羽管键琴琶音 + 钟
    W_(ped, 1, 0, 34, 4 * BL(1) * 0.98, 78)
    W_(ped, 2, 0, 34, 4 * BL(2) * 0.98, 74)
    W_(ped, 3, 0, 30, 4 * BL(3) * 0.98, 82)
    W_(ped, 4, 0, 29, 2 * BL(4) * 0.98, 84)
    W_(ped, 4, 2, 34, 2 * BL(4) * 0.98, 88)
    W_(pad, 1, 0, 46, 4 * BL(1), 56)
    W_(pad, 1, 0, 41, 4 * BL(1), 50)
    W_(pad, 2, 0, 46, 4 * BL(2), 52)
    W_(pad, 2, 0, 41, 4 * BL(2), 46)
    W_(pad, 3, 0, 42, 4 * BL(3), 58)
    W_(pad, 3, 0, 37, 4 * BL(3), 52)
    W_(pad, 4, 0, 41, 4 * BL(4), 60)
    W_(pad, 4, 0, 36, 4 * BL(4), 54)
    W_(swell, 1, 0, 58, 4 * BL(1), 52)
    W_(swell, 1, 0, 65, 4 * BL(1), 48)
    W_(swell, 2, 0, 58, 4 * BL(2), 56)
    W_(swell, 2, 0, 65, 4 * BL(2), 52)
    W_(swell, 3, 0, 54, 4 * BL(3), 62)
    W_(swell, 3, 0, 61, 4 * BL(3), 58)
    W_(swell, 4, 0, 53, 2 * BL(4), 70)
    W_(swell, 4, 2, 58, 2 * BL(4), 76)
    W_(swell, 4, 2, 65, 2 * BL(4), 72)
    # 羽管键琴 16 分琶音（引子）
    for (nb, tones) in ((2, [46, 53, 58, 61, 65]), (3, [42, 49, 54, 58, 61]),
                        (4, [41, 48, 53, 57, 60])):
        seq = []
        for i in range(4):
            seq += tones[:4]
        for i, p in enumerate(seq[:8]):
            W_(harpsi, nb, i * 0.5, p + (12 if i % 4 == 3 else 0), 0.45, 40 + (i % 2) * 8)
    # 钟声
    for (nb, v) in ((1, 74), (13, 78), (29, 80), (53, 82), (69, 86), (86, 96), (88, 58)):
        W_(bell, nb, 0, 58, 3.6, v)
        W_(bell, nb, 0, 70, 3.2, int(v * 0.66))
        W_(bell, nb, 0, 82, 2.6, int(v * 0.42))
        W_(bell, nb, 0, 46, 5.0, int(v * 0.5))

    # 引子 II（新 5-12 = 原曲 b1-8）：管风琴和弦 + 低音踏板，把开场的宫廷体量撑起来
    CH = {('Eb', 'm'): (39, [51, 54, 58]), ('B', 'M'): (35, [47, 51, 54]),
          ('Db', 'M'): (37, [49, 53, 56])}
    intro2_seq = [(5, 'Eb'), (7, 'B'), (9, 'Db'), (11, 'Eb')]
    for (nb, root) in intro2_seq:
        rt, tones = CH[(root, 'm')] if root == 'Eb' else CH[(root, 'M')]
        dur = 2 * BL(nb) * 0.99
        for i, p in enumerate(tones):
            W_(pad, nb, 0, p, dur, 44 - i * 3)
            W_(swell, nb, 0, p + 12, dur, 34 - i * 2)
        W_(ped, nb, 0, rt, 2 * BL(nb) * 0.96, 72)
        W_(ped, nb + 1, 0, rt, 2 * BL(nb) * 0.96, 64)
        W_(pad, nb, 0, rt + 12, dur, 36)

    # 圣咏段（新 53-68 = 原曲 b49-64）16' 管风琴踏板：Eb1 / Bb1 循环
    for nb, root in ((53, 27), (57, 34), (61, 27), (65, 34)):
        for k in range(4):
            W_(ped, nb + k, 0, root, 4 * BL(nb + k) * 0.97, 66 - k * 2)
            if k % 2 == 1:
                W_(ped, nb + k, 2, root + 7, 2 * BL(nb + k) * 0.95, 52)

    # 终曲（新 69-85）每小节管风琴持续音：取该小节最低贝斯音高八度，撑住 ff 段的体量
    for nb in range(69, 86):
        _b0, _b1 = T(nb, 0), T(nb + 1, 0) if nb < 89 else DUR
        _lo = [n[1] for n in bass.notes if _b0 - 0.01 <= n[0] < _b1]
        if not _lo:
            continue
        _p = min(_lo) + 12
        _v = 52 if nb in (69, 73, 77, 81, 85) else 44
        W_(pad, nb, 0, _p, (_b1 - _b0) * 0.99, _v)
        if nb in (69, 73, 77, 81, 85):
            W_(ped, nb, 0, _p - 12, (_b1 - _b0) * 0.99, 56)

    # 尾声 86-89：全奏 Bb 小调终止
    W_(tutti, 86, 0, 58, 2.0, 104)
    W_(tutti, 86, 0, 62, 2.0, 96)
    W_(tutti, 86, 0, 65, 2.0, 100)
    W_(tutti, 86, 0, 70, 2.0, 92)
    W_(tutti, 87, 0, 58, 4 * BL(88) * 0.9, 66)
    W_(tutti, 87, 0, 65, 4 * BL(88) * 0.9, 60)
    W_(chor2, 86, 0, 46, 2.0, 84)
    W_(chor2, 86, 0, 53, 2.0, 80)
    W_(chor2, 86, 0, 58, 2.0, 76)
    W_(chor2, 87, 0, 46, 4 * BL(88) * 0.9, 54)
    W_(chor2, 87, 0, 53, 4 * BL(88) * 0.9, 50)
    W_(swell, 86, 0, 34, 2.0, 92)
    W_(swell, 86, 0, 41, 2.0, 84)
    W_(swell, 87, 0, 34, 4 * BL(88) * 0.9, 60)
    W_(pad, 87, 0, 34, 4 * BL(88), 54)
    W_(pad, 88, 0, 34, 4 * BL(89), 40)
    W_(pad, 89, 0, 34, 4 * BL(90) * 0.98, 32)
    W_(ped, 86, 0, 34, 2.0, 92)
    W_(ped, 87, 0, 34, 4 * BL(88), 62)
    W_(ped, 88, 0, 30, 4 * BL(89), 44)
    W_(ped, 89, 0, 29, 4 * BL(90) * 0.98, 40)

    # ---- 鼓组
    D = []

    def dr(nb, beat, kind, vel, span=None):
        ev = [T(nb, beat), kind, int(vel)]
        if span is not None:
            ev.append(round(span, 3))
        D.append(ev)

    def roll(nb, beat, beats, vel):
        dr(nb, beat, 9, vel, beats * BL(nb))

    # 引子 1-4
    dr(1, 0, 4, 96); dr(1, 0, 0, 104)
    dr(2, 0, 0, 88); dr(2, 2, 0, 74)
    dr(3, 0, 0, 92); dr(3, 2, 0, 78)
    dr(4, 0, 0, 96); roll(4, 2.0, 2.0, 72); dr(5, 0, 8, 96)
    # 引子 II（原曲 b1-8）
    for nb in range(5, 13):
        dr(nb, 0, 0, 84)
        if nb % 2 == 1:
            dr(nb, 2, 0, 70)
    dr(5, 0, 4, 88); dr(9, 0, 4, 84)
    roll(12, 2.0, 2.0, 76); dr(13, 0, 8, 96)
    # 主题 A（原曲 b9-16）：只有底鼓与钟，先不进军鼓
    for nb in range(13, 21):
        dr(nb, 0, 0, 100); dr(nb, 2, 0, 92)
        if nb >= 17:
            for i in range(8):
                dr(nb, i * 0.5, 2, 26)
    dr(13, 0, 4, 100)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(20, 2.0 + i * 0.25, k, 78 + i * 4)
    # 王座间奏（原曲 b17-24）：四踩 + 反拍开镲
    for nb in range(21, 29):
        dr(nb, 0, 0, 104); dr(nb, 1, 0, 90); dr(nb, 2, 0, 98); dr(nb, 3, 0, 90)
        for b in (0.5, 1.5, 2.5, 3.5):
            dr(nb, b, 3, 58)
        dr(nb, 1, 1, 90); dr(nb, 3, 1, 94)
    dr(21, 0, 4, 104)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(28, 2.0 + i * 0.25, k, 84 + i * 4)
    dr(29, 0, 8, 90)
    # 主题再现 A2（原曲 b25-32）：进行曲
    for nb in range(29, 37):
        dr(nb, 0, 0, 106); dr(nb, 2, 0, 102)
        dr(nb, 1, 1, 94); dr(nb, 3, 1, 96)
        for i in range(8):
            dr(nb, i * 0.5, 2, 30)
    dr(29, 0, 4, 106)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(32, 2.0 + i * 0.25, k, 82 + i * 4)
    dr(33, 0, 8, 92)
    # A3（原曲 b33-40）：加 ride
    for nb in range(37, 45):
        dr(nb, 0, 0, 106); dr(nb, 2, 0, 102); dr(nb, 2.5, 0, 88)
        dr(nb, 1, 1, 94); dr(nb, 3, 1, 96)
        for i in range(8):
            dr(nb, i * 0.5, 7, 42)
        if nb >= 41:
            dr(nb, 3.5, 3, 46)
    dr(37, 0, 4, 106)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(40, 2.0 + i * 0.25, k, 86 + i * 4)
    roll(44, 2.0, 2.0, 84); dr(45, 0, 8, 96)
    # 半音段（原曲 b41-48）
    for nb in range(45, 53):
        dr(nb, 0, 0, 108); dr(nb, 1, 0, 92); dr(nb, 2, 0, 104); dr(nb, 3, 0, 92)
        dr(nb, 3.5, 0, 86)
        dr(nb, 1, 1, 98); dr(nb, 3, 1, 100)
        for b in (0.5, 1.5, 2.5, 3.5):
            dr(nb, b, 3, 48)
    dr(45, 0, 4, 108)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(48, 2.0 + i * 0.25, k, 88 + i * 4)
    roll(52, 2.0, 2.0, 86); dr(53, 0, 8, 100)
    # 圆舞段（原曲 b49-64）：宏大
    for nb in range(53, 69):
        dr(nb, 0, 0, 110); dr(nb, 2, 0, 106)
        dr(nb, 1, 1, 96); dr(nb, 3, 1, 98)
        for i in range(8):
            dr(nb, i * 0.5, 7, 46)
    for nb in (53, 61):
        dr(nb, 0, 4, 110)
    for nb in (56, 60, 64):
        for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
            dr(nb, 2.0 + i * 0.25, k, 80 + i * 4)
    for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
        dr(68, 1.0 + i * 0.25, k, 80 + i * 4)
    roll(68, 2.5, 1.5, 88); dr(69, 0, 8, 104)
    # 终曲（原曲 b65-81）：全曲最重
    for nb in range(69, 86):
        dr(nb, 0, 0, 90); dr(nb, 2, 0, 88); dr(nb, 3.5, 0, 82)
        dr(nb, 1, 1, 88); dr(nb, 3, 1, 90)
        for i in range(8):
            dr(nb, i * 0.5, 7, 44)
        if nb >= 77:
            dr(nb, 1.5, 0, 88)
    for nb in (69, 73, 77, 81):
        dr(nb, 0, 4, 112)
    for nb in (72, 76, 80):
        for i, k in enumerate((6, 6, 5, 5, 6, 6, 5, 5)):
            dr(nb, 2.0 + i * 0.25, k, 86 + i * 4)
    roll(84, 2.0, 2.0, 96); roll(85, 0.0, 2.0, 100)
    # 尾声 86-89
    dr(86, 0, 4, 120); dr(86, 0, 0, 118); dr(86, 0, 5, 104); dr(86, 2.5, 5, 92)
    dr(87, 0, 0, 92); dr(87, 2, 5, 80)
    dr(89, 0, 0, 76)

    # ---- 写盘
    TRACKS[:] = [dict(name=t.name, wave=t.wave, gain=t.gain, notes=t.notes) for t in TRACKS]
    for t in TRACKS:
        t['notes'].sort(key=lambda n: (n[0], n[1]))
        for n in t['notes']:
            if n[0] + n[2] > DUR:
                n[2] = round(max(0.05, DUR - n[0]), 4)
        t['notes'] = [n for n in t['notes'] if n[0] < DUR]
    D.sort(key=lambda x: (x[0], x[1]))
    D = [d for d in D if 0 <= d[0] < DUR]

    lines = []
    lines.append('/**')
    lines.append(' * EX 拦路《%s》—— 红月下威严满满的蕾米莉亚 / 十六夜之主的王座。' % TITLE)
    lines.append(' * %.1f BPM, 降 B 小调, 4/4, 89 小节 = %.1fs 循环。' % (BPM, DUR))
    lines.append(' * 旋律、对位、贝斯、琶音全部逐音来自 ZUN 原曲 MIDI（去掉重复层与 80 tick 偏移），')
    lines.append(' * 用铜管 / 弦乐 / 合唱 / 管风琴 / 羽管键琴 / 钢琴 / 竖琴 / 钟重新配器；鼓组全部重写：')
    lines.append(' * 定音鼓式底鼓、军鼓进行曲、通鼓过门、吊镲、ride、反向吊镲。')
    lines.append(' *   引子 1-4（管风琴踏板 + 弦乐渐强 + 钟）')
    lines.append(' *   原曲 b1-81 -> 新 b5-85（引子 / 主题 A / 王座间奏 / 主题再现 / 半音段 / 圆舞段 / 终曲）')
    lines.append(' *   尾声 86-89（全奏 Bb 小调终止 + 定音鼓 + 钟，末拍接回引子）')
    lines.append(' * tools/build/_remi_compose.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const REMILIA_EX = {')
    lines.append('  ex_mid: {')
    lines.append("    title: '%s'," % TITLE)
    lines.append('    duration: %s,' % ('%.3f' % DUR).rstrip('0').rstrip('.'))
    lines.append('    bpm: %g,' % BPM)
    lines.append('    warm: true,')
    lines.append('    tracks: [')
    for t in TRACKS:
        if not t['notes']:
            continue
        g = ('%.3f' % t['gain']).rstrip('0').rstrip('.')
        lines.append("      { name: '%s', wave: '%s', gain: %s, notes: %s },"
                     % (t['name'], t['wave'], g, notes_js(t['notes'])))
    lines.append('    ],')
    lines.append('    drums: %s,' % drums_js(D))
    lines.append('  },')
    lines.append('};')
    os.makedirs(os.path.dirname(SRC), exist_ok=True)
    with open(SRC, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    os.makedirs(os.path.dirname(JSN), exist_ok=True)
    with open(JSN, 'w', encoding='utf-8') as f:
        json.dump(dict(title=TITLE, duration=DUR, bpm=BPM,
                       tracks=[dict(name=t['name'], wave=t['wave'], gain=t['gain'],
                                    notes=t['notes']) for t in TRACKS if t['notes']],
                       drums=D), f, ensure_ascii=False)
    tot = sum(len(t['notes']) for t in TRACKS)
    print('[remi] %s  %.2fs  %d 轨  %d 音  %d 鼓  %.0fKB' % (
        os.path.basename(SRC), DUR, len([t for t in TRACKS if t['notes']]), tot,
        len(D), os.path.getsize(SRC) / 1024.0))
    for t in TRACKS:
        if t['notes']:
            ps = [n[1] for n in t['notes']]
            print('   %-9s %5d 音  %3d-%3d  gain %.3f' % (t['name'], len(t['notes']),
                                                          min(ps), max(ps), t['gain']))
    kinds = {}
    for d in D:
        kinds[d[1]] = kinds.get(d[1], 0) + 1
    print('   drums kinds', dict(sorted(kinds.items())))


if __name__ == '__main__':
    main()
