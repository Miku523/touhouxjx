# -*- coding: utf-8 -*-
import io
p = 'README.md'
s = io.open(p, encoding='utf-8').read()
pairs = [
 ('1,996 音 1,333 鼓', '2,043 音 1,337 鼓'),
 ('2,038 音 1,500 鼓', '2,093 音 1,504 鼓'),
 ('；母版 19,625,956 B', '；原曲开头两小节本身是空拍（逐音搬入后成了 1.3 秒死气），这一版用雾状 pad、心跳底鼓与低音持续把空隙填住；母版 19,625,956 B'),
 ('；母版 16,579,176 B', '；原曲开头两小节同样是休止，这里铺了冰面 pad、心跳与冰晶三十二分，1.6 秒的空洞不再出现；母版 16,579,176 B'),
]
for a, b in pairs:
    n = s.count(a)
    print(repr(a), n)
    assert n == 1
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
