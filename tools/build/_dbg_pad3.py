# -*- coding: utf-8 -*-
import sys, runpy
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import yuuhei_pre3 as Y
import inspect
src = inspect.getsource(Y.intro_pad)
print(src[:400])
