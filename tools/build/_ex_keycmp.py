# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L

def info(path, label):
    x, sr = L.load_mono(path)
    (ch, b), fps = L.chroma_frames(x, sr)
    k = L.key_of(ch.sum(0), b.sum(0), topn=3)
    print(label, 'len %.1fs' % (len(x)/sr))
    for r, n, m, ivs in k:
        print('   %.3f  %s %s   %s' % (r, n, m, ' '.join(ivs)))
    return x, sr, ch, b, fps

a = info(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3', 'ORIGINAL')
b = info('tools/build/ex_tepes_v08.wav', 'MINE')

# 色谱相关：原曲 vs 我（按 4 秒块，找最佳移调）
xa, sra, cha, ba, fpsa = a
xb, srb, chb, bb, fpsb = b
n = min(len(cha), len(chb))
ca, cb = cha[:n], chb[:n]
best = None
for shift in range(12):
    cs = np.roll(cb, shift, axis=1)
    r = float(np.mean([np.corrcoef(ca[i], cs[i])[0,1] for i in range(0, n, max(1, n//200)) if ca[i].std()>0 and cs[i].std()>0]))
    print('shift %2d corr %.3f' % (shift, r))
