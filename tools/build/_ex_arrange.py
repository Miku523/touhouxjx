# -*- coding: utf-8 -*-
"""
EX 两面新编曲：直接按 ZUN 原曲 MIDI 逐声部搬进曲库，只改编配、音色、鼓组与总线。

王女（REMILIA_EX / ex_mid）：原曲 145 BPM 4/4 的钢琴+弦乐+小号+管风琴原编制照搬，
  新编的只有鼓（定音鼓式底鼓 + 大吊镲）与低八度低音 —— 目标是「威严」而不是摇滚。
U.N.（UN_MAD / extra）：原曲 155 BPM 4/4，去掉鼓组、把织体抬到高音区、中间留空洞；
  渲染 WAV 时再挂一层环形大厅混响（见 _make_ex_un_wav.py）—— 空旷、孤独。

用法：python tools/build/_ex_arrange.py [sep|un|all]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from midi2js import (parse_midi, extract_channels, tick_to_sec,  # noqa: E402
                     cap_poly, to_monophonic, notes_js, drums_js)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIDI_DIR = os.path.join(
    r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main',
    '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil')
OUT_DIR = os.path.join(ROOT, 'src', 'engine', 'songs')

BEAT_TICKS = 480


def load(name):
    m = parse_midi(os.path.join(MIDI_DIR, name))
    chans, segs, div = extract_channels(m)
    grid_ticks = div * 4

    def tick_at(t):
        return tick_to_sec(segs, div, int(round(t)))

    # 原 MIDI 第 0 小节是空引子；以第 1 小节线为新原点
    end = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    bar_len = tick_at(grid_ticks) - tick_at(0)
    nb = int(end / bar_len) + 3
    bar_t = [tick_at(k * grid_ticks) for k in range(nb + 2)]
    beat_t = lambda bar, beat: tick_at(bar * grid_ticks + beat * BEAT_TICKS)
    return chans, bar_t, beat_t


def layer_notes(chans, L, spec_tr, shift, dur):
    """取一个通道的音符，做移调/力度/时值/复音/稀疏化处理。"""
    src = chans.get(L['ch'], {}).get('notes') or []
    tr = spec_tr + L.get('tr', 0)
    vs = L.get('vel_scale', 1.0)
    ds = L.get('dur_scale', 1.0)
    lo_max = L.get('max_dur', 8.0)
    dens = L.get('density', 1.0)
    out = []
    for i, n in enumerate(src):
        if dens < 1.0 and (i % 100) / 100.0 >= dens:
            continue
        t = n['t'] - shift
        if t < -1e-6 or t >= dur:
            continue
        m = n['m'] + tr
        if not (12 <= m <= 120):
            continue
        d = max(0.05, min(lo_max, max(0.05, n['d'] * ds)))
        v = max(1, min(127, int(round(n['v'] * vs))))
        out.append(dict(t=round(t, 3), d=round(d, 3), m=m, v=v))
    out.sort(key=lambda n: (n['t'], n['m']))
    if L.get('mono'):
        out = to_monophonic(out)
    if L.get('poly'):
        # cap_poly 按遍历顺序留前几个：默认留**最高**的几个音，
        # 这样和弦的上方声部（旋律/泛音）不会被砍掉，织体才立得起来。
        if L.get('poly_keep', 'top') == 'top':
            out = sorted(out, key=lambda n: (n['t'], -n['m']))
        out = cap_poly(out, L['poly'])
        out.sort(key=lambda n: (n['t'], n['m']))
    return out


def sec_mult(t, windows):
    for (b0, b1, k) in windows:
        if b0 <= t < b1:
            return k
    return 1.0


def build_song(spec):
    chans, bar_t, beat_t = load(spec['mid'])
    shift = bar_t[1]
    nbars = spec['duration_bars']
    dur = round(bar_t[nbars] - shift, 3)
    spec_tr = spec.get('tr', 0)

    def wsec(wins):
        return [(bar_t[b0] - shift, bar_t[b1] - shift, k) for (b0, b1, k) in wins]

    master = spec.get('master', 1.0)
    dyn = wsec(spec['dyn'])
    tracks, stats = [], []
    for L in spec['layers']:
        ns = layer_notes(chans, L, spec_tr, shift, dur)
        wins = wsec(L['wins']) if L.get('wins') else dyn
        for n in ns:
            n['v'] = max(1, min(127, int(round(n['v'] * sec_mult(n['t'], wins)))))
        ns = [n for n in ns if n['v'] > 0]
        g = round(L['gain'] * master, 4)
        peak = min(0.2, g * (0.4 + 0.6 * 120 / 127.0))
        stats.append((L['name'], len(ns), peak))
        tracks.append(dict(wave=L['wave'], gain=g, notes=ns))

    drums = spec['drums'](chans, bar_t, beat_t, nbars, shift) if spec.get('drums') else []
    drums = [(round(t - shift, 3), k, v) for (t, k, v) in drums if 0 <= t - shift < dur]
    drums.sort()

    data = dict(title=spec['title'], duration=dur, bpm=spec['bpm'],
                tracks=tracks, drums=drums, warm=spec.get('warm', False))
    return data, stats


def write_js(spec, data, stats):
    lines = ['/**', ' * %s' % spec['head1']]
    for ln in spec['head']:
        lines.append(' * %s' % ln)
    lines.append(' * tools/build/_ex_arrange.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const %s = {' % spec['export'])
    lines.append('  %s: {' % spec['key'])
    lines.append('    title: "%s",' % data['title'])
    lines.append('    duration: %s,' % ('%.3f' % data['duration']).rstrip('0').rstrip('.'))
    lines.append('    bpm: %g,' % data['bpm'])
    if data.get('warm'):
        lines.append('    warm: true,')
    lines.append('    tracks: [')
    for tr in data['tracks']:
        g = ('%.3f' % tr['gain']).rstrip('0').rstrip('.')
        lines.append("      { wave: '%s', gain: %s, notes: %s },"
                     % (tr['wave'], g, notes_js(tr['notes'])))
    lines.append('    ],')
    lines.append('    drums: %s,' % drums_js(data['drums']))
    lines.append('  },')
    lines.append('};')
    out = os.path.join(OUT_DIR, spec['file'])
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    total = sum(len(t['notes']) for t in data['tracks'])
    last = max([n['t'] for t in data['tracks'] for n in t['notes']] or [0])
    print('- %s  %.1fs（末音起 %.1fs）  %d 轨  %d 音  %d 鼓  %.0fKB'
          % (spec['file'], data['duration'], last, len(data['tracks']),
             total, len(data['drums']), os.path.getsize(out) / 1024.0))
    for name, cnt, peak in stats:
        print('    %-8s %5d 音  单音峰值 %.3f' % (name, cnt, peak))



# ------------------------------------------------------------------ 原曲鼓组
# GM 打击乐音高 → 引擎鼓：0 底鼓 / 1 军鼓 / 2 闭镲 / 3 开镲 / 4 吊镲
DRUM_MAP = {
    35: 0, 36: 0,                      # 原声底鼓 / 低音鼓
    37: 1, 38: 1, 39: 1, 40: 1,        # 边击 / 军鼓 / 拍手 / 电军鼓
    41: 1, 43: 1, 45: 1, 47: 1,        # 落地鼓 / 军鼓 / 低音鼓 / 中音鼓
    48: 1, 50: 1,                      # 高音鼓 / 高音鼓
    42: 2, 44: 2,                      # 闭镲 / 踩镲
    46: 3,                             # 开镲
    49: 4, 52: 4, 55: 4, 57: 4,        # 吊镲 / 中国镲 / 溅镲 / 碎镲
    51: 3, 53: 3, 59: 3,               # 叮叮镲（当开镲用，带余音）
}
DRUM_GAIN = {0: 0.85, 1: 0.88, 2: 0.5, 3: 0.62, 4: 0.92}


def native_drums(chans, bar_t, beat_t, nbars, shift, thin_hats=True, gain=None):
    """把 ZUN 原曲打击乐通道照搬过来；needle 只做「稀疏化」，不改节奏位置。"""
    notes = (chans.get(9) or {}).get('notes') or []
    out, hat_i = [], 0
    for n in sorted(notes, key=lambda x: (x['t'], x['m'])):
        kind = DRUM_MAP.get(n['m'])
        if kind is None:
            continue
        if kind == 2 and thin_hats:      # 闭镲太密会盖住弦乐：隔一个丢一个
            hat_i += 1
            if hat_i % 2 == 0:
                continue
        t = n['t'] - shift
        if t < 0:
            continue
        g = (gain or DRUM_GAIN)[kind]
        out.append((n['t'], kind, max(1, min(127, int(round(n['v'] * g))))))
    return out

# ------------------------------------------------------------------ 鼓组
def sep_drums(chans, bar_t, beat_t, nbars, shift):
    """威严：先照搬 ZUN 原曲的鼓（稀疏掉一半闭镲），再叠一层加冕用的重音。"""
    out = native_drums(chans, bar_t, beat_t, nbars, shift)
    # 闭镲只留 8 分位置：原曲的 16 分碎镲会盖住弦乐，也会把「威严」打散
    kept = []
    for (t, kind, v) in out:
        if kind == 0:                   # 原曲底鼓在 8 分上，这里只留四分位置：更沉、更慢
            k = 0
            while k + 1 < len(bar_t) and bar_t[k + 1] <= t:
                k += 1
            bl = (bar_t[k + 1] - bar_t[k]) / 4.0
            ph = ((t - bar_t[k]) / bl) % 1.0
            ph = min(ph, 1.0 - ph)
            if ph > 0.22:
                continue
        if kind == 2:
            k = 0
            while k + 1 < len(bar_t) and bar_t[k + 1] <= t:
                k += 1
            bl = (bar_t[k + 1] - bar_t[k]) / 4.0
            ph = ((t - bar_t[k]) / bl) % 1.0
            ph = min(ph, 1.0 - ph)
            if ph > 0.11:
                continue
        kept.append((t, kind, v))
    out = kept
    marks = [1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81]
    for b in marks:                       # 段首大吊镲：压得住
        if b < nbars:
            out.append((bar_t[b], 4, 104))
    for b in range(1, nbars):             # 正拍再补一记定音鼓式底鼓
        out.append((beat_t(b, 0), 0, 104))
        if b >= 49:
            out.append((beat_t(b, 2), 0, 92))     # 高潮段 1、3 拍双踩
    for b in (8, 24, 48, 64, 72, 80):     # 换段前的定音鼓滚
        for i in range(4):
            out.append((beat_t(b, 2 + i * 0.5), 0, 66 + i * 14))
    for b in (nbars - 2, nbars - 1):
        out.append((bar_t[b], 4, 112))
    return out


def un_drums(chans, bar_t, beat_t, nbars, shift):
    """空旷 → 炸裂：前段几乎空白（只有远处的雷），63 小节起整组鼓压上来。"""
    out = []
    # 段首远处的雷：越往后越近
    for b, v in ((19, 44), (35, 52), (55, 64), (63, 120), (71, 108), (79, 116)):
        if 1 <= b < nbars:
            out.append((bar_t[b], 4, v))
    # 进 63 前的军鼓滚：61 小节后半到 62 小节整小节（两小节长滚）
    for i in range(6):
        out.append((beat_t(61, 2 + i * 0.33), 1, 40 + i * 6))
    for i in range(8):
        out.append((beat_t(62, i * 0.5), 1, 54 + i * 7))
    # 63 起炸裂：底鼓四分、军鼓 2/4、八分闭镲
    for b in range(63, nbars):
        for beat, v in ((0, 116), (1, 88), (2, 108), (3, 88)):
            out.append((beat_t(b, beat), 0, v))
        for i in range(4):                      # 双踩：四分之间再插一记八分底鼓
            out.append((beat_t(b, i + 0.5), 0, 66 + (i % 2) * 8))
        for beat in (1, 3):
            out.append((beat_t(b, beat), 1, 96))
        for i in range(8):
            out.append((beat_t(b, i * 0.5), 2, 34 + (i % 2) * 16))
        if b % 4 == 3:
            out.append((beat_t(b, 3.5), 3, 46))
    # 79 前的大滚 + 结尾重击
    for i in range(8):
        out.append((beat_t(78, i * 0.5), 1, 52 + i * 9))
    for b in (nbars - 2, nbars - 1):
        out.append((bar_t[b], 4, 120))
        out.append((bar_t[b], 0, 116))
    out.sort(key=lambda x: (x[0], x[1]))
    return out


# ------------------------------------------------------------------ 王女
SEP = dict(
    file='septette_ex.js', export='REMILIA_EX', key='ex_mid',
    mid='13. Septette for a Dead Princess (ZUN).mid',
    title='亡き王女の為のセプテット（血月王座编）',
    bpm=145.0, duration_bars=83, warm=True, tr=1, master=1.45,
    head1='EX 中段《亡き王女の為のセプテット》—— 血月王座编',
    head=[
        '按 ZUN 原曲（145 BPM 4/4）逐声部搬入：钢琴、弦乐、小号、管风琴、贝斯一个音没改，',
        '段落与配器层次照原曲走。重写的只有鼓（定音鼓式底鼓 + 大吊镲）与低八度低音。',
        '弦乐、管风琴、贝斯全部压在中低音区，高音只留小号一条线 —— 要的是「威严」：',
        '不是摇滚式的猛，是宫座上缓缓压下来的重；每一句都踩在正拍上，不抢、不飘。',
        '主旋律 = 原曲 ch3 小号顶线（ch10 为其低八度平行线）。',
    ],
    dyn=[(1, 9, 0.92), (9, 25, 0.96), (25, 49, 1.0), (49, 73, 1.10), (73, 83, 1.02)],
    layers=[
        # 主旋律：小号
        dict(name='lead', ch=3, wave='sawtooth', gain=0.096),
        dict(name='lead8', ch=10, wave='square', gain=0.038),
        dict(name='cnt6', ch=6, wave='triangle', gain=0.034, poly=2),
        dict(name='cnt7', ch=7, wave='square', gain=0.022, poly=2),
        # 钢琴：右手分解 + 左手八度，压低一点让弦乐有空间
        dict(name='piano', ch=2, wave='triangle', gain=0.038, poly=2, max_dur=2.0),
        dict(name='piano_l', ch=13, wave='square', gain=0.016, poly=2, max_dur=2.0,
             wins=[(1, 9, 1.25), (9, 83, 0.55)]),
        dict(name='intro_bass', ch=8, wave='sine', gain=0.026, poly=2, max_dur=2.5),
        dict(name='arp', ch=5, wave='triangle', gain=0.013, mono=True, max_dur=1.2, density=0.62),
        # 弦乐 / 管风琴
        dict(name='strings', ch=4, wave='triangle', gain=0.056, poly=3, max_dur=4.0),
        dict(name='str_hi', ch=12, wave='triangle', gain=0.040, poly=2, max_dur=4.0),
        dict(name='organ', ch=14, wave='square', gain=0.030, poly=2, max_dur=4.0),
        # 贝斯：三角波 + 正弦低八度
        dict(name='bass', ch=1, wave='triangle', gain=0.062, mono=True, max_dur=4.0),
        dict(name='sub', ch=1, wave='sine', gain=0.014, tr=-12, mono=True, max_dur=4.0),
    ],
    drums=sep_drums,
)

# ------------------------------------------------------------------ U.N.
UN = dict(
    file='un_mad.js', export='UN_MAD', key='extra',
    mid='15. U.N. Owen was her (ZUN).mid',
    title='U.N.オーエンは彼女なのか？（空旷编）',
    bpm=155.0, duration_bars=81, warm=True, tr=-4, master=1.9,
    head1='EX Boss《U.N.オーエンは彼女なのか？》—— 空旷编',
    head=[
        '按 ZUN 原曲（155 BPM 4/4）逐声部搬入，旋律与和声一个音没改，段落照原曲。',
        '改编只做减法与挪位：鼓组拿掉（只留远处的心跳和一记吊镲），织体抬到高音区、',
        '低音压到 D 以下，中间的分解段几乎只剩钢琴在往上爬；渲染 WAV 时再挂一层',
        '环形大厅混响（尾音折回开头，循环无缝）。要的是「空旷」与「孤独」——',
        '不是安静，是没人回应：每个音都落在很远的地方，回来的时候已经不是原来的音了。',
        '主旋律 = 原曲 ch2 的高音线，ch6 为其高八度幽灵层；ch3 钢琴与 ch4 弦乐铺在中层。',
    ],
    dyn=[(1, 11, 0.92), (11, 19, 0.74), (19, 35, 0.92), (35, 47, 0.95),
         (47, 55, 0.48), (55, 63, 0.90), (63, 81, 1.10)],
    layers=[
        dict(name='lead', ch=2, wave='triangle', gain=0.056, mono=True),
        dict(name='halo', ch=6, wave='sine', gain=0.030, mono=True),
        dict(name='piano', ch=3, wave='square', gain=0.044, poly=2, max_dur=2.5),
        dict(name='pad', ch=4, wave='triangle', gain=0.040, poly=3, max_dur=4.0),
        dict(name='air', ch=4, wave='sine', gain=0.014, tr=12, poly=2, max_dur=4.0),
        dict(name='strings8', ch=8, wave='sine', gain=0.030, poly=2, max_dur=3.0),
        dict(name='organ', ch=10, wave='sine', gain=0.016, mono=True,
             wins=[(1, 63, 0.55), (63, 81, 1.0)]),
        dict(name='bell', ch=5, wave='triangle', gain=0.040, max_dur=2.0),
        dict(name='vibes', ch=7, wave='triangle', gain=0.030, poly=2, max_dur=2.0),
        dict(name='rise', ch=13, wave='triangle', gain=0.036),
        dict(name='bass', ch=1, wave='triangle', gain=0.054, mono=True, max_dur=4.0),
        dict(name='sub', ch=1, wave='sine', gain=0.026, tr=-12, mono=True, max_dur=4.0),
        # —— 狂气层：只在后半段与高潮亮出来，前面继续空着
        dict(name='mad', ch=2, wave='sawtooth', gain=0.048, mono=True,
             wins=[(1, 19, 0.0), (19, 35, 0.45), (35, 47, 0.0), (47, 55, 0.0),
                   (55, 63, 0.7), (63, 81, 1.0)]),
        dict(name='razor', ch=13, wave='sawtooth', gain=0.028, mono=True,
             wins=[(1, 55, 0.0), (55, 63, 0.5), (63, 81, 1.0)]),
        dict(name='stab', ch=3, wave='sawtooth', gain=0.034, poly=2, max_dur=0.3,
             wins=[(1, 63, 0.0), (63, 81, 1.0)]),
        dict(name='shriek', ch=5, wave='sine', gain=0.024, tr=12, max_dur=1.6,
             wins=[(1, 63, 0.0), (63, 81, 1.0)]),
        dict(name='organ2', ch=10, wave='sawtooth', gain=0.024, mono=True, max_dur=4.0,
             wins=[(1, 63, 0.0), (63, 81, 1.0)]),
        dict(name='dirt', ch=2, wave='square', gain=0.050, mono=True,
             wins=[(1, 55, 0.0), (55, 63, 0.55), (63, 81, 1.0)]),
        dict(name='dirt8', ch=10, wave='square', gain=0.042, tr=-12, mono=True, max_dur=4.0,
             wins=[(1, 63, 0.0), (63, 81, 1.0)]),
        dict(name='dirt5', ch=2, wave='square', gain=0.022, tr=7, mono=True, max_dur=2.0,
             wins=[(1, 63, 0.0), (63, 81, 1.0)]),
    ],
    drums=un_drums,
)

SPECS = dict(sep=SEP, un=UN)


def main():
    which = (sys.argv[1] if len(sys.argv) > 1 else 'all').lower()
    picks = ['sep', 'un'] if which == 'all' else [which]
    for k in picks:
        data, stats = build_song(SPECS[k])
        write_js(SPECS[k], data, stats)


if __name__ == '__main__':
    main()
