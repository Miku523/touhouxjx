# -*- coding: utf-8 -*-
"""《風神少女》EX 口径重编：从原曲扒谱逐声部搬入，按「天狗的灵动与速度」重写律动。

数据源：tools/build/_aya_score.json（tools/build/_aya_orig.py 生成，原 MIDI 逐通道音符）
输出：src/engine/songs/aya_stage4_b.js  →  export const AYA_STAGE4 = { stage4: {...} }

用法：python tools/build/_aya_ex.py [--bars N] [--out 路径]
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SRC = 'tools/build/_aya_score.json'
OUT = 'src/engine/songs/aya_stage4_b.js'
TITLE = '風神少女'

SC = json.load(open(SRC, encoding='utf-8'))
BAR_SEC = SC['bar_sec']
STEP = SC['step']
BARS = SC['bars']

# —— 通道分工（原曲 10 条通道）——
# 0 trumpet 主旋律 / 1 tuba 对位低音 / 2 piano 主体 / 6 organ 高音 / 7 trumpet 副旋律
# 8 tuba / 9 drums / 10 acoustic bass / 11 strings / 12 bass(低八度)
SPEC = dict(
    bpm=154,
    master=1.45,
    dur_bars=101,          # 即 1..100 小节，与线上现版本同长（155.84s）
    tracks=[
        # name        ch  wave        gain   opt
        dict(name='lead', ch=0, wave='sawtooth', gain=0.100),
        dict(name='lead2', ch=7, wave='square', gain=0.060),
        dict(name='piano', ch=2, wave='triangle', gain=0.064, poly=2, max_dur=1.4,
             wins=[(1, 28, 1.12)]),
        dict(name='organ', ch=6, wave='square', gain=0.046, max_dur=2.0),
        dict(name='glass', ch=2, wave='sine', gain=0.034, tr=12, poly=1, max_dur=0.8),
        dict(name='sparkle', ch=6, wave='sine', gain=0.024, tr=12, max_dur=1.2),
        dict(name='brass', ch=1, wave='triangle', gain=0.040, poly=2),
        dict(name='lowbrass', ch=8, wave='triangle', gain=0.024, poly=2),
        dict(name='strings', ch=11, wave='sine', gain=0.040, poly=2, max_dur=3.0),
        dict(name='bass', ch=10, wave='triangle', gain=0.048, mono=True,
             wins=[(1, 28, 1.10), (28, 101, 1.0)]),
        dict(name='sub', ch=12, wave='sine', gain=0.008, mono=True, density=0.5,
             wins=[(1, 28, 0.45)]),
    ],
)

DRUM_MAP = {35: 0, 36: 0, 37: 1, 38: 1, 39: 1, 40: 1, 41: 1, 43: 1, 45: 1, 47: 1, 48: 1, 50: 1,
            42: 2, 44: 2, 46: 3, 51: 3, 53: 3, 59: 3, 49: 4, 52: 4, 55: 4, 57: 4}
DRUM_GAIN = {0: 0.88, 1: 0.90, 2: 0.62, 3: 0.66, 4: 0.92}


def channel_notes(ch):
    rows = SC['ch'].get(str(ch), [])
    out = []
    for r in rows:
        b, sub, m, ln, vel = r[0], r[1], r[2], r[3], r[4]
        t = (b - 1) * BAR_SEC + sub * STEP
        d = max(0.05, ln * STEP)
        out.append(dict(t=t, d=d, m=m, v=vel))
    return out


def top_n(notes, n):
    """同一时刻最多 n 个音，保留最高的 n 个（旋律优先）。"""
    notes = sorted(notes, key=lambda x: (round(x['t'], 4), -x['m']))
    out, i = [], 0
    while i < len(notes):
        t0 = round(notes[i]['t'], 4)
        grp = []
        while i < len(notes) and round(notes[i]['t'], 4) == t0:
            grp.append(notes[i])
            i += 1
        out.extend(grp[:n])
    return sorted(out, key=lambda x: (x['t'], x['m']))


def monophonic(notes, min_dur=0.05):
    notes = sorted(notes, key=lambda x: (x['t'], -x['m'], x['d']))
    out = []
    for n in notes:
        if out and n['t'] < out[-1]['t'] + out[-1]['d'] - 1e-6:
            prev = out[-1]
            prev['d'] = max(min_dur, n['t'] - prev['t'])
        out.append(dict(n))
    return out


def build():
    bars_end = SPEC['dur_bars']
    t_end = (bars_end - 1) * BAR_SEC
    tracks = []
    for L in SPEC['tracks']:
        ns = channel_notes(L['ch'])
        tr = L.get('tr', 0)
        gain = round(L['gain'] * SPEC['master'], 4)
        rows = []
        for n in ns:
            m = n['m'] + tr
            if not (12 <= m <= 120):
                continue
            if n['t'] >= t_end:
                continue
            rows.append(dict(t=round(n['t'], 3), d=round(min(L.get('max_dur', 4.0), n['d']), 3),
                             m=m, v=n['v']))
        if L.get('density'):
            step = max(1, int(round(1.0 / L['density'])))
            rows = rows[::step]
        if L.get('mono'):
            rows = monophonic(rows)
        if L.get('poly'):
            rows = top_n(rows, L['poly'])
        if L.get('wins'):
            for r in rows:
                bar = int(r['t'] / BAR_SEC) + 1
                for a, b, mult in L['wins']:
                    if a <= bar < b:
                        r['v'] = max(1, min(127, int(r['v'] * mult)))
                        break
        rows.sort(key=lambda x: (x['t'], x['m']))
        peak = max((min(0.2, gain * (0.4 + 0.6 * x['v'] / 127)) for x in rows), default=0)
        tracks.append(dict(wave=L['wave'], gain=gain,
                           notes=[[x['t'], x['m'], x['d'], x['v']] for x in rows]))
        print('  %-9s %-9s gain %.3f  %4d 音  单音峰值 %.3f' % (L['name'], L['wave'], gain, len(rows), peak))

    # —— 鼓：原曲通道 9 打底，另加天狗的「跑动感」层 ——
    drums = []
    for n in channel_notes(9):
        if n['t'] >= t_end:
            continue
        kind = DRUM_MAP.get(n['m'])
        if kind is None:
            continue
        v = n['v']
        if kind == 2:                      # 闭镲：16 分全留，抬亮（细密跑动感靠它）
            v = int(v * 0.95)
        elif kind == 1:
            v = int(v * 0.92)
        elif kind == 0:                    # 底鼓：合成器的 kick 低频太霸，压轻才跑得起来
            v = int(v * 0.55)
        drums.append([round(n['t'], 3), kind, max(1, min(127, v))])

    # 起风：前奏 1–5 小节补一层极轻的十六分闭镲，让「风」先跑起来
    for b in range(1, 5):
        t0 = (b - 1) * BAR_SEC
        sixteenth = BAR_SEC / 16.0
        for i in range(16):
            drums.append([round(t0 + sixteenth * i, 3), 2, 16 + int(20 * i / 15.0)])
    # 段首吊镲（每 8 小节）
    for b in range(1, bars_end, 8):
        drums.append([round((b - 1) * BAR_SEC, 3), 4, 96])
    # 双踩点：每小节第 3 拍后半与第 4 拍后半各补一记，制造追赶感
    for b in range(9, bars_end):
        t0 = (b - 1) * BAR_SEC
        beat = BAR_SEC / 4.0
        drums.append([round(t0 + beat * 2.5, 3), 0, 58])
        drums.append([round(t0 + beat * 3.5, 3), 0, 54])
    # 过门：每 8 小节最后一拍半塞军鼓 + 落地通鼓
    for b in range(8, bars_end, 8):
        t0 = (b - 1) * BAR_SEC
        beat = BAR_SEC / 4.0
        for i in range(3):
            drums.append([round(t0 + beat * (3 + i * 0.33), 3), 1, 60 + i * 14])
    drums.sort(key=lambda x: (x[0], x[1]))
    # 同刻同类去重
    ded = []
    for d in drums:
        if ded and d[0] == ded[-1][0] and d[1] == ded[-1][1]:
            ded[-1][2] = max(ded[-1][2], d[2])
            continue
        ded.append(d)
    drums = ded

    print('  鼓 %d 条（%.1f 秒）' % (len(drums), t_end))
    return dict(title=TITLE, duration=round(t_end, 4), bpm=SPEC['bpm'],
                tracks=tracks, drums=drums)


def notes_js(rows):
    return '[' + ','.join('[%g,%d,%g,%d]' % (t, m, d, v) for t, m, d, v in rows) + ']'


def write_js(song, path=OUT):
    lines = ['// 自动生成：python tools/build/_aya_ex.py（《風神少女》按原曲逐声部搬入）',
             '// 源：tools/build/_aya_score.json；旋律与和声不改，重写的只有鼓组与响度平衡。',
             'export const AYA_STAGE4 = {', '  stage4: {',
             "    title: '%s'," % song['title'],
             '    duration: %g,' % song['duration'],
             '    bpm: %g,' % song['bpm'],
             '    tracks: [']
    for t in song['tracks']:
        lines.append("      { wave: '%s', gain: %g, notes: %s }," % (t['wave'], t['gain'], notes_js(t['notes'])))
    lines.append('    ],')
    lines.append('    drums: [' + ','.join('[%g,%d,%d]' % (a, b, c) for a, b, c in song['drums']) + '],')
    lines += ['  },', '};', '']
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
    print('写入 %s  %.1f KB' % (path, len('\n'.join(lines)) / 1024))


if __name__ == '__main__':
    print('《風神少女》逐声部搬入，窗口 1..%d 小节' % (SPEC['dur_bars'] - 1))
    song = build()
    write_js(song)
    print('合计 %d 轨 / %d 音 / %d 鼓 / %.2f 秒' % (
        len(song['tracks']), sum(len(t['notes']) for t in song['tracks']), len(song['drums']), song['duration']))
