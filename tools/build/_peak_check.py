import sys, soundfile as sf, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
for p in ('tools/build/pre3_yuuhei_v6.wav','tools/build/stage3_ateam_v7.wav'):
    d, sr = sf.read(p, always_2d=True); x = d.mean(1)
    print('%-32s 峰 %.3f RMS %.3f' % (p.split('/')[-1], float(np.abs(x).max()), float(np.sqrt((x**2).mean()))))
    if 'pre3' in p:
        for a,b in ((0,0.5),(0.5,1.5),(1.5,3),(3,5)):
            seg=x[int(a*sr):int(b*sr)]
            print('   %4.1f-%4.1fs RMS %.4f' % (a,b,float(np.sqrt((seg**2).mean()))))
    else:
        for a,b in ((23,24),(24,26),(26,28.6),(28.6,30),(30,33)):
            seg=x[int(a*sr):int(b*sr)]
            print('   %4.1f-%4.1fs RMS %.4f' % (a,b,float(np.sqrt((seg**2).mean()))))
