# -*- coding: utf-8 -*-
import sys, importlib.util
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
spec = importlib.util.spec_from_file_location('g', r'C:\Users\GuSheng\Downloads\HKS\tools\boss5_yuuga.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
import midi2js as M
ch = g.load_notes(g.MID)
c2 = sorted(ch[2], key=lambda n: (n['bar'], n['dbar']))
print('ch2 前 12 音:', [(round(n['bar'],2), round(n['dbar'],2), n['m'], n['v']) for n in c2[:12]])
bar = 4*60.0/144
out = g.arrange(ch[2], bar, sections=('A','B','D'))
out = M.mono_ize(out, keep='high')
print('arrange 后 前 10 音:', [(round(n['t'],2), n['m']) for n in sorted(out, key=lambda n:n['t'])[:10]])
# 检查 arrange 内部对 A 的映射
print('SEC A =', g.SEC['A'], 'bar=', round(bar,4))
