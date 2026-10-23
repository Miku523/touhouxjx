# -*- coding: utf-8 -*-
import sys, wave, numpy as np
def load(p):
    with wave.open(p, 'rb') as w:
        n = w.getnframes(); sr = w.getframerate()
        x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float32) / 32768.0
    if x.ndim > 1: x = x.mean(axis=1)
    return x, sr
for p, dur in [(sys.argv[1], float(sys.argv[2])), (sys.argv[3], float(sys.argv[4]))] if len(sys.argv) > 4 else [('tools/build/pre1_honou_v2.wav', 84.534), ('tools/build/stage1_youma_v2.wav', 53.873)]:
    x, sr = load(p)
    one = x[:int(dur * sr)]
    print('=' * 70)
    print('%s  峰 %.3f  RMS %.4f' % (p, np.max(np.abs(one)), np.sqrt(np.mean(one ** 2))))
    # 5 段频段能量
    S = np.abs(np.fft.rfft(one[:len(one) // sr * sr]))
    f = np.fft.rfftfreq(len(one[:len(one) // sr * sr]), 1 / sr)
    tot = S.sum()
    bands = [(20, 120), (120, 400), (400, 1200), (1200, 4000), (4000, 16000)]
    print('  频段 %%: ' + ' '.join('%d-%d:%.1f' % (a, b, 100 * S[(f >= a) & (f < b)].sum() / tot) for a, b in bands))
    print('  质心 %.0f Hz' % ((f * S).sum() / S.sum()))
    sec = [float(np.sqrt(np.mean(one[i * sr:(i + 1) * sr] ** 2))) for i in range(int(len(one) / sr))]
    for i in range(0, len(sec), 10):
        seg = sec[i:i + 10]
        print('  %3d-%3ds  ' % (i, i + len(seg)) + ' '.join('%.3f' % v for v in seg))
    # 接缝：末端 80ms vs 开头 80ms
    a = int((dur - 0.08) * sr); b = int(dur * sr)
    tail = one[a:b]; head = one[:int(0.08 * sr)]
    print('  接缝 尾RMS %.3f 头RMS %.3f 跳变 %.3f' % (
        np.sqrt(np.mean(tail ** 2)), np.sqrt(np.mean(head ** 2)), abs(one[b - 1] - one[0])))
