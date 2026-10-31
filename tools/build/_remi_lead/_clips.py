# -*- coding: utf-8 -*-
"""《红月王座编》试听切片：从成品 WAV 切 11 段 9.6 秒。"""
import os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'src', 'assets', 'bgm', 'remilia_septette.wav')
if not os.path.exists(SRC):
    SRC = os.path.join(HERE, '..', '..', '..', 'tools', 'build', '_remi_kit', 'remilia_septette_stereo.wav')
OUT = os.path.join(HERE, 'clips')
os.makedirs(OUT, exist_ok=True)
with wave.open(SRC) as w:
    sr = w.getframerate(); n = w.getnframes(); nch = w.getnchannels()
    a = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
if nch > 1:
    a = a.reshape(-1, nch).mean(axis=1)
CLIPS = [
    ('01_引子管风琴与钟', 0.0, 9.6),
    ('02_小号主题首现', 19.9, 29.5),
    ('03_王座间奏', 33.6, 43.2),
    ('04_主题再现进行曲', 47.0, 56.6),
    ('05_主题与副旋律对答', 60.4, 70.0),
    ('06_半音模进', 73.7, 83.3),
    ('07_圣咏管风琴', 87.0, 96.6),
    ('08_圣咏再现高弦', 100.4, 110.0),
    ('09_终曲全奏', 113.7, 123.3),
    ('10_升调终曲', 127.0, 136.6),
    ('11_尾声钟声与定音鼓', 139.1, 148.7),
]
OUT_SR = 22050   # 试听切片统一降到 22.05kHz 单声道，体积减半
for name, t0, t1 in CLIPS:
    s = int(round(t0 * sr)); e = min(n, int(round(t1 * sr)))
    seg = a[s:e]
    if sr != OUT_SR and sr % OUT_SR == 0:
        k = sr // OUT_SR
        seg = seg[:len(seg) - len(seg) % k].reshape(-1, k).mean(axis=1)
    pcm = np.clip(seg * 32767.0, -32768, 32767).astype('<i2')
    p = os.path.join(OUT, name + '.wav')
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(OUT_SR)
        w.writeframes(pcm.tobytes())
    print('%-26s %6.2f-%6.2f  %d 样本  %d B' % (name, t0, t1, len(seg), os.path.getsize(p)))
