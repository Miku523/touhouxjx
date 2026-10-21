# -*- coding: utf-8 -*-
"""把新版编曲与游戏内 8bit 原曲叠加，听「融合」效果。

两首同为 154 BPM、F 小调、都从第 1 拍开始，所以直接 t=0 对齐即可。
新版 D 段用的是不抬三度的原调版本（aya_stage4_fb），否则会和原曲的 F#m 撞。
"""
import numpy as np
import soundfile as sf

new, sr1 = sf.read(r'C:\Users\GuSheng\Downloads\HKS\tools\build\aya_fb_raw.wav', always_2d=True)
old, sr2 = sf.read(r'C:\Users\GuSheng\Downloads\HKS\tools\build\old_stage4_raw.wav', always_2d=True)
print('new', new.shape, sr1, 'old', old.shape, sr2)
assert sr1 == sr2

n = len(new)   # 只跟新版等长，原曲多出来的 19s 不要
def write(path, old_gain):
    m = new.copy() if False else None
    out = np.zeros((n, new.shape[1]))
    out[:len(new)] += new[:, :new.shape[1]]
    seg = old[:len(new)]
    out[:len(seg)] += seg * old_gain
    peak = np.abs(out).max()
    if peak > 0.95:
        out *= 0.95 / peak
    sf.write(path, out, sr1)
    r = float(np.sqrt((out ** 2).mean()))
    print(f'{path}  长度 {len(out)/sr1:.1f}s  peak {np.abs(out).max():.3f}  rms {r:.4f}')


write(r'C:\Users\GuSheng\Downloads\HKS\tools\build\aya_fusion_50.wav', 0.50)
write(r'C:\Users\GuSheng\Downloads\HKS\tools\build\aya_fusion_30.wav', 0.30)
print('原曲单独: peak %.3f rms %.4f' % (np.abs(old).max(), float(np.sqrt((old ** 2).mean()))))
