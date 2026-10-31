
# -*- coding: utf-8 -*-
import io, os, sys
P = os.path.join(r"C:\Users\GuSheng\Downloads\HKS", 'tools', 'build', '_aya_compose.py')
s = io.open(P, encoding='utf-8').read()

def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, (s.count(old), old[:60])
    s = s.replace(old, new)

# --- 轨道增益 ---
rep("('bass', 'triangle', 0.135), ('sub', 'sine', 0.072),",
    "('bass', 'triangle', 0.135), ('sub', 'sine', 0.090),")
rep("        ('knife', 'square', 0.075), ('riser', 'sawtooth', 0.065),\n        ('reverse', 'sawtooth', 0.060),",
    "        ('knife', 'square', 0.090), ('riser', 'sawtooth', 0.078),\n        ('reverse', 'sawtooth', 0.072),")

# --- main 里调用 postprocess ---
rep("    sec_tail()\n    js_tracks = []",
    "    sec_tail()\n    postprocess()\n    js_tracks = []")

# --- 插入 postprocess ---
POST = '''# ---------------- v3：八条复盘落地（后处理） ----------------
def _w(nb0, nb1):
    return bt(nb0, 0), bt(nb1 + 1, 0)


def postprocess():
    # 1) A2/B 主题出头：主旋律 +2.3dB，补铜管同度与钟琴高八度
    t0, t1 = _w(5, 19)
    add_brass, add_bell = [], []
    for n in BY['lead']:
        if t0 - 1e-6 <= n[0] < t1:
            v = n[3]
            add_brass.append([n[0], n[1], round(n[2] * 0.95, 3), int(min(127, v * 0.32))])
            if n[1] + 12 <= 102 and n[2] >= 0.12:
                add_bell.append([n[0], n[1] + 12, round(min(n[2], 0.30), 3), int(min(127, v * 0.62))])
            n[3] = min(127, int(v * 1.30))
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


'''
anchor = "if __name__ == '__main__':"
rep(anchor, POST + anchor)
io.open(P, 'w', encoding='utf-8').write(s)
print('patched ok, lines', s.count(chr(10)))
