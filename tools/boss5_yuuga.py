#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/boss5_yuuga.py —— 11 五面首领《幽雅に咲かせ、墨染の桜 ～ Border of Life》（墨染编）。

蓝本（用户 m02342 指定四首，第一首原曲要占大头主旋律）：
  refA 上海アリス幻樂団《幽雅に咲かせ、墨染の桜 ～ Border of Life》144s（= 原曲本尊，主旋律来源）
  refB TAMUSIC 四重奏 236s（弦乐长音、无鼓、温暖）
  refC Arisaki Works 266s（E 小调、轻底鼓、重军鼓的摇滚感）
  refD 双月 彩《華霊に舞う永遠の桜》256s / 150 BPM（强前后拍 + 密集十六分）

取法：主旋律 100% 用 ZUN 原曲谱里的 square 主音（ch2，bar 40–69，全曲唯一「会唱」的段落）；
伴奏织体取原曲自己的钢琴柱（ch0）、电钢流动线（ch3）、击弦贝斯（ch4）、弦乐（ch10/14）、
真鼓（ch9）；段落按「前奏 → 主题 A → 主题 B → 转调 build → 终段再现」重排成 62 小节。

素材：7 - Perfect Cherry Blossom\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid
按 tick 小节网格重排（不用秒，避免 MIDI 20 段 tempo map 漂移）。

用法：
    python tools/boss5_yuuga.py --check
    python tools/boss5_yuuga.py
"""
import argparse
import json
import os
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom',
                   '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'yuuga_stage5.js')
EXPORT = 'YUGA_STAGE5'

SPEC = dict(key='stage5', title='幽雅に咲かせ、墨染の桜 ～ Border of Life（墨染编）', bpm=144.0)

# (目标小节, 原曲起小节, 小节数, 段落名)
SECTIONS = [
    (0,  0,  4, 'intro1'),   # 原曲 0–4 钢琴瀑布前奏（G#m，安静）
    (4,  8,  4, 'intro2'),   # 原曲 8–12 鼓/贝斯/十六分跑动进来（F#，build）
    (8,  42.6, 14, 'A'),     # 原曲 42.6–56.6 主旋律第一段（正好让 ch2 的第一个音落在主题正拍上）
    (22, 56, 14, 'B'),       # 原曲 56–70 主旋律第二段（G#m/E/B）+ 高音对句
    (36, 36, 4,  'C'),       # 原曲 36–40 Dm 钢琴柱 ramp（半音上行冲终段，只 4 小节不许断旋律太久）
    (40, 42.6, 14, 'D'),     # 原曲 42.6–56.6 再现（终段，加八度加倍）
]
SEC = {tag: (db, nb) for db, sb, nb, tag in SECTIONS}

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


GAME_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')


def load_game_stage5():
    """用 node 直接读游戏里现役的 stage5，返回 [[t,m,d,v], ...] 三条轨。

    用户在 m02527 要求「前奏缺东西，与游戏内原曲融合」：游戏里这首的开头有
    一根长音主旋律（D#5 G#5 A#5…）和一条十六分琶音，比纯钢琴瀑布满得多，
    所以前奏直接把这两层借过来。
    """
    expr = ("import('file:///%s').then(m => { const s = m.BOSS_SONGS.stage5;"
            " process.stdout.write(JSON.stringify(s.tracks.map(t => t.notes))); });"
            % GAME_JS.replace(os.sep, '/'))
    out = subprocess.run(['node', '--input-type=module', '-e', expr],
                         capture_output=True, cwd=ROOT)
    if out.returncode != 0:
        raise SystemExit('node 读游戏 stage5 失败: %s' % out.stderr.decode('utf-8', 'replace'))
    return json.loads(out.stdout.decode('utf-8'))


def load_notes(path):
    """按 tick 读成「小节数 + 小节内时值」，绕开 tempo map。"""
    midi = M.parse_midi(path)
    div = midi['division'] or 480
    q = 4.0 * div
    notes = {}
    for tr in midi['tracks']:
        pending = {}
        for ev in tr['events']:
            if ev[1] == 'on':
                pending.setdefault((ev[2], ev[3]), []).append((ev[0], ev[4]))
            elif ev[1] == 'off':
                st = pending.get((ev[2], ev[3]))
                if st:
                    on, vel = st.pop(0)
                    off = max(ev[0], on + 1)
                    notes.setdefault(ev[2], []).append(
                        dict(bar=on / q, dbar=(off - on) / q, m=ev[3], v=vel))
        for (ch, pitch), st in pending.items():
            for on, vel in st:
                notes.setdefault(ch, []).append(dict(bar=on / q, dbar=0.25, m=pitch, v=vel))
    for ch in notes:
        notes[ch].sort(key=lambda n: (n['bar'], n['m']))
    return notes


def arrange(notes, bar, sections=None, transpose=0, only_below=None, only_above=None,
            vscale=1.0, dscale=1.0, cap=8.0):
    out = []
    for db, sb, nb, tag in SECTIONS:
        if sections and tag not in sections:
            continue
        for n in notes:
            if not (sb <= n['bar'] < sb + nb):
                continue
            m = n['m'] + transpose
            if only_below is not None and m >= only_below:
                continue
            if only_above is not None and m <= only_above:
                continue
            t = (db + (n['bar'] - sb)) * bar
            out.append(dict(t=round(t, 3), m=m,
                            d=round(min(n['dbar'] * bar * dscale, cap), 3),
                            v=max(1, min(127, int(round(n['v'] * vscale))))))
    out.sort(key=lambda x: (x['t'], x['m']))
    return out


def drop(notes, t0, t1):
    return [n for n in notes if not (t0 <= n['t'] < t1)]


def fade_in(notes, seconds, floor=0.30):
    out = []
    for n in notes:
        k = min(1.0, n['t'] / seconds) if seconds > 0 else 1.0
        out.append(dict(n, v=max(1, int(round(n['v'] * (floor + (1 - floor) * k))))))
    return out


def sub_copy(notes, drop_=12):
    return [dict(n, m=max(21, n['m'] - drop_)) for n in notes]


def clip(notes, duration):
    out = []
    for n in notes:
        if n['t'] >= duration - 0.10:
            continue
        out.append(dict(n, d=max(0.05, round(min(n['d'], duration - n['t']), 3))))
    return out


def drums_arrange(notes, bar, thin_hat=0.150, thin_snare=0.10, thin_kick=0.075,
                  snare_floor=50, sections=None, vscale=1.0):
    kind_of = {36: 0, 38: 1, 40: 1, 42: 2, 44: 2, 46: 3, 49: 4, 51: 3}
    raw = []
    for db, sb, nb, tag in SECTIONS:
        if sections and tag not in sections:
            continue
        for n in notes:
            if not (sb <= n['bar'] < sb + nb) or n['m'] not in kind_of:
                continue
            k = kind_of[n['m']]
            v = float(n['v']) * vscale
            if k == 1 and v < snare_floor:
                continue
            raw.append(((db + (n['bar'] - sb)) * bar, k, v))
    raw.sort()
    thin = {0: thin_kick, 1: thin_snare, 2: thin_hat, 3: 0.0, 4: 0.0}
    out, last = [], {}
    for t, k, v in raw:
        g = thin.get(k, 0.0)
        if g and (t - last.get(k, -1e9)) < g:
            continue
        last[k] = t
        out.append([round(t, 3), k, int(max(20, min(127, round(v))))])
    return sorted(out, key=lambda x: (x[0], x[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=float, default=SPEC['bpm'])
    ap.add_argument('--lead-gain', type=float, default=0.20)
    ap.add_argument('--octave-gain', type=float, default=0.05)
    ap.add_argument('--descant-gain', type=float, default=0.030)
    ap.add_argument('--chug-gain', type=float, default=0.075)
    ap.add_argument('--stab-gain', type=float, default=0.10)
    ap.add_argument('--flow-gain', type=float, default=0.062)
    ap.add_argument('--strings-gain', type=float, default=0.058)
    ap.add_argument('--bass-gain', type=float, default=0.125)
    ap.add_argument('--sub-gain', type=float, default=0.15)
    ap.add_argument('--open-gain', type=float, default=0.150)
    ap.add_argument('--arp-gain', type=float, default=0.050)
    ap.add_argument('--cascade-gain', type=float, default=0.105)
    ap.add_argument('--riser-gain', type=float, default=0.062)
    ap.add_argument('--hold-gain', type=float, default=0.070)
    ap.add_argument('--hat-thin', type=float, default=0.150)
    ap.add_argument('--no-write', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    beat = 60.0 / args.bpm
    bar = 4 * beat
    bars = SECTIONS[-1][0] + SECTIONS[-1][2]
    duration = round(bars * bar, 3)
    print('目标 %.1f BPM；%d 小节 / %.3fs' % (args.bpm, bars, duration))

    ch = load_notes(MID)
    print('通道音符数：%s' % {k: len(v) for k, v in sorted(ch.items())})

    # ---- 前奏：借游戏内现役 stage5 的开头（长音主旋律 + 十六分琶音），补掉「缺东西」----
    game = load_game_stage5()
    intro_len = (SEC['intro1'][1] + SEC['intro2'][1]) * bar   # 8 小节
    game_open = [dict(t=round(n[0], 3), m=n[1], d=round(n[2], 3), v=n[3])
                 for n in game[0] if n[0] < intro_len - 1e-6]
    game_arp = [dict(t=round(n[0], 3), m=n[1], d=round(n[2], 3), v=n[3])
                for n in game[2] if n[0] < intro_len - 1e-6]
    print('游戏内前奏：长音 %d 音 / 琶音 %d 音' % (len(game_open), len(game_arp)))

    # ---- 主旋律：intro 用 ch3 的瀑布顶声部（降为衬底），A/B/D 用 ch2（原曲唯一的 square 主音）----
    cascade = arrange(ch[3], bar, sections=('intro1', 'intro2'))
    cascade = M.mono_ize(cascade, keep='high')
    theme = arrange(ch[2], bar, sections=('A', 'B', 'D'))
    theme = M.mono_ize(theme, keep='high')
    lead = theme
    print('主旋律 %d 音，%.2fs 起 %.2fs 止' % (len(lead), lead[0]['t'], max(n['t'] for n in lead)))

    # 终段八度加倍（只给 D，短音才加，避免糊）
    D0 = SEC['D'][0] * bar
    octave = [dict(n, m=n['m'] + 12, d=min(n['d'], 0.42)) for n in lead if n['t'] >= D0 and n['d'] <= 0.9]
    octave = [dict(n, v=int(n['v'] * 0.72)) for n in octave]

    # B 段高音对句（ch7 = 原曲自己的高音装饰线）：只留 84 以上的音，
    # 免得和主旋律（62–83）撞在同一音区
    descant = arrange(ch[7], bar, sections=('B',), only_above=84, vscale=0.5, dscale=0.9)
    print('八度加倍 %d / 对句 %d' % (len(octave), len(descant)))

    # ---- 伴奏 ----
    # 钢琴柱：ch0 三/六连八度，只留中高音两根
    stab = arrange(ch[0], bar, only_above=46, only_below=97)
    stab = M.cap_poly(stab, 2)
    # 电钢流动线：ch3 降八度铺底（intro 里已作主旋律，这里跳过 intro）
    flow = arrange(ch[3], bar, sections=('A', 'B', 'C', 'D'), transpose=-12, vscale=0.85)
    flow = M.mono_ize(flow, keep='high')
    # 弦乐：ch10 + ch14 降八度
    strings = arrange(ch[10], bar, transpose=-12) + arrange(ch[14], bar, transpose=-12)
    strings = M.cap_poly(sorted(strings, key=lambda n: (n['t'], n['m'])), 2)
    # 贝斯：ch4 击弦贝斯（intro 没有，用 ch1 钢琴左手垫）
    bass = arrange(ch[4], bar, sections=('intro2', 'A', 'B', 'C', 'D'))
    bass = M.mono_ize(bass, keep='low')
    bass_intro = arrange(ch[1], bar, sections=('intro1', 'intro2'), only_below=56)
    bass_intro = M.mono_ize(bass_intro, keep='low')
    bass = sorted(bass_intro + bass, key=lambda n: (n['t'], n['m']))
    sub = sub_copy(bass)

    # C 段（原曲 32–40 只有钢琴柱 + 贝斯，没旋律）补一层十六分「chug」把 build 顶起来：
    # 贝斯根音升八度，每个八分切两刀
    C0 = SEC['C'][0] * bar
    C1 = (SEC['C'][0] + SEC['C'][1]) * bar
    chug = []
    for n in bass:
        if not (C0 <= n['t'] < C1):
            continue
        m = min(110, n['m'] + 12)
        chug.append(dict(t=n['t'], m=m, d=round(beat / 4.0 * 0.85, 3), v=84))
        chug.append(dict(t=round(n['t'] + beat / 4.0, 3), m=m, d=round(beat / 4.0 * 0.85, 3), v=66))

    # C 段（纯钢琴柱）补一层和声垫：每小节取贝斯根音升八度，拉长一整小节
    pad_c = []
    for b in range(int(C0 / bar), int(round(C1 / bar))):
        t0 = b * bar
        cand = [n for n in bass if t0 - 1e-6 <= n['t'] < t0 + bar - 1e-6]
        if not cand:
            continue
        cand.sort(key=lambda n: n['m'])
        pad_c.append(dict(t=round(t0, 3), m=min(96, cand[0]['m'] + 12),
                          d=round(bar * 0.98, 3), v=76))

    print('伴奏：stab %d / flow %d / strings %d / bass %d / sub %d / chug %d / pad_c %d'
          % (len(stab), len(flow), len(strings), len(bass), len(sub), len(chug), len(pad_c)))

    # 前奏渐入 + 主题进门抬升
    A0 = SEC['A'][0] * bar
    lead = fade_in(lead, 2.2, floor=0.55)
    cascade = fade_in(cascade, 1.4, floor=0.5)
    game_open = fade_in(game_open, 0.4, floor=0.7)
    lead = [dict(n, v=int(n['v'] * 0.96)) if n['t'] < A0 else n for n in lead]
    flow = fade_in(flow, A0 + 3 * beat, floor=0.45)
    stab = fade_in(stab, 1.6, floor=0.5)
    bass = fade_in(bass, A0 + 2 * beat, floor=0.55)
    strings = [dict(n, v=int(n['v'] * 1.10)) if n['t'] < A0 else n for n in strings]
    stab = [dict(n, v=int(n['v'] * 1.14)) if C0 <= n['t'] < C1 else n for n in stab]

    # ---- 鼓 ----
    drums = drums_arrange(ch[9], bar, thin_hat=args.hat_thin, thin_snare=0.10, thin_kick=0.075,
                          sections=('intro2', 'A', 'B', 'D'))
    # C 段鼓加倍：闭镲走十六分，底鼓加密
    drums += drums_arrange(ch[9], bar, thin_hat=0.101, thin_snare=0.10, thin_kick=0.06,
                           sections=('C',), vscale=1.06)
    # 前奏（原曲 0–8 只有第 8 小节的军鼓滚奏）：补底鼓脉冲 + 八分闭镲
    intro_d = []
    for b in range(2, 4):
        t0 = b * bar
        for i in (0, 2):
            intro_d.append([round(t0 + i * beat, 3), 0, 100])
        if b == 3:
            for i in range(8):
                intro_d.append([round(t0 + i * beat / 2.0, 3), 2, 44 if i % 2 == 0 else 32])
    drums = sorted(drums + intro_d, key=lambda x: (x[0], x[1]))
    # 段落起点的吊镲（循环第 0 拍也落一记，接回开头有落点）
    drums.append([0.0, 4, 76])
    for tag, v in (('intro2', 84), ('A', 112), ('B', 96), ('C', 92), ('D', 104)):
        drums.append([round(SEC[tag][0] * bar, 3), 4, v])
    drums.append([round((SEC['C'][0] + 2) * bar, 3), 4, 76])
    # 主题进门（8 小节）前两拍撤鼓；C→D 前一拍撤鼓，做「吸气」
    # 注意留 1e-3 的余量：吊镲时间被 round 到 13.333，正好落进「撤鼓」区间会被一起删掉
    drums = [d for d in drums if not (SEC['A'][0] * bar - 2 * beat <= d[0] < SEC['A'][0] * bar - 1e-3)]
    drums = [d for d in drums if not (SEC['D'][0] * bar - beat <= d[0] < SEC['D'][0] * bar - 1e-3)]
    # 段前 fill：C 前一小节、D 前一小节十六分军鼓
    for b, acc in ((SEC['C'][0] - 1, 40), (SEC['D'][0] - 1, 52)):
        for i in range(8):
            drums.append([round(b * bar + 2 * beat + i * beat / 4.0, 3), 1, acc + i * 6])

    # 主题进门前的最后一小节（12s 一带）：整小节十六分军鼓滚奏 + 底鼓 + 上升音
    A0 = SEC['A'][0] * bar
    fill_t0 = A0 - bar
    for i in range(16):
        drums.append([round(fill_t0 + i * beat / 4.0, 3), 1, int(52 + i * 4.2)])
    for i in (0, 2):
        drums.append([round(fill_t0 + i * beat, 3), 0, 108])
    # 正拍落点：吊镲 + 底鼓 + 一小节根音（原谱 bar 42 前 0.6 小节贝斯是空的，别留洞）
    drums.append([round(A0, 3), 0, 112])
    drums.append([round(A0 - beat, 3), 0, 100])
    drums.append([round(A0, 3), 1, 108])
    # 正拍后到主旋律进门（14.38）之间补八分闭镲，别让鼓断掉
    for i in range(1, 3):
        drums.append([round(A0 + i * beat / 2.0, 3), 2, 96 if i == 1 else 84])
    _nb = next((n for n in bass if n['t'] >= A0 - 1e-6), None)
    if _nb:
        bass.append(dict(t=round(A0, 3), m=_nb['m'], d=round(bar * 0.62, 3), v=104))
        sub.append(dict(t=round(A0, 3), m=max(12, _nb['m'] - 12), d=round(bar * 0.62, 3), v=104))
    # 上升音（triangle，16 个十六分，从 A3 爬到 D5），最后一音让给吊镲
    riser = []
    for i in range(16):
        m = 57 + round(24 * (i / 15.0))
        riser.append(dict(t=round(fill_t0 + i * beat / 4.0, 3), m=m,
                          d=round(beat / 4.0 * 0.9, 3), v=int(78 + i * 2.6)))
    # 主题进门后 1 小节的垫底和弦（主旋律 14.4s 才进，别让这 1 秒空着）
    # 主题进门那 1 秒（13.33–14.38）放游戏内原曲第 8 小节的句子（D4 C#4），
    # 再接原谱主旋律的 D4 G4…，两个版本在这里正好接上
    # 游戏内原曲第 8 小节那句（D4 → C#4）当「预告」，贴在主题正拍前
    _g8 = [n for n in game[0] if 8 * bar <= n[0] < 9.2 * bar][:2]
    hold = []
    _tt = A0 - bar * 0.5
    for _n in _g8:
        hold.append(dict(t=round(_tt, 3), m=_n[1], d=round(min(_n[2], bar * 0.34), 3),
                         v=min(108, int(_n[3]) + 4)))
        _tt += _n[2]
    # 12.0–13.33 这一小节高处是空的：补 1.3 秒高音长音（钩子的尾巴）+ 一小节和声垫
    game_open.append(dict(t=round(fill_t0 + 2 * beat, 3), m=80, d=1.30, v=88))
    for _m in (54, 58, 61):
        hold.append(dict(t=round(fill_t0, 3), m=_m, d=round(bar * 0.95, 3), v=64))
    # 收尾：最后一小节撤鼓 + 军鼓渐强接回开头
    drums = [d for d in drums if d[0] < duration - 2 * beat]
    for i in range(8):
        drums.append([round(duration - 2 * beat + i * beat / 4.0, 3), 1, 44 + i * 9])
    drums.sort(key=lambda x: (x[0], x[1]))

    # 前奏爬坡：0–2 小节压到 0.74、2–4 小节 0.88，让「瀑布 → 鼓进 → 全奏」一段段抬起来
    ramp_intro = lambda ns: [dict(n, v=int(n['v'] * (0.74 if n['t'] < 2 * bar else 0.88)))
                             if n['t'] < 4 * bar else n for n in ns]
    stab, strings, flow, bass, cascade = (ramp_intro(x) for x in (stab, strings, flow, bass, cascade))
    pad_c = fade_in(pad_c, 1.2 * beat, floor=0.6)

    (lead, octave, descant, stab, flow, strings, bass, sub, chug, pad_c,
     cascade, game_open, game_arp, riser, hold) = (
        clip(x, duration) for x in (lead, octave, descant, stab, flow, strings, bass, sub, chug,
                                    pad_c, cascade, game_open, game_arp, riser, hold))
    cnt = {}
    for d in drums:
        cnt[d[1]] = cnt.get(d[1], 0) + 1
    print('成品：lead %d / open %d / arp %d / cascade %d / octave %d / descant %d / stab %d / flow %d / strings %d / bass %d / sub %d / chug %d / pad_c %d / drums %d %s'
          % (len(lead), len(game_open), len(game_arp), len(cascade), len(octave), len(descant),
             len(stab), len(flow), len(strings), len(bass), len(sub), len(chug), len(pad_c), len(drums), cnt))
    if max(n['t'] for n in lead) >= duration:
        print('!! 主旋律超出长度')
    if args.check:
        return

    data = dict(key=SPEC['key'], title=SPEC['title'], duration=duration, bpm=int(round(args.bpm)),
                tracks=[dict(wave='square', gain=args.lead_gain, notes=lead),
                        dict(wave='square', gain=args.octave_gain, notes=octave),
                        dict(wave='triangle', gain=args.descant_gain, notes=descant),
                        dict(wave='triangle', gain=args.chug_gain, notes=chug),
                        dict(wave='triangle', gain=args.stab_gain, notes=stab),
                        dict(wave='triangle', gain=args.flow_gain, notes=flow),
                        dict(wave='triangle', gain=args.strings_gain, notes=strings),
                        dict(wave='sawtooth', gain=args.bass_gain, notes=bass),
                        dict(wave='sine', gain=args.sub_gain, notes=sub),
                        dict(wave='triangle', gain=0.052, notes=pad_c),
                        # 前奏三层：游戏内现役 long note 主旋律 + 十六分琶音 + 原曲钢琴瀑布（降为衬底）
                        dict(wave='square', gain=args.open_gain, notes=game_open),
                        dict(wave='triangle', gain=args.arp_gain, notes=game_arp),
                        dict(wave='triangle', gain=args.cascade_gain, notes=cascade),
                        dict(wave='triangle', gain=args.riser_gain, notes=riser),
                        dict(wave='triangle', gain=args.hold_gain, notes=hold)],
                drums=drums)
    data['reasons'] = [
        '主旋律 = ZUN 原曲谱的 square 主音 ch2（原曲 bar 40–69，全曲唯一的「会唱」段），144 BPM 原速不转调',
        '蓝本：refA 原曲（占大头主旋律）+ refB TAMUSIC 四重奏（弦乐长音、温暖）+ refC Arisaki Works（重军鼓摇滚）+ refD 双月 彩 150BPM（强前后拍、密集十六分）',
        '段落重排：原曲 0–8 瀑布前奏 → 40–56 主题 A → 56–70 主题 B（含 ch7 高音对句）→ 32–40 Dm 钢琴柱 build（半音上行）→ 40–56 再现加八度',
        '伴奏 = 原曲自己的钢琴柱 ch0 + 电钢流动线 ch3 + 击弦贝斯 ch4 + 弦乐 ch10/14 + 真鼓 ch9 抽稀',
        '前奏（0–8 小节）与游戏内现役 stage5 融合：借它的 long note 主旋律（D#5 G#5 A#5…）与十六分琶音，原曲钢琴瀑布降为衬底',
    ]
    head = """/**
 * 五面首领《幽雅に咲かせ、墨染の桜 ～ Border of Life》—— 墨染编（原曲主旋律占大头）。
 * 素材 = ZUN 原曲 TH07 扒谱 MIDI（144 BPM 原速，按小节网格重排，不信 tempo map）；
 * 主旋律 100% 原曲 square 主音；tools/boss5_yuuga.py 生成，勿手改。
 */
"""
    body = M.render_song_js(data, data['reasons'])
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
