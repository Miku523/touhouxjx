#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/title_arrange.py —— 把标题曲《東方新紀行》编成一首完整的曲子。

用户口径：「标题节奏很好，但我想让标题成为一首真正的音乐」。
做法（原音符一个不动，只加东西）：
  1. 补一层「和声铺底」（pad）：逐小节取和弦根音/三音/五音，长音垫在底下；
  2. 补一层「副旋律对句」（counter）：前 36 小节给主旋律配和声音，用和弦音，
     原来第 36 小节才有对句，现在从头就有，副歌再叠一层；
  3. 段落力度弧线：前奏（0–1 小节）0.75 → 主歌 0.9 → 副歌（36–51）1.0 →
     尾奏（52–61）0.85，所有声部按段缩放力度；
  4. 每 8 小节句尾补军鼓过门（16 分，力度递增）；
  5. 音色换柔和配器，并挂 warm 总线（5200Hz 低通 + 短回声）。

用法：
    python tools/title_arrange.py --check
    python tools/title_arrange.py
"""
import os
import sys
import collections

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
import preview_song as PS

SRC = os.path.join(ROOT, 'src', 'engine', 'songs', 'title_chronicle.js')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'title_full.js')

VOICES = [
    ('triangle', 0.20),   # 0 主旋律
    ('sine', 0.11),       # 1 副旋律对句（新写）
    ('sine', 0.14),       # 2 贝斯
    ('sine', 0.050),      # 3 分解和弦
    ('triangle', 0.065),  # 4 内声部
    ('sine', 0.048),      # 5 和声铺底（新写）
]


def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0], m=r[1], d=r[2], v=r[3]) for r in rows]


def section_gain(bar):
    if bar < 2:
        return 0.75
    if bar < 36:
        return 0.90
    if bar < 52:
        return 1.00
    return 0.85


def bar_chords(tracks, bar, nb):
    """逐小节从贝斯/分解和弦统计 (root_pc, chord_pcs)。"""
    bass, arp = tracks[2], tracks[3]
    out = []
    for b in range(nb):
        a, z = b * bar, (b + 1) * bar
        w = collections.Counter()
        for n in bass:
            if a <= n['t'] < z:
                w[n['m'] % 12] += max(0.1, min(n['d'], bar))
        if not w:
            out.append((None, set()))
            continue
        root = w.most_common(1)[0][0]
        pcs = set()
        for n in arp:
            if a <= n['t'] < z:
                pcs.add(n['m'] % 12)
        members = {m for m in pcs if (m - root) % 12 in (0, 3, 4, 7, 10)} or {(root + 7) % 12}
        out.append((root, members))
    return out


def nearest_pc(pc, lo, hi):
    best = None
    for p in range(lo, hi + 1):
        if p % 12 == pc:
            if best is None or abs(p - (lo + hi) / 2.0) < abs(best - (lo + hi) / 2.0):
                best = p
    return best if best is not None else lo


def main():
    check_only = '--check' in sys.argv
    song = PS.load_song(SRC, 'TITLE_CHRONICLE', 'title')
    tracks = [objs(tr['notes']) for tr in song['tracks']]
    bar = 4 * 60.0 / song['bpm']
    nb = int(song['duration'] / bar)
    print('源曲 %s：%.2fs / %d bpm / %d 小节' % (song['title'], song['duration'], song['bpm'], nb))

    chords = bar_chords(tracks, bar, nb)

    # ---- 主旋律：原样，只按段落缩放力度 ----
    lead = [dict(n, v=max(30, int(round(n['v'] * section_gain(int(n['t'] // bar)))))) for n in tracks[0]]

    # ---- 对句：前 36 小节配和声音（和弦内三/六度），后半段保留原有的高音对句 ----
    counter = []
    for n in lead:
        b = int(n['t'] // bar)
        if b >= 36:
            continue
        root, members = chords[b]
        if root is None:
            continue
        for iv in (-3, -4, -5, -8):
            pc = (n['m'] + iv) % 12
            if pc in members:
                counter.append(dict(t=n['t'], m=n['m'] + iv, d=round(n['d'] * 0.92, 3),
                                    v=max(40, int(n['v'] * 0.72))))
                break
    counter.extend(dict(n) for n in tracks[1])          # 原曲第 36 小节起的高音对句
    counter.sort(key=lambda n: (n['t'], n['m']))

    # ---- 和声铺底：逐小节三和弦长音 ----
    pad = []
    for b in range(nb):
        root, members = chords[b]
        if root is None:
            continue
        base = nearest_pc(root, 45, 57)
        tones = sorted({base, base + (3 if (base + 3) % 12 in members else 4), base + 7})[0:3]
        t0 = b * bar
        dur = round(bar * 0.96, 3)
        for k, m in enumerate(tones):
            pad.append(dict(t=t0, m=m, d=dur, v=int(round(52 * section_gain(b)))))
    pad.sort(key=lambda n: (n['t'], n['m']))

    # ---- 过门：每 8 小节句尾补 16 分军鼓，力度递增 ----
    drums = [tuple(x) if isinstance(x, (list, tuple)) else (x['t'], x['kind'], x['v']) for x in song['drums']]
    extra = []
    for b in range(7, nb, 8):
        end = (b + 1) * bar
        for k in range(6):
            t = round(end - bar / 4.0 + k * (bar / 4.0) / 6.0, 3)
            extra.append((t, 1, 40 + k * 9))
    drums = sorted(drums + extra)

    # ================= 扩展成完整曲式 =================
    # 62 小节原曲（前奏/主歌/副歌/尾奏）→ 8 小节转调桥段 → 16 小节升 3 个半音的
    # 再现副歌 → 4 小节渐弱收束。总长 90 小节 = 144s @150 BPM。
    MOD = 3                      # 升 3 个半音转调
    NB_EXT = 90
    arp = [dict(n) for n in tracks[3]]
    arp_new = []
    lead = list(lead)
    counter = list(counter)
    pad = list(pad)
    drums = [tuple(x) for x in drums]

    # --- 桥段：第 62–69 小节，只留铺底 + 分解音 + 心跳鼓，主旋律让位 ---
    for i in range(8):
        b = 62 + i
        root, members = chords[52 + i]
        if root is None:
            continue
        base = nearest_pc((root + MOD) % 12, 45, 57)
        tones = {base, base + (3 if (base + 3) % 12 in members else 4), base + 7}
        for m in sorted(tones):
            pad.append(dict(t=round(b * bar, 3), m=m, d=round(bar * 0.96, 3), v=48))
        for k in range(8):
            m = base + 12 if k % 2 else base + 7
            arp_new.append(dict(t=round(b * bar + k * bar / 8.0, 3), m=m,
                                d=round(bar / 10.0, 3), v=62))
        drums.append((round(b * bar, 3), 0, 100))
        drums.append((round(b * bar + 2 * bar / 4.0, 3), 0, 96))
        for k in range(8):
            drums.append((round(b * bar + k * bar / 8.0, 3), 2, 50))
    for k in range(8):           # 第 69 小节做 8 分军鼓推进
        drums.append((round(69 * bar + k * bar / 8.0, 3), 1, 46 + k * 9))

    # --- 再现副歌：第 70–85 小节，把第 36–51 小节的主题整体升 3 个半音重奏 ---
    D = (70 - 36) * bar
    seg = (36 * bar, 52 * bar)
    for n in list(lead):
        if seg[0] - 1e-6 <= n['t'] < seg[1]:
            lead.append(dict(t=round(n['t'] + D, 3), m=n['m'] + MOD, d=n['d'], v=n['v']))
    for n in list(counter):
        if seg[0] - 1e-6 <= n['t'] < seg[1]:
            counter.append(dict(t=round(n['t'] + D, 3), m=n['m'] + MOD, d=n['d'], v=n['v']))
    for b in range(36, 52):
        root, members = chords[b]
        if root is None:
            continue
        base = nearest_pc((root + MOD) % 12, 45, 57)
        tones = {base, base + (3 if (base + 3) % 12 in members else 4), base + 7}
        for m in sorted(tones):
            pad.append(dict(t=round((b + 34) * bar, 3), m=m, d=round(bar * 0.96, 3), v=54))
    for (t, k, v) in list(drums):
        if seg[0] - 1e-6 <= t < seg[1]:
            drums.append((round(t + D, 3), k, v))
    for b in range(70, 86, 8):
        drums.append((round(b * bar, 3), 4, 96))

    # --- 渐弱收束：第 86–89 小节 ---
    root = chords[61][0]
    base = nearest_pc(root if root is not None else 0, 45, 57)
    for k, m in enumerate((base, base + 4, base + 7)):
        pad.append(dict(t=round(86 * bar, 3), m=m, d=round(4 * bar * 0.98, 3), v=44 - k * 4))
    lead.append(dict(t=round(86 * bar, 3), m=base + 12, d=round(2.4, 3), v=72))
    lead.append(dict(t=round(88 * bar, 3), m=base + 7, d=round(2.0, 3), v=52))
    drums.append((round(86 * bar, 3), 4, 84))

    for arr in (lead, counter, pad, arp_new):
        arr.sort(key=lambda n: (n['t'], n['m']))
    drums.sort()
    duration = round(NB_EXT * bar, 3)

    new_tracks = [dict(wave=VOICES[0][0], gain=VOICES[0][1], notes=lead),
                  dict(wave=VOICES[1][0], gain=VOICES[1][1], notes=counter),
                  dict(wave=VOICES[2][0], gain=VOICES[2][1], notes=tracks[2]),
                  dict(wave=VOICES[3][0], gain=VOICES[3][1], notes=sorted(arp + arp_new, key=lambda n: (n['t'], n['m']))),
                  dict(wave=VOICES[4][0], gain=VOICES[4][1], notes=tracks[4]),
                  dict(wave=VOICES[5][0], gain=VOICES[5][1], notes=pad)]
    out = dict(key='title', title=song['title'] + '（完整编曲版·完整曲式）', duration=duration,
               bpm=song['bpm'], tracks=new_tracks, drums=drums, warm=True)
    print('输出：%d 轨 / %.1fs / lead %d / counter %d / arp %d / pad %d / drums %d'
          % (len(new_tracks), duration, len(lead), len(counter), len(new_tracks[3]['notes']), len(pad), len(drums)))
    if check_only:
        return
    body = M.render_song_js(out, [
        '保留原曲全部音符与节奏；新写和声铺底（pad）与前 36 小节的和声对句',
        '段落力度弧线：前奏 0.75 → 主歌 0.90 → 副歌 1.00 → 尾奏 0.85',
        '每 8 小节句尾补 16 分军鼓过门；柔和配器 + warm 总线（低通 5.2k + 短回声）',
    ])
    head = ('/**\n'
            ' * 标题曲完整编曲版 —— 由 tools/title_arrange.py 生成，勿手改。\n'
            ' * 源曲：title_chronicle.js（13th Anniversary Medley，99.2s / 150 BPM / 62 小节）。\n'
            ' */\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(head + 'export const TITLE_FULL = {\n' + body + ',\n};\n')
    print('写入 %s：%.1f KB' % (OUT_JS, os.path.getsize(OUT_JS) / 1024.0))


if __name__ == '__main__':
    main()
