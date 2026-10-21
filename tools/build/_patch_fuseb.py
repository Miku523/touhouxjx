# -*- coding: utf-8 -*-
import io
p='tools/un_fuse_b.py'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
old_start = s.index("BAR_PC = {}")
old_end = s.index("print('逐小节和弦根音：'")
new = '''TPL = {'m': [0, 3, 7], '': [0, 4, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10],
       'maj7': [0, 4, 7, 11], 'dim': [0, 3, 6], 'sus4': [0, 5, 7]}
BAR_PC = {}
for b in range(BARS):
    t0, t1 = b * BAR, (b + 1) * BAR
    w = {}
    lows = []
    for (t, m, du, v) in bass_old['notes'] + pad['notes'] + harm['notes'] + mel['notes']:
        if t0 <= t < t1:
            w[m % 12] = w.get(m % 12, 0) + du
            lows.append((m, du))
    if not w:
        BAR_PC[b] = (2, False)
        continue
    tot = sum(w.values()) or 1
    basspc = min(lows, key=lambda x: x[0])[0] % 12 if lows else 2
    best = None
    for r in range(12):
        for qn, ivs in TPL.items():
            ins = sum(w.get((r + i) % 12, 0) for i in ivs) / tot
            cover = sum(w.get((r + i) % 12, 0) for i in ivs) / max(1e-9, tot)
            sc = cover - 0.5 * (1 - cover) + (0.12 if r == basspc else 0) + 0.01 * len(ivs)
            if best is None or sc > best[2]:
                best = (r, qn, sc, ins)
    BAR_PC[b] = (best[0], best[1])
'''
s = s[:old_start] + new + s[old_end:]
# 打印部分改用 BAR_PC 的品质
s = s.replace("print('逐小节和弦根音：' + ' '.join(NN[BAR_PC[b][0]] + ('M' if BAR_PC[b][1] else 'm') for b in range(0, 40)))",
              "print('逐小节和弦：' + ' '.join(NN[BAR_PC[b][0]] + BAR_PC[b][1] for b in range(0, 40)))")
s = s.replace("print('             ' + ' '.join(NN[BAR_PC[b][0]] + ('M' if BAR_PC[b][1] else 'm') for b in range(40, 79)))",
              "print('           ' + ' '.join(NN[BAR_PC[b][0]] + BAR_PC[b][1] for b in range(40, 79)))")
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('patched')
