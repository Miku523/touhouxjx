# -*- coding: utf-8 -*-
"""竹取飛翔 融合稿 v2 —— 按「原曲实测拍子时钟」重铺伴奏。

关键点：
  * 游戏内 stage6 声明 bpm=128，但实测拍速 152-154 漂移（16 分步长 0.0974-0.0988s）。
    按固定 128 铺层必然「踩不到拍子上」。这里用原曲贝斯轨反推「步号→时间」单调时钟，
    新层全部写在这个时钟上，落拍与原曲逐格对齐。
  * 原曲两条旋律轨（track0 / track2）逐音照搬，不动一个音。
  * 新层：贝斯（重写，走向取原曲逐小节真实根音）+ 月光琶音（8 分，单声部）+ 鼓（原鼓保留 + 强拍加底鼓/吊镲）。
"""
import json
import os
import sys

import numpy as np

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage6.json'), encoding='utf-8'))
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'kaguya_stage6.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_kaguya_song.json')
DUR = float(old['duration'])

# ---------------- 步号时钟 ----------------
bass_src = np.array(sorted(t for (t, m, d, v) in old['tracks'][1]['notes']))
dd = np.diff(bass_src)
units = np.array([np.median(dd[max(0, i - 15):min(len(dd), i + 16)]) for i in range(len(dd))])
units = np.clip(units, 0.090, 0.106)
idx = [0.0]
for i, di in enumerate(dd):
    idx.append(idx[-1] + max(1, int(round(di / units[i]))))
idx = np.array(idx)
STEP_MED = float(np.median(np.diff(bass_src) / np.maximum(1, np.round(np.diff(bass_src) / units))))
print('时钟：%d 锚点 %d 步，平均步长 %.4fs（≈%.1f BPM 16分）' % (len(idx), idx[-1] + 1, STEP_MED, 60 / (STEP_MED * 4)))


def T(step):
    return float(np.interp(step, idx, bass_src))


kicks = np.array(sorted(t for (t, k, v) in old['drums'] if k == 0))
kid = np.interp(kicks, bass_src, idx)
sc = [(b0, sum(1 for r in np.round(kid) % 16 if (int(r) - b0) % 16 in (0, 4, 8, 12))) for b0 in range(16)]
B0 = max(sc, key=lambda x: x[1])[0]
NBARS = int((idx[-1] - B0) // 16) + 1
print('小节原点 %d，共 %d 小节（%.2fs）' % (B0, NBARS, T(B0 + NBARS * 16)))


def t_of(b, s):
    return T(B0 + b * 16 + s)


# ---------------- 和弦库 ----------------
CH = {
    'Fm': (5, [0, 3, 7]), 'F': (5, [0, 4, 7]), 'Fm7': (5, [0, 3, 7, 10]),
    'Bbm': (10, [0, 3, 7]), 'Bb': (10, [0, 4, 7]), 'Bbm7': (10, [0, 3, 7, 10]),
    'Eb': (3, [0, 4, 7]), 'Eb7': (3, [0, 4, 7, 10]), 'Ebm': (3, [0, 3, 7]),
    'Ab': (8, [0, 4, 7]), 'Abm': (8, [0, 3, 7]), 'Abmaj7': (8, [0, 4, 7, 11]),
    'Db': (1, [0, 4, 7]), 'Dbmaj7': (1, [0, 4, 7, 11]), 'C7': (0, [0, 4, 7, 10]),
    'Cm': (0, [0, 3, 7]), 'Gm': (7, [0, 3, 7]), 'G': (7, [0, 4, 7]),
    'Dm': (2, [0, 3, 7]), 'D': (2, [0, 4, 7]), 'Am': (9, [0, 3, 7]), 'A': (9, [0, 4, 7]),
    'Em': (4, [0, 3, 7]), 'E': (4, [0, 4, 7]), 'Bm': (11, [0, 3, 7]), 'B': (11, [0, 4, 7]),
    'Gdim': (7, [0, 3, 6]), 'Cdim': (0, [0, 3, 6]), 'Gbm': (6, [0, 3, 7]), 'Gb': (6, [0, 4, 7]),
}
NAMES = list(CH)

# ---------------- 逐小节真实和声 ----------------
bars = []
for b in range(NBARS):
    t0, t1 = t_of(b, 0), T(B0 + (b + 1) * 16)
    notes = [(t, m, dv, v) for tr in old['tracks'] for (t, m, dv, v) in tr['notes'] if t0 <= t < t1]
    bassn = [(t, m, dv) for (t, m, dv, v) in old['tracks'][1]['notes'] if t0 <= t < t1]
    den = sum(dv for (t, m, dv) in bassn) or 1.0
    rootw = {}
    for (t, m, dv) in bassn:
        rootw[m % 12] = rootw.get(m % 12, 0) + dv / den
    pcs = {}
    for (t, m, dv, v) in notes:
        pcs[m % 12] = pcs.get(m % 12, 0) + dv
    tot = sum(pcs.values()) or 1.0
    best = None
    for nm in NAMES:
        r, ivs = CH[nm]
        inside = sum(pcs.get((r + i) % 12, 0) for i in ivs) / tot
        outside = 1 - inside
        sc_ = inside - 0.55 * outside + 0.35 * rootw.get(r, 0) + 0.02 * len(ivs)
        if best is None or sc_ > best[1]:
            best = (nm, sc_)
    bars.append((b, best[0], sc_))

print('\n逐小节和声：')
for i in range(0, NBARS, 2):
    print('  b%-2d %s' % (bars[i][0] + 1, ' '.join('%s(%.2f)' % (bars[j][1], bars[j][2]) for j in range(i, min(i + 2, NBARS)))))
json.dump({'bpm_eff': 60 / (STEP_MED * 4), 'bars': [[b, c, s] for (b, c, s) in bars]},
          open(os.path.join(BASE, 'tools', 'build', '_kaguya_bars.json'), 'w', encoding='utf-8'), ensure_ascii=False)
