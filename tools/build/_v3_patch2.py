# -*- coding: utf-8 -*-
import io, sys
P='tools/build/_yuyuko_compose.py'
s=io.open(P,encoding='utf-8').read()
OLD='''tick_items = []
for n in notes_of(12):
    b = bar_of(n["t"])
    if not (b <= 8 or b >= 75):
        continue
    tick_items.append((round(n["t"], 3), n["m"], 0.09, max(1, min(127, int(n["v"] * 0.45)))))
tracks.append(track("tick", "square", 0.085, tick_items))'''
NEW='''tick_items = []
for n in notes_of(0):
    if not (n["t"] < INTRO_END or n["t"] >= CHORUS_END):
        continue
    if n["m"] < 76:
        continue
    tick_items.append((round(n["t"], 3), n["m"], 0.09, max(1, min(127, int(n["v"] * 0.45)))))
tick_items = tick_items[:40] + tick_items[-40:]
tracks.append(track("tick", "square", 0.085, tick_items))'''
if OLD not in s:
    print('MISS tick'); sys.exit(1)
s=s.replace(OLD,NEW,1)
OLD2='''riser_items = []
for b in (41, 74):
    t0 = BARS[b]
    mel = [n for n in notes_of(2) if t0 - 1.0 <= n["t"] < t0 + 0.6]
    if not mel:
        continue
    p = max(mel, key=lambda n: n["m"])["m"] + 12
    riser_items.append((round(t0 - 1.2, 3), p, 1.6, 44))
tracks.append(track("riser", "triangle", 0.05, riser_items))'''
NEW2='''riser_items = []
for b, srcs in ((41, (2, 7, 10)), (74, (2, 7))):
    t0 = BARS[b]
    p = None
    for src in srcs:
        mel = [n for n in notes_of(src) if t0 - 2.0 <= n["t"] < t0 + 1.0]
        if mel:
            p = max(mel, key=lambda n: n["m"])["m"]
            break
    if p is None:
        mel = notes_of(10)
        p = max(mel, key=lambda n: n["m"])["m"] if mel else 72
    riser_items.append((round(t0 - 1.2, 3), p + 12, 1.6, 44))
tracks.append(track("riser", "triangle", 0.05, riser_items))'''
if OLD2 not in s:
    print('MISS riser'); sys.exit(1)
s=s.replace(OLD2,NEW2,1)
io.open(P,'w',encoding='utf-8',newline='\n').write(s)
print('patched tick+riser')
