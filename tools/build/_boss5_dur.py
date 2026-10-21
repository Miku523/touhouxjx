# -*- coding: utf-8 -*-
import sys, statistics
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import importlib.util
spec = importlib.util.spec_from_file_location('g', r'C:\Users\GuSheng\Downloads\HKS\tools\boss5_yuuga.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
ch = g.load_notes(g.MID)
def stat(b0, b1, label):
    print('=== bars %d-%d (%s) ===' % (b0, b1, label))
    rows=[]
    for c, notes in ch.items():
        sel=[n for n in notes if b0 <= n['bar'] < b1]
        if len(sel) < 8: continue
        durs=[n['dbar'] for n in sel]
        ms=[n['m'] for n in sel]
        rows.append((c, len(sel), round(statistics.mean(durs),2), round(statistics.median(durs),2), min(ms), max(ms)))
    for r in sorted(rows, key=lambda x:-x[2]):
        print('ch%-2d n=%-4d meanD=%-5.2f medD=%-5.2f range %d-%d' % (r[0],r[1],r[2],r[3],r[4],r[5]))
stat(40,56,'A 主旋律段')
stat(56,72,'B 段')
stat(76,88,'再现')
