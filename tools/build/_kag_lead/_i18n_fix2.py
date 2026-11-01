# -*- coding: utf-8 -*-
import json, io, os, opencc
ROOT = r"C:/Users/GuSheng/Downloads/HKS"
cc = opencc.OpenCC("s2twp")
p = os.path.join(ROOT, "src/i18n/packs/zh-hant.js")
s = io.open(p, encoding="utf-8", newline="").read()
data = json.load(io.open(os.path.join(ROOT, "tools/build/_kag_lead/_kag_i18n.json"), encoding="utf-8"))
fixed = 0
for pair in data["pairs"]:
    zh = pair[0]
    bad = json.dumps(cc.convert(zh), ensure_ascii=False) + ": "
    good = json.dumps(zh, ensure_ascii=False) + ": "
    if bad in s:
        s = s.replace(bad, good)
        fixed += 1
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("fixed", fixed)
