# -*- coding: utf-8 -*-
import sys, os, numpy as np
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
xm, sr = L.load_mono('tools/build/ex_tepes_v08.wav')
print('sr', sr, 'len %.2f' % (len(xm)/sr), 'dtype', xm.dtype, 'rms %.3f' % np.sqrt(np.mean(xm**2)))
(chm, bm), fps = L.chroma_frames(xm, sr)
print('frames', chm.shape, bm.shape, 'fps %.2f' % fps)
b0 = bm[:int(fps*2)].sum(0); b0 = b0 / b0.sum()
print('my bass 0-2s:', ' '.join('%s%.2f' % (PC[i], b0[i]) for i in np.argsort(-b0)[:6]))
h0 = chm[:int(fps*2)].sum(0); h0 = h0 / h0.sum()
print('my harm 0-2s:', ' '.join('%s%.2f' % (PC[i], h0[i]) for i in np.argsort(-h0)[:6]))
