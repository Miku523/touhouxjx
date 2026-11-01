# -*- coding: utf-8 -*-
import io
s = io.open('README.md', encoding='utf-8').read()
for key in ('1,996', '2,038'):
    i = s.index(key)
    seg = s[i-30:i+60]
    print(repr(seg))
