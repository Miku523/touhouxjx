# -*- coding: utf-8 -*-
"""EX BOSS《恶魔之妹》v7 —— U.N. Owen Was Her? 的忠实改编。

思路：不再自己写和声/旋律，而是把 ZUN 原 MIDI 逐音搬到游戏合成器里重新配器
（去掉了原 MIDI 里的重复层 ch6/ch10/ch14/ch15），保留原曲的旋律、对位、
贝斯线、琶音与鼓组；只新写 8 小节引子与 12 小节尾声，让 150 秒的循环首尾闭合。

160 BPM / D 小调 / 4/4 / 100 小节 = 150.0s：
  引子 1-8（八音盒时钟 + 心跳 + 乐队进）
  原曲 b1-80 → 新 b9-88（跟着原曲速度呼吸，160BPM 比原曲 155 略快 3%）
  尾声 89-100（崩回八音盒，接回引子）
生成 src/engine/songs/flandre_devil.js 与 tools/build/_fld_lead/song7.json。
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _fld_compose2 as L

BPM = 160.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DURATION = 150.0
BARS = 100
ORIG_BPM = 155.0
ORIG_BEAT = 60.0 / ORIG_BPM
SHIFT_BAR = 8

L.BPM = BPM; L.BEAT = BEAT; L.BAR = BAR; L.DURATION = DURATION; L.BARS = BARS
L.TRACK_DEFS = [
    ('lead', 'saw', 0.240),
    ('counter', 'triangle', 0.070),
    ('piano', 'sine', 0.078),
    ('harpsi', 'square', 0.076),
    ('strings', 'saw', 0.095),
    ('choir', 'sine', 0.068),
    ('brass', 'square', 0.076),
    ('bass', 'triangle', 0.105),
    ('bell', 'sine', 0.116),
    ('pad', 'sine', 0.038),
    ('tick', 'square', 0.040),
]
L.TRACKS = {name: [] for name, _, _ in L.TRACK_DEFS}
L.DRUMS = []
L.DRUM_SCALE = 1.0
L.CHORDS.clear(); L.HALF.clear()

# 原曲鼓 note -> 引擎鼓 kind：0 底鼓 1 军鼓 2 闭镲 3 开镲 4 吊镲 5 中通鼓 6 低通鼓 7 ride
DR_MAP = {36: 0, 35: 0, 38: 1, 40: 1, 37: 1, 42: 2, 44: 2, 46: 3, 49: 4, 57: 4,
          51: 7, 53: 7, 45: 5, 47: 5, 50: 5, 41: 5, 43: 6, 48: 6}

def fit(p, lo=55, hi=84):
    while p < lo:
        p += 12
    while p > hi:
        p -= 12
    return p

def ch_notes(data, ch):
    return [n for n in data if n['ch'] == ch and not n['drum']]

def convert(data):
    # 旋律：ch2 同时装着主题与一条低四度的内声部；按 16 分槽取最高音当 lead
    slots = {}
    for n in ch_notes(data, 2):
        k = (n['bar'], round(n['beat'] * 4))
        slots.setdefault(k, []).append(n)
    for k, grp in slots.items():
        grp.sort(key=lambda n: -n['p'])
        top = grp[0]
        dur = max(0.08, min(4.0, top['dur'] / ORIG_BEAT))
        L.add('lead', top['bar'] + SHIFT_BAR, top['beat'], top['p'], dur, top['vel'])
        bp = top['p'] + 12
        if bp > 96:
            bp = top['p']
        L.add('bell', top['bar'] + SHIFT_BAR, top['beat'], bp,
              max(0.08, min(2.0, dur)), int(top['vel'] * 0.5))

    # 内声部：ch2 每个 16 分槽除了主题音，下面还压着一个低四度音（原来被我丢了），
    # 这些音才是 ZUN 那种双声部管风琴的厚度，单独放一条 counter 轨。
    for k, grp in slots.items():
        grp.sort(key=lambda n: -n['p'])
        for n in grp[1:]:
            dur = max(0.08, min(4.0, n['dur'] / ORIG_BEAT))
            L.add('counter', n['bar'] + SHIFT_BAR, n['beat'], n['p'], dur, int(n['vel'] * 0.65))

    # 原曲 ch4 上有一批高音半音对句（E6–G#6）。ch2 有音的地方它们是加倍，
    # ch2 空着的地方（原曲 b13-15 等）它们才是真正的“回答句”，必须归到 lead。
    for n in ch_notes(data, 4):
        if n['p'] < 84:
            continue
        k = (n['bar'], round(n['beat'] * 4))
        if k in slots:
            continue
        dur = max(0.08, min(4.0, n['dur'] / ORIG_BEAT))
        L.add('lead', n['bar'] + SHIFT_BAR, n['beat'], n['p'], dur, int(n['vel'] * 0.95))
        bp = n['p'] + 12 if n['p'] + 12 <= 100 else n['p']
        L.add('bell', n['bar'] + SHIFT_BAR, n['beat'], bp, max(0.08, min(2.0, dur)), int(n['vel'] * 0.45))

    plan = [
        (1,  'bass',    'same', 0.88),
        (4,  'piano',   'fit52', 0.95),
        (3,  'harpsi',  'same', 0.88),
        (7,  'strings', 'same', 1.00),
        (5,  'brass',   'same', 0.95),
        (13, 'bell',    'same', 0.85),
        (8,  'pad',     'fit',  1.00),
    ]
    for ch, track, tr, vs in plan:
        for n in ch_notes(data, ch):
            if tr == 'fit':
                p = fit(n['p'])
            elif tr == 'fit52':
                p = n['p'] + 12 if n['p'] < 52 else n['p']
            else:
                p = n['p'] + (tr if isinstance(tr, int) else 0)
            if p < 21 or p > 108:
                continue
            dur_beats = max(0.06, min(8.0, n['dur'] / ORIG_BEAT))
            L.add(track, n['bar'] + SHIFT_BAR, n['beat'], p, dur_beats, int(n['vel'] * vs))

    # 合唱：弦乐 -12 软加倍（和声层，不叠旋律）
    for n in ch_notes(data, 7):
        p = n['p'] - 12
        if p < 40 or p > 84:
            continue
        dur_beats = max(0.3, min(4.0, n['dur'] / ORIG_BEAT))
        L.add('choir', n['bar'] + SHIFT_BAR, n['beat'], p, dur_beats, int(n['vel'] * 0.55))

    # 弦乐铺底：原曲在 A/C/E 段没有长音声部，用贝斯根音补一层根五度长音，
    # 只在这些小节加，避免把原本就厚的 B/D 段堆浑。
    ch7_bars = set(n['bar'] for n in ch_notes(data, 7))
    for bar in range(1, 81):
        if bar in ch7_bars:
            continue
        bs = [n for n in ch_notes(data, 1) if n['bar'] == bar]
        if not bs:
            continue
        root = fit(bs[0]['p'])
        chorus = bar >= 20 and bar <= 35 or bar >= 64 and bar <= 79
        vel = 48 if chorus else 38
        for p in (root - 12, root - 5, root):
            if p < 40:
                continue
            L.add('strings', bar + SHIFT_BAR, 0.0, p, 3.9, vel)
            L.add('choir', bar + SHIFT_BAR, 0.0, p - 12 if p - 12 >= 40 else p, 3.9, vel - 10)

    # 鼓
    for n in data:
        if not n['drum']:
            continue
        kind = DR_MAP.get(n['p'])
        if kind is None:
            continue
        t = (4.0 * (n['bar'] + SHIFT_BAR - 1) + n['beat']) * BEAT
        if 0.0 <= t < DURATION - 1e-9:
            vs = 1.14 if kind == 0 else (1.05 if kind == 1 else 1.0)
            L.DRUMS.append([round(t, 4), kind, int(round(n['vel'] * vs))])

def intro(data):
    """1-8 小节：八音盒时钟、心跳、乐队渐入。"""
    clock = [n for n in data if n['ch'] == 3 and n['bar'] == 3 and not n['drum']]
    clock.sort(key=lambda n: (n['beat'], -n['p']))
    top = []
    seen = set()
    for n in clock:
        k = round(n['beat'] * 4)
        if k in seen:
            continue
        seen.add(k)
        top.append((n['beat'], fit(n['p'])))
    for bar in range(1, 9):
        L.add('pad', bar, 0.0, 38, 3.9, 30)
    for bar, step in ((1, 1.0), (2, 1.0)):
        for i in range(int(4 / step)):
            L.add('tick', bar, i * step, 93 if i % 2 == 0 else 90, 0.08, 40)
        for i, p in enumerate((74, 81, 77)):
            L.add('bell', bar, 1.0 + i * 1.0, p, 0.9, 52)
    for bar in (3, 4, 5, 6):
        for i, (beat, p) in enumerate(top):
            L.add('bell', bar, beat, p + 12, 0.16, 46 + (bar - 3) * 4)
        for i in range(int(4 / 0.5)):
            L.add('tick', bar, i * 0.5, 93 if i % 2 == 0 else 90, 0.08, 36)
    for bar in (3, 4):
        L.hit(bar, 0.0, 0, 66); L.hit(bar, 2.0, 0, 58)
    # 5-8：钢琴把时钟琶音原样弹出来，贝斯与弦乐进
    for n in ch_notes(data, 3):
        if n['bar'] != 3:
            continue
        for k in range(5, 9):
            L.add('piano', k, n['beat'], fit(n['p']) - 12, max(0.12, min(1.6, n['dur'] / ORIG_BEAT)), int(n['vel'] * 0.7))
    for bar in range(5, 9):
        L.add('bass', bar, 0.0, 38, 1.0, 86)
        L.add('bass', bar, 1.5, 38, 0.5, 76)
        L.add('bass', bar, 2.0, 45, 0.5, 80)
        L.add('bass', bar, 3.5, 38, 0.5, 74)
        for i in range(4):
            L.hit(bar, i, 2, 54)
        L.hit(bar, 0.0, 0, 88); L.hit(bar, 2.0, 0, 84)
        L.hit(bar, 1.0, 1, 80); L.hit(bar, 3.0, 1, 84)
        if bar >= 7:
            for p in (50, 57, 62):
                L.add('strings', bar, 0.0, p, 3.9, 44)
    # 7-8：hook 预演 —— 八音盒先把 U.N. 副歌的头五音哼出来，主题 9 秒就露面
    hook5 = [(0.25, 79), (1.25, 79), (1.75, 74), (2.75, 81), (3.75, 76)]
    for bar in (7, 8):
        for i, (beat, p) in enumerate(hook5):
            L.add('bell', bar, beat, p, 0.9, 44 + i * 2)
        for i in range(4):
            L.hit(bar, i, 0, 52 if i % 2 == 0 else 44)
    L.fill_toms(8, 2.0, 0.25, 76, 104)
    L.crash(8, 3.5, 60)

def outro(data):
    """89-100：尾句之后崩回八音盒 —— 让 U.N. 的 hook 在八音盒里完整哼一遍，再接回引子。"""
    L.crash(88, 0.0, 96)
    for p in (38, 50, 57, 62, 66):
        L.add('strings', 88, 0.0, p, 3.9, 58)
        L.add('pad', 88, 0.0, p, 3.9, 34)
    L.add('piano', 88, 0.0, 50, 3.8, 76)
    L.add('piano', 88, 0.0, 57, 3.8, 70)
    L.add('bell', 88, 0.0, 86, 1.5, 62)
    L.fill_roll(88, 0.0, 2.0, 92)

    hook = [(n['bar'] - 20, n['beat'], n['p'], max(0.3, min(2.0, n['dur'] / ORIG_BEAT)), n['vel'])
            for n in ch_notes(data, 2) if 20 <= n['bar'] <= 23]
    hook.sort(key=lambda x: (x[0], x[1]))
    # 89-92：完整 hook 的八音盒版（降八度），越哼越轻
    for bar in (89, 90, 91, 92):
        for (hb, beat, p, dur, vel) in hook:
            if hb != bar - 89:
                continue
            L.add('bell', bar, beat, p - 12, dur, 52 if bar < 91 else 46)
        for i in range(8):
            L.add('tick', bar, i * 0.5, 93 if i % 2 == 0 else 90, 0.08, 34 if bar < 91 else 30)
        for i in range(4):
            L.hit(bar, i, 0, 50 if i % 2 == 0 else 40)
        L.add('pad', bar, 0.0, 38, 3.9, 30)
    # 93-96：hook 头三音的残响，只剩心跳
    for bar in range(93, 97):
        for beat, p in ((0.25, 79), (1.25, 79), (1.75, 74)):
            L.add('bell', bar, beat, p, 0.9, 40 if bar < 95 else 34)
        L.add('tick', bar, 0.0, 93, 0.08, 30)
        L.add('tick', bar, 2.0, 90, 0.08, 26)
        L.add('pad', bar, 0.0, 26, 3.9, 26)
        L.add('strings', bar, 0.0, 50, 3.9, 26)
        L.add('strings', bar, 0.0, 57, 3.9, 24)
    # 97-100：只剩钟摆，末拍接回第 1 小节
    for bar in range(97, 101):
        L.add('tick', bar, 0.0, 93, 0.08, 24)
        L.add('tick', bar, 2.0, 90, 0.08, 20)
        L.add('pad', bar, 0.0, 26, 3.9, 22)
    L.add('bell', 100, 0.0, 74, 1.4, 40)
    L.add('bass', 100, 0.0, 38, 1.0, 40)
    L.add('pad', 100, 0.0, 26, 0.9, 20)


def boost_c2():
    """副歌再现（72-87）要比第一遍更炸：合唱高八度 + 八音盒点题 + 多两记镲。"""
    lead_notes = list(L.TRACKS['lead'])
    for (t, p, d, v) in lead_notes:
        bar = int(t / BAR + 1e-9) + 1
        if 72 <= bar <= 87 and p + 12 <= 100:
            off = (t - (bar - 1) * BAR) / BEAT
            L.add('choir', bar, off, p + 12, max(0.3, min(2.0, d)), int(v * 0.36))
            if p - 12 >= 40:
                L.add('strings', bar, off, p - 12, max(0.3, min(2.0, d)), int(v * 0.5))
    for bar in (72, 76, 80, 84):
        L.add('bell', bar, 0.0, 86, 1.2, 56)
    L.crash(72, 0.0, 78)
    L.crash(80, 0.0, 82)
    L.hit(76, 3.5, 3, 60)
    L.hit(84, 3.5, 3, 62)


def write():
    tracks_js = []
    tracks_json = []
    for name, wave, gain in L.TRACK_DEFS:
        ns = sorted(L.TRACKS[name], key=lambda x: (x[0], x[1]))
        tracks_js.append((name, wave, gain, ns))
        tracks_json.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
    dr = sorted(L.DRUMS, key=lambda x: (x[0], x[1]))

    def num(v):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s else '0'

    def dj(ev):
        extra = ',' + num(ev[3]) if len(ev) > 3 else ''
        return '[%s,%d,%d%s]' % (num(ev[0]), int(ev[1]), int(ev[2]), extra)

    lines = []
    lines.append('/**')
    lines.append(' * EX 面 BOSS《恶魔之妹》v7 —— 红月下被囚禁 495 年的芙兰朵露。')
    lines.append(' * 160 BPM, D 小调, 4/4, 100 小节 = 150.0s 循环。')
    lines.append(' * 这一版是 U.N. Owen Was Her? 的忠实改编：旋律、对位、贝斯、琶音、鼓组')
    lines.append(' * 全部逐音来自 ZUN 原 MIDI（只去掉原文件里的重复层与 80 tick 偏移），')
    lines.append(' * 用钢琴 / 羽管键琴 / 弦乐 / 铜管 / 八音盒 / 合唱重新配器。')
    lines.append(' *   引子 1-8（新写：八音盒时钟 + 心跳 + 乐队进）')
    lines.append(' *   原曲 b1-80 -> 新 b9-88（时钟琶音 A / 半音下行 B / 副歌 C / 间奏 D /')
    lines.append(' *     展开 E / 副歌再现 C2 / 尾句 b80 的皮卡迪三度）')
    lines.append(' *   尾声 89-100（崩回八音盒与心跳，末拍接回第 1 小节）')
    lines.append(' * tools/build/_fld_compose7.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const FLANDRE_DEVIL = {')
    lines.append('  extra: {')
    lines.append("    title: '恶魔之妹',")
    lines.append('    duration: 150,')
    lines.append('    bpm: 160,')
    lines.append('    tracks: [')
    for name, wave, gain, ns in tracks_js:
        chunk = '[' + ','.join('[%s,%d,%s,%d]' % (num(t), p, num(d), v) for t, p, d, v in ns) + ']'
        lines.append("      { name: '%s', wave: '%s', gain: %s, notes: %s }," % (name, wave, gain, chunk))
    lines.append('    ],')
    lines.append('    drums: [' + ','.join(dj(ev) for ev in dr) + '],')
    lines.append('  },')
    lines.append('};')
    js = '\n'.join(lines) + '\n'

    root = os.path.dirname(os.path.dirname(HERE))
    out_js = os.path.join(root, 'src', 'engine', 'songs', 'flandre_devil.js')
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(HERE, '_fld_lead', 'song7.json')
    data = {'title': '恶魔之妹', 'duration': 150.0, 'bpm': 160,
            'tracks': tracks_json, 'drums': dr}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print('wrote', out_js)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    last = 0.0
    for name, _, _, ns in tracks_js:
        if ns:
            e = ns[-1][0] + ns[-1][2]
            last = max(last, e)
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), e))
        else:
            print('  %-8s EMPTY' % name)
    print('   last end %.3f' % last)

def main():
    data = json.load(open(os.path.join(HERE, '_fld_lead', 'un_notes.json'), encoding='utf-8'))['notes']
    intro(data)
    convert(data)
    outro(data)
    boost_c2()
    write()

if __name__ == '__main__':
    main()
