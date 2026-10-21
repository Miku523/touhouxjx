# -*- coding: utf-8 -*-
import sys, os, json, numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
sys.path.insert(0, os.path.join(os.getcwd(), 'tools', 'build'))
import _ref5_lib as L
xr, sr = L.load_mono(r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex\tepes_zun.mp3')
lead = json.load(open('tools/build/_ex_lead.json', encoding='utf-8'))
if isinstance(lead, dict): lead = lead.get('notes', lead.get('lead'))
OFF = 57.44
for tag, t0, t1 in (('a', 19.5, 27.5), ('b', 26.0, 34.0)):
    a = int((OFF + t0) * sr); b = int((OFF + t1) * sr)
    seg = xr[a:b]
    fig, ax = plt.subplots(figsize=(16, 6), dpi=110)
    ax.specgram(seg, NFFT=2048, Fs=sr, noverlap=1536, cmap='magma')
    ax.set_ylim(400, 1700)
    ax.set_xlim(0, t1 - t0)
    # 叠加主旋律音符
    for n in lead:
        t, m, d = n[0], n[1], n[2]
        if t0 - 0.2 <= t <= t1:
            f0 = 440.0 * 2 ** ((m - 69) / 12.0)
            ax.plot([t - t0, t - t0 + max(d, 0.08)], [f0, f0], color='#22ff88', lw=2.2)
            ax.text(t - t0, f0 * 1.045, str(m), color='#aaffcc', fontsize=7)
    ax.set_ylabel('Hz')
    ax.set_xlabel('time (s, 我的时间轴)')
    ax.set_title('ZUN 原曲（对齐后）频谱 + 我用的主旋律音（绿线） %s' % tag)
    fig.tight_layout()
    fig.savefig('tools/build/_ex_spec_%s.png' % tag)
    plt.close(fig)
    print('saved', tag)
