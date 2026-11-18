# -*- coding: utf-8 -*-
"""tools/build/_yuk_compose.py —— PH Boss《ネクロファンタジア（隙間妖蝶編）》

场景：红叶与隙间 · 紫的边境——她只把扇子合上，月亮就换了位置。
原曲：ZUN TH07「ネクロファンタジア」164 BPM / 4-4 / 116 小节 / 降 B 小调起，
      中段转 G 小调、B 大调，副歌 B 小调，末段升调回降 B 小调，尾声降 B 大调（皮卡迪三度）。
编法：原曲 2-116 小节逐音搬入 → 新 7-121；前后各加 6 小节新写引子 / 4 小节悬置尾声。
      全 12,626 音一个不改，重复通道（ch4/5 叠主旋律、ch8 叠低音琶音、ch15 叠弦乐）
      拆成不同音色做自然加倍；原曲没有鼓通道，鼓组整套手写。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song  # noqa: F401
from _pret_engine import Eng
from _pret_post import sub_pedal

CFG = dict(
    name='yukari_ph', title='ネクロファンタジア（隙間妖蝶編）', export='YUKARI_PH',
    keyname='ph_boss', bpm=172.0, src='necrofantasia', nbars=125,
    # 收尾秒数覆盖：主旋律/对位不再拖 0.2s 尾巴（A 段半音级进会撞成小二度），
    # 弦乐长音也不再把和弦糊到后面几拍（原曲 ch3/ch15 长音可达 1.4s）。
    tail={'lead': 0.05, 'counter': 0.05, 'brass': 0.10,
          'strings': 0.14, 'choir': 0.14, 'pad': 0.18},
    drum_ch=-1,                      # 原曲没有鼓通道（ch9 是低音），关掉鼓通道路由
    segs=[
        ('A',  2, 17,  7, {'dyn': 0.97}),
        # B 段原曲主旋律只写在 ch3/ch6/ch15（都是弦乐），补一条 lead 让它站到前面
        ('B', 18, 33, 23, {'dyn': 0.89, 'add': {6: [('lead', 0, 0.90, 1.0)]}}),
        ('A2', 34, 49, 39, {'dyn': 1.00}),
        # C/C2 副歌：主旋律（ch12）上面再加一层 +12 的铃，给副歌镶边
        ('C', 50, 65, 55, {'dyn': 1.00, 'add': {12: [('bell', 12, 0.42, 1.0)]}}),
        ('C2', 66, 81, 71, {'dyn': 1.02, 'add': {12: [('bell', 12, 0.50, 1.0)]}}),
        ('D', 82, 97, 87, {'dyn': 1.06}),
        ('D2', 98, 113, 103, {'dyn': 1.11}),
        ('END', 114, 116, 119, {'dyn': 1.02}),
    ],
    dyn={},
    voice={
        0:  [('lead', 0, 1.00, 1.00)],
        # 原曲 ch1 力度 105-124，比 ch0(63-98) 还响 3.5dB——它才是 A 段听得见的
        # 上层主旋律线。旧版把它压到 0.60，等于把「旋律」换成内声部 → 听着跑调。
        1:  [('counter', 0, 1.25, 1.00)],
        # 原曲 ch2/ch8 是 512+512 个十六分钢琴（力度 ~116），A 段的「墙」全靠它。
        # 旧版用 harpsi(0.55)+arp(0.26) 几乎没有击弦瞬态 → 空、薄、没有震撼。
        2:  [('piano', 0, 0.42, 1.00), ('harpsi', 0, 1.05, 1.00)],
        3:  [('strings', 0, 0.60, 1.05)],
        4:  [('lead', 0, 0.55, 1.00)],       # ch4 = ch0 同音重复（钢琴双轨）→ 并进主旋律
        5:  [('counter', 0, 0.70, 1.00)],   # ch5 = ch1 同音重复
        6:  [('strings', 0, 0.40, 1.00)],
        7:  [('piano', 0, 0.55, 1.00), ('harpsi', 0, 0.92, 1.00), ('arp', 0, 0.30, 1.00)],
        8:  [('piano', 0, 0.32, 1.00), ('harpsi', 0, 0.78, 1.00)],
        9:  [('bass', 0, 1.00, 1.00)],
        10: [('bell', 0, 0.29, 1.00), ('brass', 0, 0.34, 1.00)],
        11: [('piano', 0, 0.55, 1.00), ('harpsi', 0, 0.88, 1.00), ('arp', 0, 0.34, 1.00)],
        12: [('lead', 0, 0.95, 1.00)],
        15: [('strings', 0, 0.32, 1.00)],
    },
)

TRACKS = [
    # v10 配平：主旋律/对位必须压过十六分织体（旧版 piano -9.7dB 比 lead -20.1 高 10dB，
    # 旋律被埋 → 听感「平、没有震撼」）。数值按 metrics 里的实测 RMS 反推。
    ('lead',    'square',   0.560),
    ('counter', 'square',   0.470),
    ('brass',   'sawtooth', 0.235),
    ('strings', 'sawtooth', 0.200),
    ('harpsi',  'square',   0.150),
    ('piano',   'piano',    0.078),
    ('arp',     'sine',     0.185),
    ('bell',    'sine',     0.195),
    ('choir',   'sine',     0.095),
    ('pad',     'sine',     0.105),
    ('bass',    'triangle', 0.255),
    ('sub',     'sine',     0.095),
    ('riser',   'sawtooth', 0.045),
    ('reverse', 'sawtooth', 0.040),
]

# 降 B 小调：Bb C Db Eb F Gb Ab
BBM = [46, 48, 49, 51, 53, 54, 56, 58, 60, 61, 63, 65, 66, 68, 70, 73, 75, 77, 78, 80]
BBM_CH = [46, 53, 58, 62, 65, 70, 73, 77]        # Bb F Bb Db F Bb Db F（跨三个八度的琶音柱）


def arp16(s, track, bar, seq, n=16, step=0.25, v=50, d=0.18, start=0.0):
    for i in range(n):
        m = seq[i % len(seq)]
        s.add(track, s.bt(bar, start + i * step), m, d, v)


def intro(eng):
    s = eng.song
    # ---- 低音 drone（Bb 的隙间在呼吸）
    for b in (1, 3, 5):
        L = 2 * s.bar_len(b) * 0.98
        for m, v in ((34, 54), (41, 48), (46, 42)):
            s.add('pad', s.bt(b), m, L, v)
    # ---- 远处的铃：主题头的四个音，像从隙间漏出来
    for bar, beat, m, v in ((1, 2.0, 73, 44), (2, 0.0, 70, 52), (2, 0.75, 75, 56),
                            (2, 1.5, 78, 58), (2, 2.25, 73, 54), (3, 0.0, 77, 58),
                            (3, 0.75, 80, 60), (3, 2.5, 78, 48)):
        s.add('bell', s.bt(bar, beat), m, 0.9, v)
    # ---- 弦乐：从很淡的和弦开始铺
    for bar, vel in ((3, 44), (4, 54), (5, 64), (6, 78)):
        for m in (46, 53, 58):
            s.add('strings', s.bt(bar), m, s.bar_len(bar) * 0.96, vel)
    # ---- 大键琴：16 分琶音从隙间爬上来的手
    for bar, vel in ((4, 44), (5, 54), (6, 68)):
        arp16(s, 'harpsi', bar, BBM_CH, v=vel, d=0.16)
        arp16(s, 'harpsi', bar, BBM_CH[6::-1] + BBM_CH[-2:], n=16, step=0.25, v=vel - 8, d=0.16, start=2.0)
    # ---- 倒数两小节：合唱推上来 + 上升音效
    for m in (58, 62, 65):
        s.add('choir', s.bt(5, 2.0), m, 2 * s.bar_len(5) * 0.7, 44)
    s.add('riser', s.bt(6, 1.0), 34, 2.6 * s.beat, 78)
    s.add('reverse', s.bt(6, 2.5), 34, 1.2 * s.beat, 66)
    # ---- 第 6 小节：定音鼓滚奏把门撞开
    s.drum(s.bt(6, 2.0), 9, 76, span=2.0 * s.beat)
    s.drum(s.bt(6, 3.5), 4, 74)
    s.drum(s.bt(6, 3.5), 0, 96)
    s.section('intro', 1, 6)


def coda(eng):
    """原曲 114-115 已经落定降 B 大三和弦（皮卡迪三度）。
    尾声不再来第二个和弦——只留下隙间的余响：
    pad drone（Bb1/Bb2/F3，与 intro 第 1 小节同色）+ 极轻弦乐泛音 + 铃一路退远。
    这样最后一小节直接接回第 1 小节的 intro drone，循环接缝处天然无缝。"""
    s = eng.song
    b0 = 122
    # pad drone：Bb1/Bb2/F3，与 intro 第 1 小节同色；v4 整体抬起来（旧版 -33.6dB 太虚）
    for bar, v in ((b0, 106), (b0 + 2, 84)):
        L = 2 * s.bar_len(bar) * 0.96
        for m, mv in ((34, v), (46, int(v * 0.86)), (53, int(v * 0.68))):
            s.add('pad', s.bt(bar), m, L, mv)
    # bass drone：给尾声一副地基（隙间不是空的，只是没有重力）
    for bar, v in ((b0, 54), (b0 + 2, 42)):
        s.add('bass', s.bt(bar), 34, 2 * s.bar_len(bar) * 0.92, v)
    # strings：上方泛音，第二遍更薄
    for m in (58, 65, 70):
        s.add('strings', s.bt(b0), m, s.bar_len(b0) * 1.9, 58)
    for m in (58, 70):
        s.add('strings', s.bt(b0 + 2), m, s.bar_len(b0) * 1.9, 44)
    # bell：主题头（大调化 Bb-Eb-G-D）一路退远，最后一音只剩一口气
    for bar, beat, m, v in ((b0 + 0.0, 0.0, 70, 62), (b0 + 0.0, 0.75, 75, 54), (b0 + 1.0, 0.0, 79, 48),
                            (b0 + 1.0, 1.5, 74, 42), (b0 + 2.0, 0.0, 82, 35), (b0 + 2.5, 0.5, 77, 29),
                            (b0 + 3.0, 0.0, 94, 24)):
        s.add('bell', s.bt(int(bar), beat), m, 1.4, v)
    # 落点：最后一小节一记远处的低铃（Bb2 + F3），把「追逐」钉在红月上
    s.add('bell', s.bt(b0 + 3), 46, 2.4, 52)
    s.add('bell', s.bt(b0 + 3), 53, 2.2, 40)
    # 鼓：定音鼓的余震，开头一下、落点一下，不再起新的重音
    s.drum(s.bt(b0), 9, 66, span=1.2 * s.beat)
    s.drum(s.bt(b0 + 3), 9, 58, span=0.9 * s.beat)
    s.section('coda', b0, b0 + 3)


def drums(eng):
    s = eng.song
    K, SN, CH, OH, CR, TL, TH, RD, RC, RL = range(10)

    BOOST = {0: 15, 1: 13, 2: 9, 3: 9, 4: 7, 5: 11, 6: 11, 7: 9, 8: 7, 9: 9}

    def d(bar, beat, kind, v):
        s.drum(s.bt(bar, beat), kind, min(126, v + BOOST.get(kind, 8)))

    def fill(bar, v=64, from_beat=2.0, kinds=(5, 6)):
        for i in range(8):
            d(bar, from_beat + i * 0.25, kinds[i % 2], v - i * 2)

    # ---- A（7-22）：稳，留出主旋律的呼吸
    for bar in range(7, 23):
        for i in range(8):
            d(bar, i * 0.5, CH, 44 if i % 2 else 50)
        d(bar, 0.0, K, 114); d(bar, 2.5, K, 104)
        d(bar, 1.0, SN, 100); d(bar, 3.0, SN, 104)
        if bar in (7, 15):
            d(bar, 0.0, CR, 84)
    fill(22, 66)

    # ---- B（23-38）：半速、悬着——紫只是侧过脸
    for bar in range(23, 39):
        for b in (0.0, 1.0, 2.0, 3.0):
            d(bar, b, RD, 50)
        d(bar, 0.5, CH, 34); d(bar, 1.5, CH, 34); d(bar, 2.5, CH, 34); d(bar, 3.5, CH, 34)
        d(bar, 0.0, K, 108); d(bar, 2.0, K, 100)
        d(bar, 3.0, SN, 92)
        if bar in (23, 31):
            d(bar, 0.0, CR, 76)
    fill(38, 70)

    # ---- A2（39-54）：原曲这里撤了低音，鼓也退到只剩影子
    for bar in range(39, 55):
        for i in range(8):
            d(bar, i * 0.5, CH, 30 if i % 2 else 36)
        d(bar, 0.0, K, 92)
        d(bar, 2.0, SN, 72)
        d(bar, 0.0, RD, 40)
        d(bar, 2.0, RD, 40)
        if bar in (39, 47):
            d(bar, 0.0, CR, 70)
    fill(54, 74)

    # ---- C（55-70）：回到正题，鼓把门推开
    for bar in range(55, 71):
        for i in range(8):
            d(bar, i * 0.5, CH, 46 if i % 2 else 52)
        d(bar, 0.0, K, 116); d(bar, 1.5, K, 100); d(bar, 2.5, K, 108)
        d(bar, 1.0, SN, 104); d(bar, 3.0, SN, 106)
        if bar % 8 == 7:
            d(bar, 3.5, OH, 58)
        if bar in (55, 63):
            d(bar, 0.0, CR, 90)
    fill(70, 78)

    # ---- C2（71-86）：十六分踩镲，一直往前
    for bar in range(71, 87):
        for i in range(16):
            d(bar, i * 0.25, CH, 34 if i % 4 else 44)
        d(bar, 0.0, K, 118); d(bar, 1.5, K, 104); d(bar, 2.5, K, 110); d(bar, 3.5, K, 96)
        d(bar, 1.0, SN, 106); d(bar, 3.0, SN, 108)
        if bar % 8 == 7:
            d(bar, 3.5, OH, 62)
        if bar in (71, 79):
            d(bar, 0.0, CR, 92)
    fill(86, 80)

    # ---- D（87-102）：四踩 + 全开
    for bar in range(87, 103):
        for b in (0.0, 1.0, 2.0, 3.0):
            d(bar, b, K, 118)
        for i in range(16):
            d(bar, i * 0.25, CH, 32 if i % 4 else 42)
        d(bar, 1.0, SN, 110); d(bar, 3.0, SN, 112)
        if bar % 4 == 3:
            d(bar, 3.5, OH, 64)
        if bar in (87, 91, 95, 99):
            d(bar, 0.0, CR, 94)
        if bar in (92, 96):
            d(bar, 3.5, TL, 88); d(bar, 3.75, TH, 92)
    fill(102, 84)

    # ---- D2（103-118）：最满，鼓组开始滚
    for bar in range(103, 119):
        for b in (0.0, 1.0, 2.0, 3.0):
            d(bar, b, K, 120)
        for i in range(16):
            d(bar, i * 0.25, CH, 34 if i % 4 else 46)
        d(bar, 1.0, SN, 112); d(bar, 3.0, SN, 114)
        if bar % 2 == 1:
            d(bar, 3.5, OH, 66)
        if bar in (103, 107, 109, 113):
            d(bar, 0.0, CR, 96)
        if bar in (110, 118):
            fill(bar, 86)
    fill(118, 88)

    # ---- END（119-121）：原曲收束，鼓只留骨架
    d(119, 0.0, CR, 98); d(119, 0.0, K, 118)
    d(119, 2.0, SN, 104)
    d(120, 0.0, K, 104); d(120, 2.0, SN, 96)
    d(121, 0.0, CR, 100); d(121, 0.0, K, 118); d(121, 2.0, SN, 92)
    fill(121, 76)


def mono_clip(song, tracks, gap=0.012):
    """把单声部音轨裁成不自我叠音：每个音的时值不超过到同轨下一个音的间隔。
    A 段主旋律是半音级进，旧版 0.2s 尾巴会让 66 还没放完 65 就进来（小二度摩擦
    听起来就是「跑调」）。"""
    for name in tracks:
        ns = sorted(song.BY.get(name) or [])
        for i in range(len(ns) - 1):
            t0, t1 = ns[i][0], ns[i + 1][0]
            lim = max(0.04, t1 - t0 - gap)
            if ns[i][2] > lim:
                ns[i][2] = round(lim, 3)


def extra(eng):
    drums(eng)
    intro(eng)
    coda(eng)
    # 主旋律弦乐齐奏（A 段与副歌），副歌再叠铜管八度——这是「女仆长」级的厚度
    eng.doubles([('strings', 0, 0.24, 1.0, 100)], 7, 121)
    eng.doubles([('brass', 0, 0.26, 1.0, 100)], 55, 118)
    eng.doubles([('bell', 12, 0.14, 0.9, 100)], 87, 118)
    # 低音踏板（63-125Hz 的地基）
    sub_pedal(eng.song, vel=76)
    # 单声部音轨不自我叠音（A 段半音级进的小二度摩擦）
    mono_clip(eng.song, ('lead', 'counter'))


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.extra_fn = extra
    eng.run()
    eng.write()


if __name__ == '__main__':
    main()