# -*- coding: utf-8 -*-
"""refA 局部放大频谱 + MIDI 各通道音符叠加（红=ch3 顶线，蓝=ch0 钢琴，绿=弦乐）。"""
import os, sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import soundfile as sf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import midi2js as M

REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6\refA.mp3'
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
OUT = os.path.dirname(os.path.abspath(__file__))
BAR = 4*60/162.0

x, sr = sf.read(REF, always_2d=False)
if x.ndim > 1:
    x = x.mean(axis=1)
x = x.astype(np.float64)
chans, segs, div = M.extract_channels(M.parse_midi(MID))

NFFT = 8192
HOP = 256
fps = sr / HOP
win = np.hanning(NFFT)
F = np.fft.rfftfreq(NFFT, 1.0/sr)
FL, FH, H = 110.0, 3000.0, 760
fy = FL * (FH/FL) ** (np.arange(H)/(H-1.0))
fidx = np.clip(np.searchsorted(F, fy), 0, len(F)-1)

def midi_freq(m):
    return 440.0 * 2 ** ((m-69)/12.0)

def render(t0, t1, audio_bar0, pitch_shift_bars, fname, chs=(3, 0, 6)):
    i0 = int(t0*sr)
    n = int((t1-t0)*sr)//HOP
    S = np.zeros((H, n), dtype=np.float32)
    for k in range(n):
        seg = x[i0+k*HOP: i0+k*HOP+NFFT]
        if len(seg) < NFFT:
            break
        S[:, k] = np.abs(np.fft.rfft(seg*win))[fidx]
    S = 20*np.log10(S + 1e-6)
    S = np.clip((S - (S.max()-55)) / 55.0, 0, 1)
    img = np.zeros((H, n, 3), dtype=np.float32)
    img[:, :, 1] = S  # 频谱放绿
    # 叠加 MIDI：audio_bar -> midi_bar = audio_bar + shift
    colors = {3: (1.0, 0.15, 0.15), 0: (0.25, 0.45, 1.0), 6: (1.0, 0.9, 0.2)}
    for ch in chs:
        for nt in chans[ch]['notes']:
            bar_no = nt['t'] / BAR - pitch_shift_bars   # MIDI bar -> audio bar
            t_abs = bar_no * BAR
            if not (t0 - 0.05 <= t_abs <= t1):
                continue
            col = int((t_abs - t0) * fps)
            wcol = max(1, int(nt['d'] * fps))
            m = nt['m']
            row = int(np.searchsorted(fy, midi_freq(m)))
            row = min(max(row, 0), H-1)
            c = colors.get(ch, (1, 1, 1))
            for cc in range(max(0, col), min(n, col+wcol)):
                img[row, cc] = c
                if row+1 < H:
                    img[row+1, cc] = [v*0.5 for v in c]
    im = Image.fromarray((np.clip(img, 0, 1)[::-1]*255).astype(np.uint8), 'RGB')
    im = im.resize((int(n*1.6), H), Image.BILINEAR)
    p = os.path.join(OUT, fname)
    im.save(p)
    print(p, im.size, '%.1f-%.1fs' % (t0, t1))

# 对齐试：shift 3 小节（audio bar i = midi bar i+3）
render(29.0, 33.0, 19.6, 3.0, 'pre6_zoom_s3.png')
render(29.0, 33.0, 19.6, 0.0, 'pre6_zoom_s0.png')
