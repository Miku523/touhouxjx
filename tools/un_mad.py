# -*- coding: utf-8 -*-
"""EX 曲「U.N.オーエンは彼女なのか？」——芙兰朵露版「疯狂 / 力量 / 495 年孤独」重编。

蓝本：
  * 游戏内 EX 曲（src/engine/songs/touhou.js BOSS_SONGS.extra，时间轴 155 BPM）
    —— 主奏 / 副旋律 / 铺底 / 贝斯 原样搬进新拍速，旋律一句不改；
  * 参考曲分析 tools/build/_ref7_report.md 的五个手法：
      1. 半音邻音颤音（16 分往返，持续 ~1.1s）
      2. bII 强力和弦块（D 小调里的 D# / G#）+ 减七和弦块
      3. 底鼓真空 + 反拍踩镲还在（"地基抽走、鞭子还在"）
      4. 半音中音 riff 循环（用作 bII 段的过渡）
      5. 单音长音 + 长静音收尾（最后一击不回主和弦）
新拍速 168 BPM（参考曲实测 168/170/167），恒速，4/4，D 小调。

用法：python tools/un_mad.py            生成 src/engine/songs/un_mad.js + tools/build/_un_mad.json
      python tools/un_mad.py --check    只体检不写文件
"""
import json
import os
import sys

BPM = 168.0
BAR = 240.0 / BPM            # 1.42857s
STEP = BAR / 16.0            # 0.089286s
BARS = 104

# 游戏内原曲时间轴（155 BPM）
G_BPM = 155.0
G_BAR = 240.0 / G_BPM        # 1.548387s

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 轨道：wave / gain
TRACKS = [
    ('lead',  'square',   0.15),
    ('dbl',   'sawtooth', 0.052),
    ('bass',  'triangle', 0.21),
    ('pad',   'sine',     0.055),
    ('power', 'sawtooth', 0.06),
]
PRIO = {'lead': 0, 'dbl': 1, 'power': 2, 'pad': 3, 'bass': 4}   # 冲突时先砍 bass


class Score(object):
    def __init__(self):
        self.notes = {k: [] for k, _, _ in TRACKS}
        self.drums = []

    def add(self, trk, bar, step, midi, steps, vel):
        t = (bar + step / 16.0) * BAR
        d = max(0.03, steps * STEP)
        self.notes[trk].append([round(t, 5), int(midi), round(d, 5), int(max(1, min(127, vel)))])

    def drum(self, bar, step, kind, vel):
        self.drums.append([round((bar + step / 16.0) * BAR, 5), int(kind), int(vel)])

    # ---------- 裁剪 ----------
    def finish(self):
        out = []
        for name, wave, gain in TRACKS:
            ns = sorted(self.notes[name], key=lambda n: (n[0], -n[1]))
            mono = []
            for n in ns:
                if mono and n[0] < mono[-1][0] + mono[-1][2] - 1e-6:
                    prev_end = mono[-1][0] + mono[-1][2]
                    mono[-1][2] = max(0.03, round(n[0] - mono[-1][0] - 1e-3, 5))
                    if prev_end - mono[-1][0] < 0.03:
                        mono.pop()
                        continue
                mono.append(n)
            out.append({'wave': wave, 'gain': gain, 'notes': mono})
        # 复音上限 5（引擎 4 声部 + 本曲铺底一路，取 5）
        events = []
        for ti, tr in enumerate(out):
            for n in tr['notes']:
                events.append((n[0], n[0] + n[2], ti, n))
        events.sort(key=lambda e: (e[0], PRIO[[t[0] for t in TRACKS][e[2]]]))
        active = []
        keep = set()
        for e in events:
            active = [a for a in active if a[1] > e[0]]
            if len(active) >= 5:
                continue
            keep.add(id(e[3]))
            active.append((e[0], e[1]))
        for ti, tr in enumerate(out):
            tr['notes'] = [n for n in tr['notes'] if id(n) in keep]
        self.drums.sort(key=lambda d: d[0])
        return out


def load_game():
    p = os.path.join(ROOT, 'tools', 'build', '_old_extra.json')
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def game_bar_index(g, bar):
    return int(bar * 16)        # 以 16 分格为单位


def place(S, g, trk_name, src_trk, s0, n, t0, transpose=0, vel_mul=1.0, min_vel=1):
    """把游戏内曲 src_trk 的第 s0..s0+n 小节搬到新曲 t0 起，保持小节内位置。"""
    notes = g['tracks'][src_trk]['notes']
    k = BAR / G_BAR
    for t, m, d, v in notes:
        gb = t / G_BAR
        if gb < s0 - 1e-9 or gb >= s0 + n - 1e-9:
            continue
        nb = t0 + (gb - s0)
        S.add(trk_name, int(nb), int(round((nb - int(nb)) * 16)), m + transpose,
              max(1, d / STEP), v * vel_mul)


def bass_bar_roots(S, g, trk_name, src_trk, s0, n, t0):
    """原曲贝斯逐小节最低音，加低八度重音（力量感）。"""
    notes = g['tracks'][src_trk]['notes']
    for i in range(n):
        gbar = s0 + i
        lo = [m for t, m, d, v in notes if int(t / G_BAR) == gbar]
        if not lo:
            continue
        r = min(lo)
        S.add(trk_name, t0 + i, 0, r, 6, 105)
        if r - 12 >= 24:
            S.add(trk_name, t0 + i, 0, r - 12, 4, 78)


# ---------------- 鼓组 ----------------
def crash(S, bar, vel=100):
    S.drum(bar, 0, 4, vel)


def groove(S, bar, n, style='main', crash_every=8):
    for b in range(bar, bar + n):
        rel = b - bar
        if style == 'intro':
            S.drum(b, 0, 0, 100)
            for s in (2, 6, 10, 14):
                S.drum(b, s, 2, 52)
            if rel % 4 == 0:
                S.drum(b, 12, 3, 60)
        elif style == 'main':
            S.drum(b, 0, 0, 118)
            S.drum(b, 8, 0, 108)
            S.drum(b, 4, 1, 104)
            S.drum(b, 12, 1, 104)
            for s in range(0, 16, 2):
                S.drum(b, s, 2, 76 if s % 4 == 2 else 58)   # 8 分反拍为主
            for s in (1, 5, 9, 13):
                S.drum(b, s, 2, 30)                         # 16 分碎步，机械感
            if crash_every and rel % crash_every == 0:
                crash(S, b, 92)
        elif style == 'drive':
            S.drum(b, 0, 0, 120)
            S.drum(b, 8, 0, 112)
            S.drum(b, 6, 0, 88)      # 16 分双踩短连击
            S.drum(b, 14, 0, 88)
            S.drum(b, 4, 1, 108)
            S.drum(b, 12, 1, 108)
            for s in range(16):
                S.drum(b, s, 2, 62 if s % 4 == 2 else 40)
            if crash_every and rel % crash_every == 0:
                crash(S, b, 100)
        elif style == 'half':
            S.drum(b, 0, 0, 106)
            S.drum(b, 8, 1, 92)
            for s in (4, 12):
                S.drum(b, s, 2, 60)
            if rel % 8 == 0:
                crash(S, b, 78)
        elif style == 'vacuum':
            # 底鼓真空：整小节只剩 0.5 次底鼓，军鼓 2/4，反拍踩镲不减
            if rel % 2 == 0:
                S.drum(b, 0, 0, 92)
            S.drum(b, 4, 1, 86)
            S.drum(b, 12, 1, 86)
            for s in (2, 6, 10, 14):
                S.drum(b, s, 2, 70)
    if style in ('main', 'drive'):
        for s in range(16):
            S.drum(bar + n - 1, s, 1, 40 + s * 4)      # 段末军鼓滚


def build():
    g = load_game()
    S = Score()

    # ===== 0-7 前奏：音乐盒 + 心跳，不加鼓组 =====
    place(S, g, 'pad', 2, 34, 4, 0)
    place(S, g, 'lead', 0, 46, 4, 0, vel_mul=0.62)
    for b in range(0, 8):
        S.add('bass', b, 0, 38, 3, 74)          # D2 心跳
        S.add('bass', b, 6, 38, 2, 52)
        if b % 2 == 0:
            S.drum(b, 0, 0, 76)
        S.drum(b, 12, 3, 54)
    groove(S, 4, 4, 'intro')

    # ===== 8-17 / 18-27 招牌 riff：本曲动机，全曲最有辨识度 =====
    place(S, g, 'lead', 0, 0, 10, 8)
    place(S, g, 'dbl', 4, 0, 10, 8, vel_mul=0.9)
    place(S, g, 'pad', 2, 0, 10, 8)
    place(S, g, 'bass', 1, 0, 10, 8)
    bass_bar_roots(S, g, 'bass', 1, 0, 10, 8)
    groove(S, 8, 10, 'main')

    place(S, g, 'lead', 0, 0, 10, 18)
    place(S, g, 'dbl', 4, 0, 10, 18)
    place(S, g, 'pad', 2, 0, 10, 18)
    place(S, g, 'bass', 1, 0, 10, 18)
    bass_bar_roots(S, g, 'bass', 1, 0, 10, 18)
    groove(S, 18, 10, 'drive', crash_every=4)

    # ===== 28-37 抒情主题（原曲 10-19）=====
    place(S, g, 'lead', 0, 10, 10, 28)
    place(S, g, 'dbl', 4, 10, 10, 28, vel_mul=0.8)
    place(S, g, 'pad', 2, 4, 6, 28)
    place(S, g, 'bass', 1, 10, 10, 28)
    bass_bar_roots(S, g, 'bass', 1, 10, 10, 28)
    groove(S, 28, 10, 'half')

    # ===== 38-51 十六分狂奔（原曲 20-33）=====
    place(S, g, 'lead', 0, 20, 14, 38)
    place(S, g, 'dbl', 4, 20, 14, 38)
    place(S, g, 'pad', 2, 4, 8, 38)
    place(S, g, 'bass', 1, 20, 14, 38)
    bass_bar_roots(S, g, 'bass', 1, 20, 14, 38)
    groove(S, 38, 14, 'drive', crash_every=7)

    # ===== 52-59 bII 强力和弦块（ref7 手法 2）=====
    # 原曲 34-37 小节：鼓和贝斯整个撤掉、只剩主奏在飘 —— 正好拿来当 bII 块上的旋律
    place(S, g, 'pad', 2, 34, 4, 52)
    place(S, g, 'lead', 0, 34, 4, 52, vel_mul=0.92)
    place(S, g, 'lead', 0, 34, 4, 56, vel_mul=0.96)
    for b in range(52, 60):
        i = b - 52
        # 根音半音中音循环：Dm -> D#(bII) -> Dm -> D# -> ... 最后两小节减七
        if i < 4 or i >= 6:
            if i % 2 == 0:
                S.add('power', b, 0, 63, 4, 112)     # D#4
                S.add('power', b, 0, 68, 4, 100)     # G#4
                S.add('power', b, 8, 63, 4, 106)
                S.add('power', b, 8, 68, 4, 96)
                S.add('bass', b, 0, 39, 6, 118)      # D#2
                S.add('bass', b, 0, 51, 6, 88)       # D#3
            else:
                S.add('power', b, 0, 62, 4, 110)     # D4
                S.add('power', b, 0, 65, 4, 100)     # F4
                S.add('bass', b, 0, 38, 6, 116)      # D2
                S.add('bass', b, 0, 50, 6, 86)
        else:
            # Ddim7 (D F G# B) + 半音上行
            for m in (62, 65, 68, 71):
                S.add('power', b, 0, m, 8, 104)
                S.add('power', b, 8, m, 8, 96)
            S.add('bass', b, 0, 38, 8, 118)
            S.add('bass', b, 8, 39, 8, 108)
    groove(S, 52, 8, 'half', crash_every=4)
    for s in range(16):
        S.drum(52 + 7, s, 1, 44 + s * 4)

    # ===== 60-67 重建（原曲 38-45）=====
    place(S, g, 'lead', 0, 38, 8, 60)
    place(S, g, 'dbl', 4, 38, 8, 60, vel_mul=0.85)
    place(S, g, 'pad', 2, 38, 8, 60)
    place(S, g, 'bass', 1, 38, 8, 60)
    bass_bar_roots(S, g, 'bass', 1, 38, 8, 60)
    groove(S, 60, 8, 'main')
    for s in range(16):
        S.drum(60 + 7, s, 1, 48 + s * 4)

    # ===== 68-83 第二主题（原曲 46-61）=====
    place(S, g, 'lead', 0, 46, 16, 68)
    place(S, g, 'dbl', 4, 46, 16, 68, vel_mul=0.9)
    place(S, g, 'pad', 2, 46, 16, 68)
    place(S, g, 'bass', 1, 46, 16, 68)
    bass_bar_roots(S, g, 'bass', 1, 46, 16, 68)
    groove(S, 68, 16, 'main', crash_every=8)
    # 过渡：半音中音循环（G#m <-> A#m 的骨架，ref7 手法 4）
    for b in range(80, 84):
        S.add('power', b, 0, 68, 4, 96)   # G#4
        S.add('power', b, 0, 63, 4, 100)  # D#4
        S.add('power', b, 8, 70, 4, 92)   # A#4
        S.add('power', b, 8, 65, 4, 96)   # F4
        S.add('bass', b, 0, 39, 5, 108)
        S.add('bass', b, 8, 41, 5, 104)

    # ===== 84-95 终局狂奔（原曲 62-73）+ 半音颤音（ref7 手法 1）=====
    place(S, g, 'lead', 0, 62, 12, 84)
    place(S, g, 'dbl', 4, 62, 12, 84, vel_mul=0.95)
    place(S, g, 'pad', 2, 62, 12, 84)
    place(S, g, 'bass', 1, 62, 12, 84)
    bass_bar_roots(S, g, 'bass', 1, 62, 12, 84)
    groove(S, 84, 12, 'drive', crash_every=4)
    # 88-89 小节：主奏上叠 D5 <-> D#5 十六分往返
    for b in range(88, 90):
        for s in range(16):
            m = 74 if s % 2 == 0 else 75
            S.add('lead', b, s, m, 1, 96)
            S.add('dbl', b, s, m - 12, 1, 62)

    # ===== 96-100 495 年的孤独：底鼓真空 + 颤音 + 回不去的终止 =====
    place(S, g, 'pad', 2, 34, 4, 96)
    groove(S, 96, 4, 'vacuum')
    for b in range(96, 100):
        # 心跳：越来越慢
        S.add('bass', b, 0, 38, 3, 84 - (b - 96) * 12)
        S.add('bass', b, 6, 38, 2, 56 - (b - 96) * 8)
        S.add('pad', b, 0, 50, 16, 40)          # 一条悬着的 D3 长音
    # 半音颤音 96-97：D5 <-> D#5 往返 12 次（≈1.1s）
    for s in range(12):
        S.add('lead', 96, s, 74 if s % 2 == 0 else 75, 1, 92)
    # 98-99：最后一次上行半音走句
    for i, m in enumerate((74, 75, 76, 77, 78, 79, 80, 81)):
        S.add('lead', 98, i * 2, m, 1, 96 - i * 3)
    # 终止：F#dim7（F# A C D#）砸下去，不回 D 小调主和弦；之后只留静音
    for m in (66, 69, 72, 75):
        S.add('power', 99, 0, m, 10, 120)
    for m in (66, 69, 72, 75):          # 主奏层再砸一遍同样的减七和弦，音量才够"终止"
        S.add('lead', 99, 0, m, 8, 118)
        S.add('dbl', 99, 0, m - 12, 8, 100)
    S.add('bass', 99, 0, 30, 12, 124)
    S.add('bass', 99, 0, 42, 10, 96)
    crash(S, 99, 118)
    S.drum(99, 0, 0, 124)

    tracks = S.finish()
    song = {
        'title': 'U.N.オーエンは彼女なのか？～ 495年の孤独',
        'duration': round(BARS * BAR, 4),
        'bpm': BPM,
        'tracks': tracks,
        'drums': S.drums,
    }
    return song


def write_js(song, path):
    def fmt(x):
        s = ('%.5f' % x).rstrip('0').rstrip('.')
        return s if s else '0'

    lines = []
    lines.append('// EX Boss：U.N.オーエンは彼女なのか？—— 芙兰朵露版重编（见 tools/un_mad.py）')
    lines.append('//   主奏/副旋律/铺底/贝斯 = 游戏内 EX 原曲的时间轴逐音搬移，一个音没改；')
    lines.append('//   新写的是 168 BPM 的鼓组、低八度贝斯重音、bII 强力和弦块、半音颤音与 495 年真空段。')
    lines.append('export const UN_MAD = {')
    lines.append('  extra: {')
    lines.append("    title: %s," % json.dumps(song['title'], ensure_ascii=False))
    lines.append('    duration: %s,' % fmt(song['duration']))
    lines.append('    bpm: %s,' % fmt(song['bpm']))
    lines.append('    tracks: [')
    for tr in song['tracks']:
        lines.append('      { wave: %s, gain: %s, notes: [' % (json.dumps(tr['wave']), fmt(tr['gain'])))
        ns = tr['notes']
        for i in range(0, len(ns), 6):
            chunk = ', '.join('[%s,%d,%s,%d]' % (fmt(n[0]), n[1], fmt(n[2]), n[3]) for n in ns[i:i + 6])
            lines.append('        ' + chunk + ',')
        lines.append('      ] },')
    lines.append('    ],')
    lines.append('    drums: [')
    ds = song['drums']
    for i in range(0, len(ds), 8):
        lines.append('      ' + ', '.join('[%s,%d,%d]' % (fmt(d[0]), d[1], d[2]) for d in ds[i:i + 8]) + ',')
    lines.append('    ],')
    lines.append('  },')
    lines.append('};')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def check(song, verbose=True):
    errs = []
    dur = song['duration']
    for tr in song['tracks']:
        ns = tr['notes']
        for n in ns:
            t, m, d, v = n
            if not (0 <= t < dur + 4):
                errs.append('time out of range %s' % (n,))
            if not (12 <= m <= 120):
                errs.append('midi %s' % (n,))
            if not (0 < d <= 8):
                errs.append('dur %s' % (n,))
            if not (1 <= v <= 127):
                errs.append('vel %s' % (n,))
        for i in range(1, len(ns)):
            if ns[i][0] < ns[i - 1][0] - 1e-9:
                errs.append('unsorted in %s' % tr['wave'])
                break
    for i in range(1, len(song['drums'])):
        if song['drums'][i][0] < song['drums'][i - 1][0] - 1e-9:
            errs.append('drums unsorted')
            break
    # 最大同时发声
    ev = []
    for tr in song['tracks']:
        for t, m, d, v in tr['notes']:
            ev.append((t, 1))
            ev.append((t + d, -1))
    ev.sort()
    cur = mx = 0
    for _, x in ev:
        cur += x
        mx = max(mx, cur)
    if verbose:
        for tr in song['tracks']:
            ns = [n[1] for n in tr['notes']]
            print('  %-6s %-9s gain %.3f  %4d 音  midi %s-%s' % (
                tr['wave'], '', tr['gain'], len(tr['notes']),
                min(ns) if ns else '-', max(ns) if ns else '-'))
        print('  鼓 %d 击 / 最大同时发声 %d / 时长 %.3fs' % (len(song['drums']), mx, dur))
        print('  错误 %d %s' % (len(errs), errs[:5]))
    return errs


if __name__ == '__main__':
    song = build()
    if '--check' in sys.argv:
        check(song)
        sys.exit(0)
    check(song)
    out_js = os.path.join(ROOT, 'src', 'engine', 'songs', 'un_mad.js')
    write_js(song, out_js)
    with open(os.path.join(ROOT, 'tools', 'build', '_un_mad.json'), 'w', encoding='utf-8') as f:
        json.dump(song, f, ensure_ascii=False)
    print('wrote', out_js)
