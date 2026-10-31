# -*- coding: utf-8 -*-
"""tools/build/_rumia_compose.py -- 一面 Boss《妖魔夜行》（红夜小径编）

素材 = ZUN 原曲 TH06 扒谱 MIDI（3. Apparitions Stalk the Night (ZUN).mid）：
原曲 34 小节 / 55.77s / 146→144 BPM / 降 E 小调。逐音搬入 + 重新配器：
- 原曲 bar1-9 风琴前奏（之前版本被砍，这版恢复）、bar10-17 铁琴过门、bar18-34 主题，全部保留
- 新增 11 秒引子（八音盒主题头 + 暗色 drone + 钟摆）、10 秒黑暗桥段、主题变奏（重配器）、尾声
- 总长 113.0s，仍是原曲的和声与旋律，不加外来语法

生成 src/engine/songs/youma_stage1.js（导出 YOUMA_STAGE1.stage1）与 tools/build/_rumia_lead/song.json
"""
import sys, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

MIDI = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil',
                    '3. Apparitions Stalk the Night (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'youma_stage1.js')
LEAD_DIR = os.path.join(ROOT, 'tools', 'build', '_rumia_lead')
OUT_JSON = os.path.join(LEAD_DIR, 'song.json')

BPM = 146.0
TITLE = '妖魔夜行'
KEY = 'stage1'
EXPORT = 'YOUMA_STAGE1'

# ---- 时长版图（秒，基于原曲真实时间轴，只是把原曲整块后移） ----
INTRO = 11.0
BRIDGE = 10.0
CODA = 10.75
# 原曲首音 2.009s（鼓 pickup）/ 末音 55.765s
ORIG_T0 = None     # 运行时从数据算
ORIG_END = None

TRACKS = []
BY = {}

def add(name, t, m, d, v=100):
    if t < 0 or not (0 <= m <= 127):
        return
    BY[name].append([round(max(0.0, t), 3), int(round(m)), round(max(0.03, d), 3), int(max(1, min(127, v)))])

DRUMS = []
def drum(t, kind, vel=100, span=None):
    if t < 0:
        return
    ev = [round(max(0.0, t), 3), int(kind), int(max(1, min(127, vel * 0.85)))]
    if span is not None:
        ev.append(round(span, 3))
    DRUMS.append(ev)

def load():
    mid = M.parse_midi(MIDI)
    ch, segs, div = M.extract_channels(mid)
    return {c: d['notes'] for c, d in ch.items()}

CH = {
    'bass': 1, 'lead': 2, 'counter': 3, 'piano_dup': 4, 'strings': 5, 'vibes': 6,
    'rockorgan': 7, 'organ_hi': 8, 'drums': 9, 'chords': 10, 'organ_lo': 11,
    'bass_dup': 12, 'piano_low': 14,
}

# ---------- 原曲素材搬运 ----------

def orig_pass(off, mode):
    """把原曲整块搬到时间 off（off = 原曲 t=0 的落点）。mode: 'faithful' | 'variation'"""
    for ch_name, chno in CH.items():
        if ch_name == 'drums':
            continue
        notes = CH_NOTES.get(chno, [])
        for n in notes:
            t = n['t'] + off
            m = n['m']
            d = max(0.05, n['d'])
            v = n['v']
            if mode == 'faithful':
                faithful_voice(ch_name, t, m, d, v)
            else:
                variation_voice(ch_name, t, m, d, v)
    # 鼓
    for n in CH_NOTES.get(9, []):
        t = n['t'] + off
        k = DRUM_MAP.get(n['m'])
        if k is None:
            continue
        if mode == 'faithful':
            drum(t, k, n['v'])
        else:
            drum(t, k, min(127, int(n['v'] * 1.06)))
            if k == 0 and n['v'] >= 100:
                drum(t + 0.0, 2, 42)          # 变奏段：底鼓叠一记闭镲
            if k == 2 and n['v'] >= 90:
                drum(t + 0.125, 2, 34)         # 16 分补一拍

DRUM_MAP = {36: 0, 35: 0, 38: 1, 40: 1, 37: 1, 42: 2, 62: 2, 63: 2, 44: 2,
            46: 3, 49: 4, 57: 4, 51: 7, 53: 7, 45: 5, 47: 5, 48: 6, 41: 6}

def faithful_voice(ch, t, m, d, v):
    if ch == 'lead':
        add('lead', t, m, d * 0.96, min(127, int(v * 1.25)))
        add('piano', t, m, d * 0.7, int(v * 0.42))         # 原谱 ch4 钢琴同度加倍
    elif ch == 'piano_dup':
        pass                                              # 已并进 lead 的 piano 层
    elif ch == 'piano_low':
        add('piano', t, m, d * 0.8, int(v * 0.5))         # ch14 低八度
    elif ch == 'counter':
        add('piano', t, m, d * 0.9, int(v * 0.72))        # ch3 钢琴对句
    elif ch == 'vibes':
        add('bell', t, m, min(d, 1.2), v)                 # ch6 铁琴
    elif ch == 'strings':
        add('strings', t, m, min(d, 4.0), int(v * 0.85))
    elif ch == 'organ_hi':
        add('harpsi', t, m, d * 0.92, int(v * 0.95))      # ch8 风琴 16 分琶音
        add('pad', t, m - 12 if m >= 60 else m, min(d, 1.6), int(v * 0.30))
    elif ch == 'organ_lo':
        add('counter', t, m, d * 0.9, int(v * 0.30))      # ch11 低八度
    elif ch == 'rockorgan':
        add('pad', t, m, min(d, 3.2), int(v * 0.55))      # ch7 长和弦
    elif ch == 'bass':
        add('bass', t, m, d * 0.9, v)
        add('sub', t, m, d * 0.9, int(v * 0.5))
    elif ch == 'bass_dup':
        pass
    elif ch == 'chords':
        add('guitar', t, m, d * 0.8, min(127, int(v * 0.82)))  # ch10 电吉他切分

def variation_voice(ch, t, m, d, v):
    if ch == 'lead':
        add('lead', t, m, d * 0.9, min(127, int(v * 1.02)))
        add('bell', t, m + 12, min(d, 0.9), int(v * 0.55))   # 八音盒高八度
        add('strings', t, m + 12, min(d, 2.0), int(v * 0.42))
    elif ch == 'piano_dup':
        pass
    elif ch == 'piano_low':
        add('piano', t, m, d * 0.75, int(v * 0.45))
    elif ch == 'counter':
        add('harpsi', t, m, d * 0.85, int(v * 0.75))
    elif ch == 'vibes':
        add('bell', t, m, min(d, 1.2), int(v * 0.9))
    elif ch == 'strings':
        add('strings', t, m, min(d, 4.0), int(v * 1.0))
        add('choir', t, m, min(d, 3.0), int(v * 0.45))
    elif ch == 'organ_hi':
        add('bell', t, m - 12 if m >= 72 else m, d * 0.9, int(v * 0.38))
    elif ch == 'organ_lo':
        pass
    elif ch == 'rockorgan':
        add('pad', t, m, min(d, 3.2), int(v * 0.6))
    elif ch == 'bass':
        add('bass', t, m, d * 0.85, min(127, int(v * 1.05)))
        add('sub', t, m - 12, d * 0.85, int(v * 0.6))
    elif ch == 'bass_dup':
        pass
    elif ch == 'chords':
        add('brass', t, m, min(d, 0.6), int(v * 0.62))    # 变奏：和弦切分换铜管
        add('harpsi', t, m + 12, d * 0.7, int(v * 0.32))

# ---------- 新写段落 ----------

THEME_HEAD = [(0.0, 75, 0.55), (0.62, 78, 0.45), (1.10, 80, 0.55), (1.72, 82, 0.55),
              (2.30, 80, 0.40), (2.74, 82, 0.35), (3.10, 80, 0.35), (3.48, 78, 0.7)]
Ebm = [39, 46, 51]          # Eb2 Bb2 Eb3
Bbm = [46, 53, 58]          # Bb2 F3 Bb3
Gbmaj7 = [42, 49, 53, 58]   # Gb2 Db3 F3 Bb3

def intro():
    # 1) 低音 drone（pad）+ 暗色 choir
    for t0, dur, chord, gain_vel in ((0.0, 6.0, Ebm, 44), (5.6, 5.4, Gbmaj7, 40)):
        for i, m in enumerate(chord):
            add('pad', t0, m, dur, gain_vel - i * 3)
    add('choir', 3.2, 51, 7.6, 36)
    add('choir', 3.2, 58, 7.6, 30)
    for m in (51, 58, 63):
        add('strings', 0.0, m, 6.4, 42)
        add('strings', 5.6, m, 5.2, 38)
    # 2) 八音盒把主题头哼一遍（原曲主题首句，高八度）
    for off, m, d in THEME_HEAD:
        add('bell', 0.55 + off, m, d, 120 if off < 2 else 108)
    # 3) 钟摆与心跳
    for i in range(10):
        add('tick', 2.2 + i * 0.9, 92, 0.09, 30 if i % 2 else 40)
    for i in range(3):
        drum(0.0 + i * 3.2, 0, 78)
        drum(0.9 + i * 3.2, 0, 56)
    drum(9.2, 5, 88); drum(9.6, 5, 96); drum(10.0, 5, 104)
    add('riser', 9.0, 39, 2.0, 96)
    # 4) 管风琴把门推开
    for i, m in enumerate(Ebm):
        add('pad', 8.0, m, 3.0, 52 - i * 4)
    add('choir', 8.4, 63, 2.4, 40)

def bridge():
    b = 0.0  # 相对桥段起点填入，调用时加 BRIDGE_T0
    # 全部抽掉，只留黑暗：drone + 倒带
    for m in (39, 51, 58):
        add('pad', b + 0.0, m, 7.0, 50)
    add('choir', b + 1.2, 51, 5.0, 34)
    add('choir', b + 1.2, 58, 5.0, 28)
    # 原曲主题碎片（只剩三颗）
    add('bell', b + 2.2, 75, 0.9, 100)
    add('bell', b + 3.0, 78, 0.9, 92)
    add('bell', b + 4.4, 82, 1.2, 86)
    # 心跳与钟摆
    for i in range(4):
        drum(b + i * 2.2, 0, 90)
        drum(b + 0.7 + i * 2.2, 0, 64)
    for i in range(5):
        add('tick', b + 1.6 + i * 1.4, 92, 0.09, 34)
    # 最后一次心跳后，反向吊镲 + riser 把段落顶回来
    drum(b + 8.2, 4, 90)
    add('riser', b + 7.4, 63, 2.2, 104)
    add('reverse', b + 8.4, 82, 0.9, 70)

def coda(coda_t0, duration):
    # 回到八音盒：主题头 + 主题尾句，最后落在降 E
    for off, m, d in THEME_HEAD:
        add('bell', coda_t0 + 0.7 + off, m, d, 100)
    # 主题首句的后半（从原曲主题取音：Eb5 Gb5 Ab5 Bb5 Ab5 Gb5 Eb5）
    tail = [(4.6, 75, 0.6), (5.2, 78, 0.45), (5.65, 80, 0.5), (6.15, 82, 0.6),
            (6.75, 80, 0.45), (7.15, 78, 0.5), (7.6, 82, 1.4)]
    for off, m, d in tail:
        add('bell', coda_t0 + off, m, d, 88 if off < 7 else 100)
    for m in (39, 51, 58):
        add('pad', coda_t0 + 6.4, m, 3.4, 40)
    drum(coda_t0 + 8.4, 4, 62)
    for i in range(5):
        add('tick', coda_t0 + 1.4 + i * 1.5, 92, 0.08, 26)

def fnum(x):
    s = ('%.3f' % float(x)).rstrip('0').rstrip('.')
    return s if s not in ('', '-') else '0'

def emit_js(data):
    lines = []
    lines.append('  %s: {' % data['key'])
    lines.append("    title: '%s'," % data['title'])
    lines.append('    duration: %s,' % fnum(data['duration']))
    lines.append('    bpm: %d,' % data['bpm'])
    lines.append('    tracks: [')
    for tr in data['tracks']:
        ns = ','.join('[%s,%d,%s,%d]' % (fnum(e[0]), e[1], fnum(e[2]), e[3]) for e in tr['notes'])
        lines.append("      { name: '%s', wave: '%s', gain: %s, notes: [%s] },"
                     % (tr['name'], tr['wave'], ('%.3f' % tr['gain']).rstrip('0').rstrip('.'), ns))
    lines.append('    ],')
    ds = ','.join('[%s,%d,%d]' % (fnum(e[0]), e[1], e[2]) for e in data['drums'])
    lines.append('    drums: [%s],' % ds)
    lines.append('  }')
    return chr(10).join(lines)

def choir_bed(off, t_from, t_to, bar=1.666):
    """给原曲中段垫一层只有根音+五度的暗色 choir（不加三音，避免和声打架）。"""
    bass = CH_NOTES.get(1, [])
    t = t_from
    while t < t_to - 0.1:
        cand = [n for n in bass if off + 0 < 0 or True]
        cand = [n for n in bass if t - 0.02 <= n['t'] + off <= t + bar - 0.02]
        if cand:
            root = min(c['m'] for c in cand)
            add('choir', t, root, min(bar * 0.98, t_to - t), 30)
            add('choir', t, root + 7, min(bar * 0.98, t_to - t), 25)
            add('choir', t, root + 12, min(bar * 0.98, t_to - t), 21)
        t += bar

def main():
    global CH_NOTES, ORIG_T0, ORIG_END, TRACKS, BY, DRUMS
    # 轨道定义：name → (wave, gain)（wave/gain 只给游戏内合成回退用）
    defs = [
        ('lead', 'square', 0.325), ('piano', 'triangle', 0.068), ('harpsi', 'square', 0.115),
        ('strings', 'sawtooth', 0.095), ('choir', 'sine', 0.075), ('bass', 'triangle', 0.130),
        ('sub', 'sine', 0.045), ('bell', 'sine', 0.115), ('tick', 'square', 0.085),
        ('pad', 'sine', 0.075), ('counter', 'triangle', 0.060), ('guitar', 'sawtooth', 0.062),
        ('brass', 'square', 0.065), ('riser', 'sawtooth', 0.050), ('reverse', 'sawtooth', 0.045),
    ]
    TRACKS = [dict(name=n, wave=w, gain=g, notes=[]) for (n, w, g) in defs]
    BY = {n: tr['notes'] for tr, (n, _w, _g) in zip(TRACKS, defs)}

    CH_NOTES = load()
    ORIG_T0 = min(n['t'] for lst in CH_NOTES.values() for n in lst)
    ORIG_END = max(n['t'] + n['d'] for lst in CH_NOTES.values() for n in lst)
    print('原曲 t0 %.3f end %.3f  span %.3f' % (ORIG_T0, ORIG_END, ORIG_END - ORIG_T0))

    off1 = INTRO - ORIG_T0                 # 原曲 t=ORIG_T0 落在 INTRO
    orig_end_new = ORIG_END + off1
    theme_start = 28.27
    theme_end = ORIG_END
    bridge_t0 = orig_end_new
    var_t0 = bridge_t0 + BRIDGE
    var_off = var_t0 - theme_start
    coda_t0 = theme_end + var_off
    duration = round(coda_t0 + CODA, 3)
    print('时间版图: intro 0-%.1f | 原曲 %.1f-%.1f | 桥 %.1f-%.1f | 变奏 %.1f-%.1f | 尾声 %.1f-%.1f | 总长 %.3f'
          % (INTRO, INTRO, orig_end_new, bridge_t0, var_t0, var_t0, coda_t0, coda_t0, duration, duration))

    intro()
    orig_pass(off1, 'faithful')
    choir_bed(off1, INTRO + 13.0, orig_end_new)
    # 桥段（新写）按绝对时间填入
    _before = {n: len(BY[n]) for n in BY}
    bridge()
    # 把 bridge() 写进 0 起的相对时间，重定位到 bridge_t0
    for n in BY:
        k = _before[n]
        for ev in BY[n][k:]:
            ev[0] = round(ev[0] + bridge_t0, 3)
    _d = len(DRUMS)
    for ev in DRUMS[_d - 12:]:
        ev[0] = round(ev[0] + bridge_t0, 3)
    # 变奏：主题段（28.27-55.765）重配器
    for ch_name, chno in CH.items():
        if ch_name in ('organ_hi', 'organ_lo', 'rockorgan', 'vibes', 'drums'):
            continue
        for n in CH_NOTES.get(chno, []):
            if not (theme_start - 0.05 <= n['t'] <= theme_end):
                continue
            variation_voice(ch_name, n['t'] + var_off, n['m'], n['d'], n['v'])
    for n in CH_NOTES.get(9, []):
        if not (theme_start - 0.05 <= n['t'] <= theme_end):
            continue
        k = DRUM_MAP.get(n['m'])
        if k is None:
            continue
        drum(n['t'] + var_off, k, min(127, int(n['v'] * 1.05)))
        if k == 0 and n['v'] >= 100:
            drum(n['t'] + var_off + 0.125, 2, 40)
    # 尾声
    coda(coda_t0, duration)
    # 收尾：裁掉越界音
    for tr in TRACKS:
        tr['notes'] = [ev for ev in tr['notes'] if ev[0] < duration - 0.02]
        tr['notes'].sort(key=lambda e: (e[0], e[1]))
    DRUMS = [ev for ev in DRUMS if ev[0] < duration - 0.02]
    DRUMS.sort(key=lambda e: (e[0], e[1]))

    n_notes = sum(len(tr['notes']) for tr in TRACKS)
    print('轨 %d（有音 %d）| 音 %d | 鼓 %d | duration %.3f'
          % (len(TRACKS), sum(1 for tr in TRACKS if tr['notes']), n_notes, len(DRUMS), duration))
    data = dict(key=KEY, title=TITLE, duration=duration, bpm=int(round(BPM)),
                tracks=[dict(name=tr['name'], wave=tr['wave'], gain=tr['gain'], notes=tr['notes']) for tr in TRACKS],
                drums=DRUMS)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    reasons = [
        '照原曲：ZUN 谱 MIDI 的全部声部逐音搬入（bar1-34 / 55.77s / 146→144 BPM / 降 E 小调），不换旋律、不改和声',
        '恢复原曲 bar1-9 风琴前奏（上一版按 m04129 砍掉，这版编成管风琴+铁琴琶音+弦乐的夜路）',
        '新写 11 秒引子：八音盒先把主题头哼一遍，暗色 drone、钟摆、心跳把红夜铺开',
        '新写 10 秒黑暗桥段：整段抽空只剩 drone、三颗八音盒音、心跳与反向吊镲（露米娅的黑暗把声音也吃掉）',
        '主题变奏：同一批原曲音符重配器——八音盒高八度、弦乐齐奏、铜管切分、鼓加密，再落回尾声',
        '尾声回到八音盒，最后停在降 E 上接回引子（循环点）',
    ]
    head = ('/**\n'
            ' * 一面首领《妖魔夜行》—— 红夜小径编。\n'
            ' * 素材 = ZUN 原曲 TH06 扒谱 MIDI（34 小节 / 55.77s / 降 E 小调），逐音搬入后重新配器；\n'
            ' * 新增引子 / 黑暗桥段 / 主题变奏 / 尾声。tools/build/_rumia_compose.py 生成，勿手改。\n'
            ' */\n')
    out = head + 'export const ' + EXPORT + ' = {' + chr(10) + emit_js(data) + ',' + chr(10) + '};' + chr(10)
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write(out)
    print('写入', OUT_JS, len(out), 'B')
    # 分轨统计
    for tr in TRACKS:
        ns = tr['notes']
        if not ns:
            continue
        print('  %-8s n=%4d range %d-%d  t %.2f-%.2f' % (tr['name'], len(ns), min(e[1] for e in ns),
              max(e[1] for e in ns), min(e[0] for e in ns), max(e[0] for e in ns)))

if __name__ == '__main__':
    main()
