# -*- coding: utf-8 -*-
"""_ref5_dump.py —— 批量分析 5 首参考曲，落盘 tools/build/_ref5_raw.json。
用法：python tools/build/_ref5_dump.py            # 全部
      python tools/build/_ref5_dump.py refA refE  # 指定
"""
import sys, os, json, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L

SRC = r'C:\Users\GuSheng\AppData\Local\Temp\aya_ref'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_ref5_raw.json')
ALL = ['refA', 'refB', 'refD', 'refE', 'refF']

names = sys.argv[1:] or ALL
data = {}
if os.path.exists(OUT) and sys.argv[1:]:
    data = json.load(open(OUT, encoding='utf-8'))
for nm in names:
    t = time.time()
    data[nm] = L.analyze(os.path.join(SRC, nm + '.mp3'))
    print('   -> %s 用 %.1fs' % (nm, time.time() - t))
json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('已写', OUT, '曲目:', list(data))
