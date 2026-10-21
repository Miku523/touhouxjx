# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.abspath('.\..\..\tools'))
sys.path.insert(0, os.path.abspath('.'))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import importlib.util
spec = importlib.util.spec_from_file_location('g', os.path.abspath('..\..\tools\ex_septette2.py'))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
notes, div = g.load()
for ch in sorted(notes):
    ns = notes[ch]
    if not ns: continue
    b0 = min(n['b'] for n in ns) / 3.0; b1 = max(n['b'] for n in ns) / 3.0
    print('ch%-3d n=%-5d bar %6.2f-%6.2f  m %3d-%3d' % (ch, len(ns), b0, b1, min(n['m'] for n in ns), max(n['m'] for n in ns)))
