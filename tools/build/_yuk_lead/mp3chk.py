# -*- coding: utf-8 -*-
import io, struct
p = 'src/assets/bgm/yukari_ph.mp3'
raw = io.open(p, 'rb').read()
i = 0
# skip ID3
if raw[:3] == b'ID3':
    sz = ((raw[6] & 0x7f) << 21) | ((raw[7] & 0x7f) << 14) | ((raw[8] & 0x7f) << 7) | (raw[9] & 0x7f)
    i = 10 + sz
hdr = raw[i:i+4]
b1, b2, b3, b4 = hdr
ver = (b2 >> 3) & 3
layer = (b2 >> 1) & 3
br_i = (b3 >> 4) & 0xF
sr_i = (b3 >> 2) & 3
chan = (b4 >> 6) & 3
BR = {1: (0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0)}
SR = {0: 44100, 1: 48000, 2: 32000}
print('header bytes', hdr.hex(), 'ver', ver, 'layer', layer,
      'bitrate', BR[1][br_i], 'sr', SR.get(sr_i), 'chan', chan)
frames = 0
pos = i
n = len(raw)
while pos + 4 <= n:
    if raw[pos] != 0xFF or (raw[pos+1] & 0xE0) != 0xE0:
        pos += 1
        continue
    b2 = raw[pos+1]; b3 = raw[pos+2]; b4 = raw[pos+3]
    ver = (b2 >> 3) & 3
    br = BR[1][(b3 >> 4) & 0xF]
    sr = SR.get((b3 >> 2) & 3, 44100)
    pad = (b3 >> 1) & 1
    if ver == 3:
        flen = 144 * br * 1000 // sr + pad
        spf = 1152
    else:
        flen = 72 * br * 1000 // sr + pad
        spf = 576
    if flen <= 4:
        pos += 1
        continue
    frames += 1
    pos += flen
print('frames', frames, 'duration %.3f s' % (frames * 1152 / 44100.0))
