# -*- coding: utf-8 -*-
"""新版编曲 + 游戏内原曲的旋律层（track0 主奏 + track2 副旋律）融合试听稿。

不叠原曲的贝斯和鼓：原曲贝斯（triangle 0.15，MIDI ch10 走动型）与新版的
drive/push8 贝斯经常差半音，低频会糊；鼓叠两层也只会更吵。
所以分工 = 新版出鼓/贝斯/铺底/主旋律，原曲出「另一条旋律线」，听的是两层
旋律能不能咬合（复调感），这也是「融合」最能听出效果的方式。
"""
import numpy as np
import soundfile as sf

BASE = r'C:\Users\GuSheng\Downloads\HKS\tools\build'
sr = 44100
new, _ = sf.read(BASE + r'\aya_fb_raw.wav', always_2d=True)
old, _ = sf.read(BASE + r'\old_layer_raw.wav', always_2d=True)
new, old = new[:, 0], old[:, 0]
n = min(len(new), len(old))


def write(path, g):
    out = new[:n] + old[:n] * g
    p = np.abs(out).max()
    if p > 0.95:
        out *= 0.95 / p
    sf.write(path, out, sr)
    print('%-42s peak %.3f  rms %.4f  %s' % (path.split('\\')[-1], np.abs(out).max(),
                                            float(np.sqrt((out ** 2).mean())), '%.0f%%' % (g * 100)))
    return out


write(BASE + r'\aya_fusion_melody_60.wav', 0.60)
write(BASE + r'\aya_fusion_melody_35.wav', 0.35)
a = new[:n]
print('新版单层            peak %.3f  rms %.4f' % (np.abs(a).max(), float(np.sqrt((a ** 2).mean()))))
print('原曲旋律层          peak %.3f  rms %.4f' % (np.abs(old[:n]).max(), float(np.sqrt((old[:n] ** 2).mean()))))
