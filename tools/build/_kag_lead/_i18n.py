import json, io, os
ROOT = r"C:/Users/GuSheng/Downloads/HKS"
data = json.load(io.open(os.path.join(ROOT, "tools/build/_kag_lead/_kag_i18n.json"), encoding="utf-8"))
import opencc
cc = opencc.OpenCC("s2twp")
for pack in ("en", "ja", "zh-hant"):
    p = os.path.join(ROOT, "src/i18n/packs/%s.js" % pack)
    s = io.open(p, encoding="utf-8", newline="").read()
    entries = []
    for k, v in data["pairs"]:
        if pack == "zh-hant":
            kk, vv = cc.convert(k), cc.convert(v)
        elif pack == "ja":
            kk, vv = k, data["ja"][k] if k in data["ja"] else v
        else:
            kk, vv = k, data["en"][k] if k in data["en"] else v
        entries.append("  " + json.dumps(kk, ensure_ascii=False) + ": " + json.dumps(vv, ensure_ascii=False) + ",")
    idx = s.rindex("\r\n};")
    add = "\r\n" + "\r\n".join(entries)
    if s.count(json.dumps(data["pairs"][0][1], ensure_ascii=False)[:40]) > 0 and False:
        pass
    s2 = s[:idx] + add + s[idx:]
    io.open(p, "w", encoding="utf-8", newline="").write(s2)
    print(pack, "keys", s2.count(":") and len(entries), "written", len(s2) - len(s))
