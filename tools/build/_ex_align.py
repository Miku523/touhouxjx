# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L

def env(path, hop=441):
    x, sr = L.load_mono(path)
    n = len(x) // hop
    e = np.sqrt(np.array([np.mean(x[i*hop:(i+1)*hop]**2) for i in range(n)]))
    e = e - e.mean()
    return e / (e.std() + 1e-9), sr / hop

a, fpsa = env(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
b, fpsb = env('tools/build/ex_tepes_v08.wav')
print('ref frames', len(a), 'mine frames', len(b), 'fps', fpsa)
# 用我第二遍循环（55.4-110.8）与原曲滑动相关
blen = len(b) // 2
bb = b[:blen]
best = (-2, 0)
step = 1
for off in range(0, len(a) - blen, 1):
    seg = a[off:off+blen]
    r = float(np.dot(seg, bb) / blen)
    if r > best[0]: best = (r, off)
print('best corr %.3f at frame %d = %.2fs' % (best[0], best[1], best[1]/fpsa))
