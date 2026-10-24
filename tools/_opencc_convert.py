import json
import sys

from opencc import OpenCC

mode = sys.argv[1] if len(sys.argv) > 1 else "s2twp"
data = json.load(sys.stdin)
cc = OpenCC(mode)
out = {k: cc.convert(k) for k in data}
json.dump(out, sys.stdout, ensure_ascii=False)
