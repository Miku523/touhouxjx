# -*- coding: utf-8 -*-
import io, sys

def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            print('MISS', path, repr(old[:70]))
            sys.exit(1)
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

YOU_OLD_TRACKS = """TRACKS=[('lead','square',0.25,lead),
        ('counter','triangle',0.15,counter),
        ('harpsi','triangle',0.10,sparkle),
        ('piano','triangle',0.19,piano),
        ('harpsi','triangle',0.10,shimmer),
        ('bell','sine',0.13,bell),
        ('strings','sawtooth',0.14,strings),
        ('brass','sawtooth',0.15,brass),
        ('choir','triangle',0.12,choir),
        ('knife','square',0.10,knife),
        ('bass','triangle',0.21,bass),
        ('bass','square',0.13,bass2)]"""

YOU_NEW_TRACKS = """# ---------- v3: 妖侧对句（ch4 高音动机移接 B 段 / ch5 EP 动机移接桥段）+ 刀刃拟声 ----------
def relocate(ns, t_start, dm=0, mul=1.0):
    if not ns:
        return []
    base = min(n['t'] for n in ns)
    return fit(shift([dict(n, t=n['t']-base) for n in ns], dt=t_start, dm=dm, mul=mul))

shadow = relocate(pick(4, 0.0, DUR), win(23, 24)[0], dm=-12, mul=0.60)
shadow = shadow + relocate(pick(5, 0.0, DUR), win(37, 38)[0], dm=-12, mul=0.45)
shadow = shadow + relocate(pick(4, 0.0, DUR), win(66, 67)[0], dm=-12, mul=0.55)

ticks = []
for n in pick(10, 0.0, DUR):
    if sec_of(n['t']) in ('B', 'bridge', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), m=n['m'] + 12, d=0.10,
                          v=max(1, min(127, int(round(n['v'] * 0.50))))))
for n in pick(4, 0.0, DUR):
    if sec_of(n['t']) in ('bridge', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), d=0.12,
                          v=max(1, min(127, int(round(n['v'] * 0.45))))))
ticks = fit(ticks)

TRACKS=[('lead','square',0.28,lead),
        ('counter','triangle',0.17,counter),
        ('harpsi','triangle',0.12,sparkle),
        ('piano','triangle',0.19,piano),
        ('harpsi','triangle',0.10,shimmer),
        ('bell','sine',0.13,bell),
        ('strings','sawtooth',0.14,strings),
        ('brass','sawtooth',0.15,brass),
        ('choir','triangle',0.13,choir),
        ('knife','square',0.115,knife),
        ('bass','triangle',0.19,bass),
        ('bass','square',0.115,bass2),
        ('counter','triangle',0.115,shadow),
        ('tick','square',0.10,ticks)]"""

YOU_NEW_DRUM = """# v3 拟声：桥段心跳（低音通鼓）、高潮 ride、段落前一刀（reverse crash）
BR = win(37, 45)[0]
for i in range(0, 16):
    if i % 4 == 0:
        drums.append((round(BR + i * (bar * 0.5), 3), 5, 60))
for i in range(0, 30):
    t = win(54, 70)[0] + i * (bar * 0.5)
    if t < win(69, 70)[0]:
        drums.append((round(t, 3), 7, 50))
drums.append((round(win(53, 54)[0], 3), 8, 80))
drums.append((round(win(70, 71)[0], 3), 4, 72))
drums.sort()"""

patch('tools/build/_youmu_compose.py', [
 (YOU_OLD_TRACKS, YOU_NEW_TRACKS),
 ("""    elif s=='climax':
        v*=1.06""",
  """    elif s in ('A','Ap'):
        if k in (2,3): v*=1.25
        elif k==4: v*=0.90
    elif s=='climax':
        v*=1.06"""),
 ("drums.sort()", YOU_NEW_DRUM),
])

patch('tools/build/_yuyuko_compose.py', [
 ('tracks.append(track("lead", "square", 0.062, halo_items))',
  'tracks.append(track("lead", "square", 0.19, halo_items))'),
 ('tracks.append(track("counter", "triangle", 0.075, counter_items))',
  'tracks.append(track("counter", "triangle", 0.085, counter_items))'),
 ('tracks.append(track("arp", "triangle", 0.048, arp_items))',
  'tracks.append(track("arp", "triangle", 0.115, arp_items))'),
 ('tracks.append(track("strings", "sawtooth", 0.058, strings_items))',
  'tracks.append(track("strings", "sawtooth", 0.075, strings_items))'),
 ('tracks.append(track("bass", "triangle", 0.15, bass_items))',
  'tracks.append(track("bass", "triangle", 0.13, bass_items))'),
 ('tracks.append(track("bell", "sine", 0.052, celesta_items))',
  'tracks.append(track("bell", "sine", 0.075, celesta_items))'),
 ('tracks.append(track("pad", "sawtooth", 0.034, pad_items))',
  'tracks.append(track("pad", "sawtooth", 0.052, pad_items))'),
 ('tracks.append(track("choir", "sawtooth", 0.05, choir_items))',
  'tracks.append(track("choir", "sawtooth", 0.105, choir_items))'),
 ('tracks.append(track("bell", "sine", 0.075, bell_items))',
  'tracks.append(track("bell", "sine", 0.095, bell_items))'),
 ('DRUM_VEL = {0: 0.92, 1: 0.88, 2: 0.42, 3: 0.55, 4: 0.62}',
  'DRUM_VEL = {0: 0.92, 1: 0.88, 2: 0.52, 3: 0.63, 4: 0.70}'),
 ("""# --- 13) 鼓：原谱 ch9 重新配平（保鼓型，削镲/ride 力度）""",
  """# --- 12b) 风铃拟声：原谱 ch12 音高缩短成金属滴答（引子 / 尾奏）
tick_items = []
for n in notes_of(12):
    b = bar_of(n["t"])
    if not (b <= 8 or b >= 75):
        continue
    tick_items.append((round(n["t"], 3), n["m"], 0.09, max(1, min(127, int(n["v"] * 0.45)))))
tracks.append(track("tick", "square", 0.085, tick_items))

# --- 12c) 绸缎上扬：副歌前 / 尾奏前的 riser（音高取原谱主旋律）
riser_items = []
for b in (41, 74):
    t0 = BARS[b]
    mel = [n for n in notes_of(2) if t0 - 1.0 <= n["t"] < t0 + 0.6]
    if not mel:
        continue
    p = max(mel, key=lambda n: n["m"])["m"] + 12
    riser_items.append((round(t0 - 1.2, 3), p, 1.6, 44))
tracks.append(track("riser", "triangle", 0.05, riser_items))

# --- 13) 鼓：原谱 ch9 重新配平（保鼓型，削镲/ride 力度）"""),
 ("""    drums.append([t, k, vv(n["v"] * DRUM_VEL[k], 1, 127)])""",
  """    drums.append([t, k, vv(n["v"] * DRUM_VEL[k], 1, 127)])

# v3 拟声：引子钟摆（高音通鼓）、副歌/尾奏前一刀（reverse crash）
for b in range(1, 9):
    drums.append([round(BARS[b], 3), 6, 42])
drums.append([round(BARS[42] - 0.8, 3), 8, 74])
drums.append([round(BARS[75] - 0.8, 3), 8, 62])
drums.sort(key=lambda x: x[0])"""),
])

patch('tools/build/_yuyuko_kit/fade.py', [
 ('def apply_fade(path, head_ms=3.0, tail_s=0.35):',
  'def apply_fade(path, head_ms=3.0, tail_s=0.08):'),
 ('over the last 0.35 s', 'over the last 0.08 s'),
])
print('ALL PATCHES OK')
