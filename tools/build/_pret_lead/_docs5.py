# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for rel in ('index.html', 'src/ui/platform.js', 'sw.js'):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    c = s.count('1.6.68')
    s = s.replace('1.6.68', '1.6.69')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print(rel, 'replaced', c)
print('VER ok')
