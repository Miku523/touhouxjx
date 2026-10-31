# -*- coding: utf-8 -*-
import json, os, opencc
HERE = os.path.dirname(os.path.abspath(__file__))
zh = json.load(open(os.path.join(HERE, '_note_zh.json'), encoding='utf-8'))
cc = opencc.OpenCC('s2twp')
out = {k: cc.convert(v) for k, v in zh.items()}
json.dump(out, open(os.path.join(HERE, '_note_hant.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')
