# -*- coding: utf-8 -*-
import glob, os, json
import numpy as np, soundfile as sf
cands = []
for d in sorted(glob.glob('tools/build/_*_kit')):
    cands += sorted(glob.glob(d + '/*_stereo.wav'))
out = []
for p in cands:
    try:
        x, sr = sf.read(p, always_2d=True)
    except Exception as e:
        out.append({'p': p, 'err': str(e)[:80]}); continue
    m = x.mean(axis=1)
    rms = 20*np.log10(np.sqrt(np.mean(m**2)) + 1e-12)
    pk = float(np.max(np.abs(m)))
    # 400ms short-term RMS stats
    win = int(0.4*sr); r = []
    for i in range(0, len(m)-win, win):
        r.append(20*np.log10(np.sqrt(np.mean(m[i:i+win]**2)) + 1e-12))
    r = np.array(r)
    out.append({'p': p.replace('tools/build/',''), 'dur': round(len(m)/sr,2), 'rms': round(rms,2), 'peak': round(pk,3),
                'st_p10': round(float(np.percentile(r,10)),2), 'st_p50': round(float(np.percentile(r,50)),2),
                'st_p90': round(float(np.percentile(r,90)),2), 'lra': round(float(np.percentile(r,90)-np.percentile(r,10)),2)})
open('tools/build/_loudness_scan.json','w',encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
