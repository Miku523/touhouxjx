# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
for tag in ('ref5_full','ref5_inst'):
    p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\%s.mp3' % tag
    info = sf.info(p); d, sr = sf.read(p, always_2d=True)
    x = d.mean(1).astype(np.float32); dur = len(x)/sr
    print('==', tag, '%.1fs' % dur, 'RMS %.3f 峰 %.3f' % (float(np.sqrt((x**2).mean())), float(np.abs(x).max())))
    def tempo(t0, t1):
        seg = x[int(t0*sr):int(t1*sr)]; hop=256; win=1024
        n = (len(seg)-win)//hop
        env = np.array([np.sqrt((seg[i*hop:i*hop+win]**2).mean()) for i in range(n)]); env -= env.mean()
        ac = np.correlate(env, env, 'full')[len(env)-1:]; fps = sr/hop
        cands=[]
        for bpm in np.arange(60,200,0.1):
            lag=int(round(fps*60/bpm))
            if 0<lag<len(ac): cands.append((float(ac[lag]), round(float(bpm),1)))
        cands.sort(reverse=True); return cands[:6]
    print(' 速度候选(40-100s):', [(round(s,3), b) for s,b in tempo(40,100)])
    print(' 时间|RMS|频段%(0-120,120-500,500-2k,2-6k,6-16k)|质心')
    for t0 in np.arange(0, dur-8, 16):
        seg = x[int(t0*sr):int((t0+8)*sr)]
        X = np.abs(np.fft.rfft(seg*np.hanning(len(seg))))**2
        f = np.fft.rfftfreq(len(seg),1/sr); tot = X.sum()+1e-12
        b = [round(float(X[(f>=lo)&(f<hi)].sum()/tot*100),1) for lo,hi in ((0,120),(120,500),(500,2000),(2000,6000),(6000,16000))]
        print('  %5.0fs %.3f %s %d' % (t0, float(np.sqrt((seg**2).mean())), b, int((f*X).sum()/tot)))
    seg = x[int(60*sr):int(120*sr)]
    X=np.abs(np.fft.rfft(seg*np.hanning(len(seg)))); f=np.fft.rfftfreq(len(seg),1/sr)
    ch=np.array([X[(f>=32.7*2**(pc/12.0))&(f<32.7*2**(pc/12.0)*8)].sum() for pc in range(12)]); ch/=ch.max()
    names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    print(' 色谱前五:', [(names[i], round(float(ch[i]),2)) for i in np.argsort(-ch)[:5]])
