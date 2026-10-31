
# -*- coding: utf-8 -*-
"""tools/build/_aya_compose.py -- 第四面 Boss《風神少女》（天狗疾风编）

素材 = ZUN 原曲 TH09 扒谱 MIDI「11. Wind God Girl (Kanade_KND34).mid」：
154 BPM / 4-4 / F 小调（末段升半音 F# 小调）/ 原曲循环单元 = 文件 bar 6-109（104 小节）。

结构（100 小节 = 155.844s）：
  引子        new 1-4     （自写：夜风、太鼓、八音盒预演副歌头、A1 groove 动机）
  原曲 A2     new 5-12    （file 14-21  弱音小号主题）
  原曲 B      new 13-19   （file 22-28  转折 + 终止式）
  原曲 C1     new 20-27   （file 29-36  副歌 1，小号）
  原曲 C2     new 28-35   （file 37-44  副歌 2，Cm-Db-Eb-Bb）
  原曲 D riff new 36-44   （file 45-53  风琴 16 分 riff）
  原曲 A2+B   new 45-59   （file 54-68  主歌再现，加厚）
  原曲 C1+C2  new 60-75   （file 69-84  副歌再现，全编制）
  原曲 E      new 76-95   （file 85-104 断电 break + 升半音 F# 小调终曲）
  原曲 out    new 96-100  （file 105-109 F#m->Fm 过渡，循环回引子）

生成 src/engine/songs/aya_stage4.js（导出 AYA_STAGE4.stage4）
与 tools/build/_aya_lead/{song.json,secs.json}
"""
import sys, os, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FLAT = os.path.join(ROOT, 'tools', 'build', '_aya_lead', 'midi_flat.json')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'aya_stage4.js')
LEAD = os.path.join(ROOT, 'tools', 'build', '_aya_lead')
OUT_JSON = os.path.join(LEAD, 'song.json')
SEC_JSON = os.path.join(LEAD, 'secs.json')

BPM = 154.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DUR = round(100 * BAR, 3)
TITLE = '風神少女'
EXPORT = 'AYA_STAGE4'
KEYNAME = 'stage4'

NOTES = json.load(open(FLAT, encoding='utf-8'))['notes']
BY_CH = collections.defaultdict(list)
for n in NOTES:
    BY_CH[n['ch']].append(n)

# ---------------- 段落搬入表：(tag, file_b0, file_b1, new_b0) ----------------
SEGS = [
    ('a2',  14, 21,  5),
    ('b',   22, 28, 13),
    ('c1',  29, 36, 20),
    ('c2',  37, 44, 28),
    ('riff',45, 53, 36),
    ('a2b', 54, 68, 45),
    ('c1b', 69, 76, 60),
    ('c2b', 77, 84, 68),
    ('e',   85, 104, 76),
    ('out',105, 109, 96),
]
DYN = {'a2': 0.94, 'b': 0.94, 'c1': 1.00, 'c2': 1.02, 'riff': 1.00,
       'a2b': 1.10, 'c1b': 1.14, 'c2b': 1.16, 'e': 1.18, 'out': 0.92}

def new_bar(tag, fb):
    for t, b0, b1, n0 in SEGS:
        if t == tag and b0 <= fb <= b1:
            return n0 + (fb - b0)
    return None

def bt(nb, beat):
    return (nb - 1) * BAR + beat * BEAT

TRACKS = []
BY = {}
def add(name, t, m, d, v=100):
    if t < 0 or not (0 <= m <= 127):
        return
    if t >= DUR - 0.02:
        return
    d = min(max(0.03, d), DUR - t - 0.005)
    if d <= 0.02:
        return
    if name == 'sub' and m < 28:
        m += 12
    BY[name].append([round(t, 3), int(round(m)), round(d, 3), int(max(1, min(127, v)))])

DRUMS = []
def drum(t, kind, vel=100, span=None):
    if t < 0 or t >= DUR - 0.01:
        return
    DRUMS.append([round(t, 3), kind, int(max(1, min(127, vel)))] + ([round(span, 3)] if span else []))

DRUM_MAP = {35: 0, 36: 0, 38: 1, 40: 1, 37: 1, 42: 2, 62: 2, 63: 2, 44: 2,
            46: 3, 49: 4, 57: 4, 51: 7, 53: 7, 45: 5, 47: 5, 48: 6, 50: 6, 41: 6, 43: 6}

# ---------------- 原曲逐音搬入 ----------------
def voice(ch, t, m, d, v, tag):
    dy = DYN[tag]
    if ch == 0:                       # Trumpet 主旋律
        add('lead', t, m, d, v * dy)
        add('brass', t, m, d * 0.9, v * 0.50 * dy)
        if m + 12 <= 102:
            add('spark', t, m + 12, d * 0.55, v * 0.24 * dy)
        if tag in ('c1b', 'c2b', 'e'):          # 再现段：上八度补强
            add('lead', t, m + 12, d * 0.95, v * 0.30 * dy)
    elif ch == 1:                     # MutedTrumpet 主旋律（A2/B）
        add('lead', t, m, d, v * dy * 1.02)
        add('counter', t, m - 12, d, v * 0.34 * dy)
        if m + 12 <= 102:
            add('spark', t, m + 12, d * 0.50, v * 0.20 * dy)
    elif ch == 2:                     # 钢琴：16 分琶音 + 和弦
        add('arp', t, m, d, v * 0.92 * dy)
        if d >= 0.40:
            add('piano', t, m, d * 0.95, v * 0.56 * dy)
    elif ch == 6:                     # DrawbarOrgan：16 分快速音群
        add('harpsi', t, m, d, v * 0.88 * dy)
    elif ch == 7:                     # Trumpet 低八度补强
        add('counter', t, m, d, v * 0.60 * dy)
    elif ch == 8:                     # MutedTrumpet 和声层
        add('brass', t, m, d, v * 0.56 * dy)
    elif ch == 10:                    # FingeredBass
        add('bass', t, m, d, v * 0.96 * dy)
    elif ch == 11:                    # Strings1 pad
        add('strings', t, m, d, v * 0.62 * dy)
        if tag in ('c1b', 'c2b', 'e'):
            add('choir', t, m, d, v * 0.46 * dy)
            add('strings', t, m + 12, d * 0.95, v * 0.28 * dy)
    elif ch == 12:                    # SlapBass2 = ch10 低八度
        add('sub', t, m, d, v * 0.46 * dy)
    elif ch == 9:                     # 鼓
        k = DRUM_MAP.get(m)
        if k is not None:
            drum(t, k, v * 0.96 * dy)

def transplant():
    for tag, fb0, fb1, nb0 in SEGS:
        for ch, lst in BY_CH.items():
            for n in lst:
                if fb0 <= n['bar'] <= fb1:
                    nb = nb0 + (n['bar'] - fb0)
                    voice(ch, bt(nb, n['beat']), n['m'], n['d'] * 0.98, n['v'], tag)

# ---------------- 自写：引子 4 小节 ----------------
def sec_intro():
    # bar1：夜风
    add('pad', bt(1, 0), 41, 4 * BAR * 0.99, 44)         # F2
    add('pad', bt(1, 0), 48, 4 * BAR * 0.99, 40)         # C3
    add('pad', bt(1, 0), 56, 3 * BAR * 0.99, 38)         # G#3
    add('pad', bt(1, 0), 60, 2 * BAR * 0.99, 34)         # C4
    add('riser', bt(1, 0), 60, 2.0, 40)
    add('reverse', bt(1, 0.5), 72, 1.6, 34)
    add('knife', bt(1, 2.5), 86, 0.25, 52)
    # 副歌头预演（file bar 29-30 ch0 上八度，八音盒）
    head = [n for n in BY_CH[0] if 29 <= n['bar'] <= 30][:5]
    for i, n in enumerate(head):
        t = bt(1, 1.0 + i * 1.0)
        add('bell', t, n['m'] + 12, 0.36, 96 - i * 4)
        add('bell', t, n['m'] + 24 if n['m'] + 24 <= 100 else n['m'] + 12, 0.30, 62 - i * 3)
    # bar2-3：A1 groove 动机（file bar 6-7 ch2 低八度 + 轻鼓）
    for n in BY_CH[2]:
        if 6 <= n['bar'] <= 7:
            t = bt(2 + (n['bar'] - 6), n['beat'])
            add('harpsi', t, n['m'] - 12, n['d'] * 0.9, 58)
    for n in BY_CH[2]:
        if 8 <= n['bar'] <= 9:
            t = bt(4 + (n['bar'] - 8) * 0.5, n['beat'])
            add('harpsi', t, n['m'] - 12, n['d'] * 0.9, 52)
    # 鼓：心跳 -> 军鼓渐强
    for i in range(4):
        drum(bt(2, i), 0, 88)
    for i in range(4):
        drum(bt(2, i + 2), 2, 44)
    drum(bt(3, 0), 0, 96); drum(bt(3, 0), 2, 52); drum(bt(3, 2), 0, 92)
    for i in range(8):
        drum(bt(3, 2.0 + i * 0.25), 1, 40 + i * 5)
    for i in range(16):
        drum(bt(4, i * 0.25), 1, 58 + i * 3)
    for i, k in enumerate((5, 5, 6, 6)):
        drum(bt(4, 3.0 + i * 0.25), k, 84)
    drum(bt(4, 0), 4, 92)
    add('riser', bt(3, 2.0), 67, 2.0, 52)
    add('brass', bt(4, 0), 41, 3.4, 78)
    add('brass', bt(4, 0), 48, 3.4, 72)
    add('brass', bt(4, 0), 56, 3.4, 70)
    add('pad', bt(4, 0), 41, 1.0, 36)

# ---------------- 自写：转场 / 冰刃 ----------------
def accents():
    # 段落交界：风刃 + 吊镲感
    for nb in (5, 13, 20, 28, 36, 45, 60, 68, 76, 84, 96):
        t = bt(nb, 0)
        add('knife', t - 0.12, 88, 0.22, 46)
        add('reverse', t - 0.6, 74, 0.55, 34)
    # 副歌段落头：八音盒点题（F 小调 / F# 小调）
    for nb, p in ((20, 84), (60, 84), (84, 85)):
        add('bell', bt(nb, 0), p, 0.5, 74)
        add('bell', bt(nb, 0), p - 5, 0.5, 58)
    # 副歌：玻璃闪烁（16 分高处）
    for nb in list(range(20, 36)) + list(range(60, 76)):
        for off in (1.5, 3.5):
            add('bell', bt(nb, off), 96, 0.10, 26)
    # riff 段尾（new 41-44）：八音盒把副歌头再哼一遍，填 lead 空窗
    for i, n in enumerate([n for n in BY_CH[0] if 29 <= n['bar'] <= 30][:5]):
        t = bt(41, 1.0 + i * 1.0)
        add('bell', t, n['m'] + 12, 0.34, 78 - i * 4)
    # 终曲 F#m：铃与风
    for nb in range(84, 96):
        add('bell', bt(nb, 3.5), 97, 0.12, 30)

# ---------------- 自写：E 段 break 与终曲加层 ----------------
def sec_e_extra():
    # file 85-92 = new 76-83：断电段
    for nb in range(76, 84):
        drum(bt(nb, 0), 0, 76)
        drum(bt(nb, 2.5), 7, 34)
    drum(bt(76, 0), 4, 96)
    add('riser', bt(82, 0), 60, 2.0, 56)
    for i in range(16):
        drum(bt(83, i * 0.25), 1, 44 + i * 4)
    for i, k in enumerate((5, 5, 6, 6, 5, 5, 6, 6)):
        drum(bt(83, 2.0 + i * 0.25), k, 70 + i * 4)
    # F#m 终曲（new 84-95 = file 93-104）：原曲鼓已密（21-25 击/节），只补高频细碎与吊镲
    drum(bt(84, 0), 4, 108)
    for nb in range(84, 96):
        for i in range(16):
            drum(bt(nb, i * 0.25 + 0.125), 2, 26 if i % 2 else 32)
        drum(bt(nb, 2.5), 7, 42)
        if nb in (84, 88, 92):
            drum(bt(nb, 0), 4, 96)
        if nb in (86, 90, 94):
            drum(bt(nb, 3.5), 3, 54)
        if nb == 95:
            for i, k in enumerate((5, 5, 6, 6)):
                drum(bt(nb, 3.0 + i * 0.25), k, 96)
    # 合唱长音（F#m 终曲）：只补根音与八度，三音交给 ch11 strings
    for nb in range(84, 96):
        for p in (42, 54):
            add('choir', bt(nb, 0), p, 4 * BEAT * 0.96, 44)
    # 终曲加 16 分琶音（风）
    for nb in range(84, 96):
        pat = [66, 73, 78, 73, 66, 73, 78, 85]
        for i in range(16):
            add('arp', bt(nb, i * 0.25), pat[i % 8], 0.22, 34 if i % 2 else 42)

# ---------------- 自写：尾声（new 96-100 用原曲过渡，只补 pad 与铃） ----------------
def sec_tail():
    add('pad', bt(100, 0), 41, BAR * 0.98, 42)
    add('pad', bt(100, 0), 48, BAR * 0.98, 38)
    add('bell', bt(100, 2.0), 77, 0.6, 58)
    add('bell', bt(100, 3.0), 84, 0.6, 48)
    drum(bt(100, 0), 4, 70)

SECS = [
    ('intro', 1, 4), ('a2', 5, 12), ('b', 13, 19), ('c1', 20, 27), ('c2', 28, 35),
    ('riff', 36, 44), ('a2b', 45, 52), ('b2', 53, 59), ('c1b', 60, 67),
    ('c2b', 68, 75), ('e_break', 76, 83), ('e_coda', 84, 95), ('out', 96, 100),
]

def main():
    TRACKS.extend([
        ('lead', 'sawtooth', 0.142), ('brass', 'square', 0.150),
        ('counter', 'triangle', 0.120), ('arp', 'sine', 0.150),
        ('harpsi', 'square', 0.150), ('piano', 'triangle', 0.090),
        ('strings', 'sawtooth', 0.135), ('choir', 'sine', 0.095),
        ('bass', 'triangle', 0.135), ('sub', 'sine', 0.098),
        ('bell', 'sine', 0.165), ('pad', 'sine', 0.095),
        ('spark', 'square', 0.062),
        ('knife', 'square', 0.105), ('riser', 'sawtooth', 0.090),
        ('reverse', 'sawtooth', 0.085),
    ])
    for n, w, g in TRACKS:
        BY[n] = []
    transplant()
    sec_intro()
    sec_e_extra()
    accents()
    sec_tail()
    postprocess()
    js_tracks = []
    for n, w, g in TRACKS:
        notes = sorted(BY[n], key=lambda x: x[0])
        if notes:
            js_tracks.append({'name': n, 'wave': w, 'gain': g, 'notes': notes})
    drums = sorted([d for d in DRUMS], key=lambda x: x[0])
    last = 0.0
    for tr in js_tracks:
        for nt in tr['notes']:
            last = max(last, nt[0] + nt[2])
    payload = {'title': TITLE, 'duration': DUR, 'bpm': BPM,
               'tracks': js_tracks, 'drums': drums}
    js = []
    js.append('// 生成物：tools/build/_aya_compose.py（勿手改）')
    js.append('// 素材：ZUN「風神少女」TH09 扒谱 MIDI（Kanade 版），原曲 bar14-109 逐音搬入，另写 4 小节引子')
    js.append('export const ' + EXPORT + ' = {')
    js.append('  ' + KEYNAME + ': ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ',')
    js.append('};')
    open(OUT_JS, 'w', encoding='utf-8').write('\n'.join(js) + '\n')
    json.dump(payload, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    sec_list = [[n, round(bt(a, 0), 3), round(bt(b + 1, 0), 3)] for n, a, b in SECS]
    json.dump({'_dur': DUR, 'bpm': BPM, 'bar': round(BAR, 6), 'secs': sec_list},
              open(SEC_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    print('wrote', OUT_JS, 'dur', DUR, 'notes', sum(len(t['notes']) for t in js_tracks),
          'drums', len(drums), 'tracks', len(js_tracks), 'last', round(last, 3))
    for t in js_tracks:
        ns = t['notes']
        print('  %-8s %-9s gain %.3f  n=%4d  %3d-%3d' % (t['name'], t['wave'], t['gain'], len(ns),
              min(n[1] for n in ns), max(n[1] for n in ns)))


# ---------------- v3：八条复盘落地（后处理） ----------------
def _w(nb0, nb1):
    return bt(nb0, 0), bt(nb1 + 1, 0)


def postprocess():
    # 1) A2/B 主题出头：主旋律 +2.3dB，补铜管同度与钟琴高八度
    t0, t1 = _w(5, 19)
    add_brass, add_bell = [], []
    add_lead = []
    for n in BY['lead']:
        if t0 - 1e-6 <= n[0] < t1:
            v = n[3]
            add_lead.append([n[0], n[1], n[2], int(min(127, v * 0.30))])
            add_brass.append([n[0], n[1], round(n[2] * 0.95, 3), int(min(127, v * 0.32))])
            if n[1] + 12 <= 102 and n[2] >= 0.20:
                add_bell.append([n[0], n[1] + 12, round(min(n[2], 0.28), 3), int(min(127, v * 0.30))])
            n[3] = min(127, int(v * 1.15))
    BY['lead'].extend(add_lead)
    BY['brass'].extend(add_brass)
    BY['bell'].extend(add_bell)

    # 2a) 再现段鼓组不再逐击重复
    for nb in range(45, 53):                      # A2 再现：ride 8 分
        for i in range(8):
            drum(bt(nb, i * 0.5), 7, 30)
    drum(bt(45, 0), 4, 86); drum(bt(49, 0), 4, 82)
    b0, b1 = _w(53, 59)                           # B 再现：抽掉十六分闭镲、改 ride、加通鼓
    keep = []
    for e in DRUMS:
        if b0 - 1e-6 <= e[0] < b1 - 1e-6 and e[1] == 2:
            beat = (e[0] - b0) / BEAT
            if round(beat * 4) % 2:
                continue
        keep.append(e)
    DRUMS[:] = keep
    for nb in range(53, 60):
        for i in range(8):
            drum(bt(nb, i * 0.5), 7, 34)
    for i, k in enumerate((5, 5, 6, 6)):
        drum(bt(58, 3.0 + i * 0.25), k, 80 + i * 4)
    for nb in range(60, 68):                      # C1 再现：补 16 分闭镲
        for i in range(16):
            drum(bt(nb, i * 0.25), 2, 26 if i % 2 else 30)
    drum(bt(60, 0), 4, 94); drum(bt(64, 0), 4, 88)
    for nb in range(68, 76):                      # C2 再现：16 分闭镲更密 + 收尾 fill
        for i in range(16):
            drum(bt(nb, i * 0.25), 2, 30 if i % 2 else 34)
    drum(bt(68, 0), 4, 100); drum(bt(72, 0), 4, 94)
    for i, k in enumerate((5, 5, 6, 6, 5, 5, 6, 6)):
        drum(bt(75, 2.0 + i * 0.25), k, 92 + i * 3)

    # 2b) C2 再现末四小节整体升半音（F 小调 -> F# 小调，直接推进终曲）
    tt0, tt1 = _w(72, 75)
    for name, lst in BY.items():
        for n in lst:
            if tt0 - 1e-6 <= n[0] < tt1 - 1e-6 and n[1] + 1 <= 127:
                n[1] += 1

    # 3) 转场音效抬到能听见
    for n in BY['knife']:
        n[3] = max(n[3], 112)
    for n in BY['reverse']:
        n[3] = max(n[3], 100)
    for n in BY['riser']:
        n[3] = max(n[3], 100)

    # 4) 副歌玻璃闪抬起来
    for n in BY['bell']:
        if n[3] <= 32:
            n[3] = 48

    # 5) riff 段尾用主奏补 hook（原来只有钟琴，实测 -32.9dB）
    hook = [n['m'] for n in BY_CH[0] if 29 <= n['bar'] <= 30][:5]
    spots = [(41, 2.0), (42, 0.0), (42, 2.0), (43, 0.0), (43, 2.0)]
    for i, (nb, beat) in enumerate(spots):
        base = hook[i % len(hook)]
        p = base + 12 if base + 12 <= 100 else base
        t = bt(nb, beat)
        add('lead', t, p, 0.34, 112 - i * 3)
        add('brass', t, p, 0.30, 74 - i * 2)
        add('bell', t, p + 12 if p + 12 <= 102 else p, 0.30, 86 - i * 3)

    # 6) 断电段真的断：抽掉高位加倍、旋律减薄、改钢琴+垫
    eb0, eb1 = _w(76, 83)
    BY['spark'][:] = [n for n in BY['spark'] if not (eb0 - 1e-6 <= n[0] < eb1 - 1e-6)]
    BY['brass'][:] = [n for n in BY['brass'] if not (eb0 - 1e-6 <= n[0] < eb1 - 1e-6)]
    keep = []
    for n in BY['lead']:
        if eb0 - 1e-6 <= n[0] < eb1 - 1e-6:
            beat = (n[0] - eb0) / BEAT
            if not (n[2] >= 0.15 or abs(beat - round(beat)) < 0.02):
                continue
        keep.append(n)
    BY['lead'][:] = keep
    BY['piano'][:] = [n for n in BY['piano'] if not (eb0 - 1e-6 <= n[0] < eb1 - 1e-6)]
    for nb in range(76, 84):
        roots = [n[1] for n in BY['bass'] if bt(nb, 0) - 1e-6 <= n[0] < bt(nb + 1, 0) - 1e-6]
        if not roots:
            continue
        r = min(roots)
        third = 4 if r % 12 in (2, 3, 4, 5, 7, 8, 9, 10) else 3
        for p, v in ((r, 46), (r + third, 38), (r + 7, 40), (r + 12, 32)):
            add('piano', bt(nb, 0), p, 3.6 * BEAT, v)
        add('pad', bt(nb, 0), r, 4 * BEAT * 0.97, 48)

    # 8) 尾声：后两小节抽鼓、留 pad 与铃（听感提前 2 小节收）
    o0, o1 = _w(99, 100)
    DRUMS[:] = [e for e in DRUMS if not (o0 - 1e-6 <= e[0] < o1 - 1e-6)]
    BY['spark'][:] = [n for n in BY['spark'] if not (o0 - 1e-6 <= n[0] < o1 - 1e-6)]
    for nb in (99, 100):
        add('pad', bt(nb, 0), 41, 4 * BEAT * 0.97, 44)
        add('pad', bt(nb, 0), 48, 4 * BEAT * 0.97, 40)
        add('bell', bt(nb, 3.5), 84, 0.6, 66)
    add('bell', bt(100, 2.0), 77, 0.7, 72)
    add('bell', bt(100, 3.0), 84, 0.7, 60)


if __name__ == '__main__':
    main()
