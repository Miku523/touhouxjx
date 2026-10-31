# -*- coding: utf-8 -*-
import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()

old = '''chans, bar_t, beat_t = EX.load(MIDI_NAME)
SHIFT = bar_t[1]
BODY = max(n['t'] + n['d'] for c in chans.values() for n in c.get('notes') or []) - SHIFT
INTRO = 4 * BAR0
OUT = INTRO + BODY
DUR = round(OUT + 4 * BAR0, 3)

def nb_start(nb):
    if nb <= 4:
        return (nb - 1) * BAR0
    if nb <= 86:
        return INTRO + (beat_t(nb - 4, 0) - SHIFT)
    return OUT + (nb - 87) * BAR0

NB0 = [nb_start(nb) for nb in range(0, 94)]
NB0 = [round(x, 5) for x in NB0]

def T(nb, beat=0.0):
    bl = (NB0[nb + 1] - NB0[nb]) / 4.0
    return round(NB0[nb] + beat * bl, 4)

def BL(nb):
    return (NB0[nb + 1] - NB0[nb]) / 4.0

# 原曲小节号 -> 时间（用于 MIDI 声部的分段力度窗）
ORIG0 = [round(beat_t(b, 0) - SHIFT, 5) for b in range(0, 92)]

def orig_bar(t):
    return max(0, bisect.bisect_right(ORIG0, t + 1e-6) - 1)
'''

new = '''import midi2js as M2
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
END_TICK = MUSIC0 + 82 * GRID          # 原曲 82 小节之后收束
BODY = tick_at(END_TICK) - SHIFT
INTRO = 4 * BAR0
OUT = INTRO + BODY
DUR = round(OUT + 4 * BAR0, 3)

def nb_start(nb):
    if nb <= 4:
        return (nb - 1) * BAR0
    if nb <= 87:
        return INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID) - SHIFT)
    return OUT + (nb - 87) * BAR0

NB0 = [round(nb_start(nb), 5) for nb in range(0, 96)]

def T(nb, beat=0.0):
    if nb <= 4:
        return round((nb - 1) * BAR0 + beat * BAR0 / 4.0, 4)
    if nb <= 86:
        return round(INTRO + (tick_at(MUSIC0 + (nb - 5) * GRID + beat * 480) - SHIFT), 4)
    return round(OUT + (nb - 87) * BAR0 + beat * BAR0 / 4.0, 4)

def BL(nb):
    return (NB0[nb + 1] - NB0[nb]) / 4.0

def orig_t(b):
    return tick_at(MUSIC0 + (b - 1) * GRID) - SHIFT

# 原曲小节号 -> 时间（用于 MIDI 声部的分段力度窗）
ORIG0 = [round(orig_t(b), 5) for b in range(0, 92)]

def orig_bar(t):
    return max(0, bisect.bisect_right(ORIG0, t + 1e-6) - 1)
'''
assert s.count(old) == 1
s = s.replace(old, new)

old2 = """    wins = [(beat_t(b0, 0) - SHIFT, beat_t(b1, 0) - SHIFT, k)
            for (b0, b1, k) in L.get('wins', [])]"""
new2 = """    wins = [(orig_t(b0), orig_t(b1), k)
            for (b0, b1, k) in L.get('wins', [])]"""
assert s.count(old2) == 1
s = s.replace(old2, new2)
io.open(P, 'w', encoding='utf-8').write(s)
print('ok')
