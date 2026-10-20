import sys, soundfile as sf, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = sys.argv[1]
d, sr = sf.read(p, always_2d=True); x = d.mean(1)
print('%-32s 峰 %.3f RMS %.3f' % (p.split('/')[-1], float(np.abs(x).max()), float(np.sqrt((x**2).mean()))))
for a,b in ((15,18),(20,23),(23,24),(24,26),(26,28.6),(28.6,30),(30,33),(38,41),(63,66)):
    seg=x[int(a*sr):int(b*sr)]
    print('   %4.1f-%4.1fs RMS %.4f' % (a,b,float(np.sqrt((seg**2).mean()))))
