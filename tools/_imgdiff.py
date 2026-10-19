import sys
import numpy as np
from PIL import Image

a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size:
    print('size mismatch', a.size, b.size)
    sys.exit(1)
A = np.asarray(a, dtype=np.int16)
B = np.asarray(b, dtype=np.int16)
d = np.abs(A - B)
mx = int(d.max())
mean = float(d.mean())
# per-channel mean
pm = d.reshape(-1, 3).mean(axis=0)
# how many pixels differ by more than thresholds
tot = d.shape[0] * d.shape[1]
for th in (1, 2, 4, 8, 16, 32):
    n = int((d.max(axis=2) > th).sum())
    print(f'px >{th}: {n} ({100.0*n/tot:.4f}%)')
print(f'maxdiff={mx} meanabs={mean:.4f} pattern=({pm[0]:.4f},{pm[1]:.4f},{pm[2]:.4f})')

# 放大差异图，方便肉眼看分布
if len(sys.argv) > 3:
    amp = np.clip(d.max(axis=2) * 8, 0, 255).astype(np.uint8)
    Image.fromarray(amp).save(sys.argv[3])
    print('diffmap saved', sys.argv[3])
