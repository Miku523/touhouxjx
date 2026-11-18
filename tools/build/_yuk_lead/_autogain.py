# -*- coding: utf-8 -*-
"""段平衡自动化：A2 +1.4dB / B -0.4dB（0.4s 余弦斜坡），输出 raw。"""
import numpy as np, soundfile as sf, sys
src, dst = sys.argv[1], sys.argv[2]
x, sr = sf.read(src, always_2d=True)
n = len(x)
t = np.arange(n)/sr
def ramp(t, a, b, r=0.4):
    g = np.zeros_like(t)
    g[(t>=a)&(t<b)] = 1.0
    ia = (t>=a-r)&(t<a); g[ia] = 0.5-0.5*np.cos(np.pi*(t[ia]-(a-r))/r)
    ib = (t>=b)&(t<b+r); g[ib] = 0.5+0.5*np.cos(np.pi*(t[ib]-b)/r)
    return g
gdb = np.zeros_like(t)
gdb += 1.4*ramp(t, 53.023, 75.349)
gdb += -0.4*ramp(t, 30.698, 53.023)
g = 10.0**(gdb/20.0)
sf.write(dst, x*g[:,None], sr, subtype='PCM_24')
print('gain applied: min %.2f dB max %.2f dB' % (gdb.min(), gdb.max()))
