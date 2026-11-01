# -*- coding: utf-8 -*-
import io
s = io.open('README.md', encoding='utf-8').read()
for a in ('1,996 音 1,333 鼓', '2,038 音 1,500 鼓', '母版 19,625,956 B', '母版 16,579,176 B'):
    print(repr(a), s.count(a))
