# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import midi2js as M, importlib.util
spec = importlib.util.spec_from_file_location('g', r'C:\Users\GuSheng\Downloads\HKS\tools\boss5_yuuga.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
ch = g.load_notes(g.MID)
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12] + str(m//12-1)
# compare ch2 vs ch7 in bars 56-60
for b in range(56, 60):
    a = [n for n in ch[2] if b <= n['bar'] < b+1]
    c = [n for n in ch[7] if b <= n['bar'] < b+1]
    print('b%d ch2: %s' % (b, ' '.join(pn(n['m']) for n in a)))
    print('    ch7: %s' % (' '.join(pn(n['m']) for n in c)))
# check whether ch7 == ch2 + 12 pitch-wise over B
import collections
seq2 = [(round(n['bar'],2), n['m']) for n in ch[2] if 56 <= n['bar'] < 70]
seq7 = [(round(n['bar'],2), n['m']) for n in ch[7] if 56 <= n['bar'] < 70]
print('ch2 notes', len(seq2), 'ch7 notes', len(seq7))
d = collections.Counter(m7 - m2 for (t2, m2), (t7, m7) in zip(seq2, seq7) if abs(t2-t7) < 0.05)
print('同刻音高差直方', d.most_common(6))
