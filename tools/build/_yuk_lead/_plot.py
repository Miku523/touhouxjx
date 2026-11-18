# -*- coding: utf-8 -*-
import numpy as np, soundfile as sf, sys
sys.stdout.reconfigure(encoding='utf-8')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
for cand in ('C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/simhei.ttf','C:/Windows/Fonts/msyhbd.ttc'):
    try:
        font_manager.fontManager.addfont(cand); plt.rcParams['font.family']=font_manager.FontProperties(fname=cand).get_name(); break
    except Exception: pass
plt.rcParams['axes.unicode_minus']=False

x, sr = sf.read('tools/build/_yuk_kit/yukari_ph_stereo.wav', always_2d=True); x = x.mean(axis=1)
BAR = 4*60/172.0; T = len(x)/sr
secs = [('引子',1,6),('A',7,22),('B',23,38),('A2',39,54),('C',55,70),
        ('C2',71,86),('D',87,102),('D2',103,118),('终曲',119,121),('尾声',122,125)]
def tw(bar): return (bar-1)*BAR

# ── envelope (RMS over 50ms hops)
hop = int(sr*0.05)
n = len(x)//hop
rms = np.array([np.sqrt((x[i*hop:(i+1)*hop]**2).mean()) for i in range(n)])
env_db = 20*np.log10(rms + 1e-9)
tt = np.arange(n)*hop/sr

# ── STFT
N = 2048; H = 512
win = np.hanning(N)
frames = 1 + (len(x)-N)//H
S = np.empty((N//2+1, frames), dtype=np.float32)
for i in range(frames):
    seg = x[i*H:i*H+N]*win
    S[:,i] = np.abs(np.fft.rfft(seg))
freqs = np.fft.rfftfreq(N, 1/sr)
Sdb = 20*np.log10(S + 1e-9)
tf = (np.arange(frames)*H + N/2)/sr

fig = plt.figure(figsize=(16,9), dpi=110)
gs = fig.add_gridspec(3,1, height_ratios=[1.0,1.55,0.85], hspace=0.12)
ax1 = fig.add_subplot(gs[0]); ax2 = fig.add_subplot(gs[1]); ax3 = fig.add_subplot(gs[2])

colors = ['#241f33','#2f2540','#3a2a4a','#31263f','#4a2b48','#5a2e52','#6d2f58','#7a2f5e','#3a2a4f','#20202e']
for (name,b0,b1),c in zip(secs, colors):
    for ax in (ax1,ax2,ax3):
        ax.axvspan(tw(b0), tw(b1), color=c, alpha=0.55, lw=0)
for (name,b0,b1) in secs:
    ax1.text((tw(b0)+tw(b1))/2, 1.9, name, ha='center', va='bottom', fontsize=9, color='#ffd9e4')

ax1.plot(tt, env_db, color='#ff7fa0', lw=0.9)
ax1.set_ylim(-46, 6); ax1.set_xlim(0, T); ax1.set_ylabel('RMS (dB)')
ax1.set_xticklabels([]); ax1.grid(alpha=0.15)
ax1.set_title('《ネクロファンタジア（隙間妖蝶編）》173.7s · 172BPM · 降 B 小调 → G 小调 → B 大调 → 降 B 大调 · 125 小节', fontsize=12, pad=10)

ax2.imshow(Sdb, origin='lower', aspect='auto', cmap='magma', extent=[0,T,0,freqs[-1]],
           vmin=np.percentile(Sdb,55), vmax=np.percentile(Sdb,99.7))
ax2.set_ylim(0, 8000); ax2.set_ylabel('Hz'); ax2.set_xticklabels([])
ax2.set_xlim(0,T)

# ── 3-band energy per 1.5s bar
def band(f0,f1):
    m = (freqs>=f0)&(freqs<f1)
    return 10*np.log10((S[m]**2).sum(axis=0)+1e-12)
lo, mid, hi = band(40,250), band(300,3000), band(4000,12000)
for arr,lab,c in ((lo,'低频 40–250Hz','#7fb0ff'),(mid,'中频 300–3kHz','#9ef0a0'),(hi,'高频 4–12kHz','#ffd27f')):
    ax3.plot(tf, arr - arr.max(), color=c, lw=1.0, label=lab)
ax3.set_xlim(0,T); ax3.set_ylim(-46,3); ax3.set_xlabel('秒'); ax3.set_ylabel('相对能量 (dB)')
ax3.legend(loc='lower left', fontsize=8, ncol=3, framealpha=0.25)
ax3.grid(alpha=0.15)
for (name,b0,b1) in secs:
    for ax in (ax1,ax2,ax3):
        ax.axvline(tw(b0), color='#ffffff', alpha=0.10, lw=0.6)
out='tools/build/_yuk_kit/audition.png'
plt.savefig(out, bbox_inches='tight', facecolor='#0d0a12')
print('saved', out)