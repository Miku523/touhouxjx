# -*- coding: utf-8 -*-
import sys, os
R = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(R, 'tools', 'build')); sys.path.insert(0, os.path.join(R, 'tools'))
import numpy as np, _ref5_lib as RL, midi2js as M
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
REF = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre5\refA.mp3'
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
x, sr = RL.load_mono(REF)
mt, ms, fps = RL.melody_track(x, sr)
print('fps %.2f frames %d dur %.1fs' % (fps, len(mt), len(mt)/fps))
ch, segs, div = M.extract_channels(M.parse_midi(MID))
STEP = 60.0/155.0/2   # 八分音符 0.1935s
N = int(110/STEP)
def grid_from_midi(notes):
    arr = np.full(N, np.nan)
    for n in sorted(notes, key=lambda z: (z['t'], z['m'])):
        i = int(n['t']/STEP)
        if 0 <= i < N and np.isnan(arr[i]):
            arr[i] = n['m']
    return arr
def grid_from_ref():
    arr = np.full(N, np.nan)
    k = int(STEP*fps)
    for i in range(N):
        a = int(i*k); b = int((i+1)*k)
        seg = mt[a:b]; st = ms[a:b]
        if len(seg) == 0: continue
        ok = st > np.percentile(ms, 40)
        if ok.sum() > 0:
            arr[i] = np.median(seg[ok])
    return arr
gm = grid_from_midi(ch[0]['notes'])
gr = grid_from_ref()
# 只在两边都有值处比较
mask = ~np.isnan(gm) & ~np.isnan(gr)
print('有效格 %d / %d' % (mask.sum(), N))
for w0, w1, tag in ((0, 30, '前奏'), (32.5, 55, '主体A'), (56, 80, '中段B'), (80, 106, '后段C')):
    a, b = int(w0/STEP), int(w1/STEP)
    m = mask[a:b]
    if m.sum() < 10: 
        print(tag, '样本不足'); continue
    u = gm[a:b][m]; v = gr[a:b][m]
    u = u - np.nanmean(u); v = v - np.nanmean(v)
    c = float((u*v).sum()/(np.sqrt((u**2).sum()*(v**2).sum())+1e-9))
    print('%s %.0f-%.0fs  轮廓相关 %.3f  中位差 %.1f 半音  n=%d' % (tag, w0, w1, c, np.nanmedian(gm[a:b][m]-gr[a:b][m]), m.sum()))
# 打印主体开头 24 个八分格对照
a = int(32.5/STEP)
print('MIDI :', [None if np.isnan(z) else int(z) for z in gm[a:a+24]])
print('REF  :', [None if np.isnan(z) else round(float(z),1) for z in gr[a:a+24]])
