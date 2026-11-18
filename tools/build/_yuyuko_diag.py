# -*- coding: utf-8 -*-
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import midi2js
MIDI_PATH = os.path.join(ROOT, "tools", "build", "_midi", "src",
    "13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid")
midi = midi2js.parse_midi(MIDI_PATH)
CH, SEGS, DIV = midi2js.extract_channels(midi)

def t2s(tick):
    seg = SEGS[0]
    for s in SEGS:
        if s[0] <= tick:
            seg = s
        else:
            break
    return seg[1] + (tick - seg[0]) * seg[2] / (DIV * 1e6)

BARS = [t2s(b * 1920) for b in range(0, 120)]
def bar_of(t):
    b = 0
    for i in range(len(BARS)):
        if t >= BARS[i]:
            b = i
    return b

lines = []
for ch in sorted(CH):
    ns = CH.get(ch, {}).get("notes", []) or []
    if not ns:
        lines.append("ch%s empty" % ch); continue
    ts = [n["t"] for n in ns]
    bars = [bar_of(t) for t in ts]
    intro = sum(1 for b in bars if b <= 8)
    outro = sum(1 for b in bars if b >= 75)
    lines.append("ch%s n=%d t=%.1f..%.1f bar=%d..%d intro=%d outro=%d m=%d..%d" % (
        ch, len(ns), min(ts), max(ts), min(bars), max(bars), intro, outro,
        min(n["m"] for n in ns), max(n["m"] for n in ns)))
mel = CH.get(2, {}).get("notes", []) or []
for b in (41, 74):
    w = [n for n in mel if BARS[b]-2.0 <= n["t"] < BARS[b]+1.0]
    lines.append("mel bar%d: n=%d maxm=%s" % (b, len(w), max([n["m"] for n in w]) if w else None))
lines.append("BARS9=%.3f BARS42=%.3f BARS75=%.3f BARS90=%.3f"%(BARS[9],BARS[42],BARS[75],BARS[90] if len(BARS)>90 else BARS[-1]))
open(os.path.join(HERE, "_yuyuko_kit", "diag.txt"), "w", encoding="utf-8").write("\n".join(lines))
print("DIAGDONE", len(lines))
