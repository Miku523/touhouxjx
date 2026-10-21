# -*- coding: utf-8 -*-
"""实验：pad 只铺根音/五度/八度（不铺三度），看半音撞车率是否降到接近原曲。"""
import sys
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
t = open(P, 'rb').read().decode('utf-8')
a = "    m = [root, fifth, root + 12, third][bar % 4]"
b = "    m = [root, fifth, root + 12][bar % 3]"
assert a in t
open(P, 'wb').write(t.replace(a, b, 1).encode('utf-8'))
print('pad -> root/5/8ve only')
