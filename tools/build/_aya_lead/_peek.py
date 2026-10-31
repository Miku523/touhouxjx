
import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya2_ref/analysis.json', encoding='utf-8'))
def walk(o, p='', depth=0):
    if depth > 2: return
    if isinstance(o, dict):
        for k, v in o.items():
            t = type(v).__name__
            n = len(v) if isinstance(v, (list, dict)) else ''
            print('  ' * depth + '%s: %s %s' % (k, t, n))
            if isinstance(v, (dict, list)) and depth < 2:
                walk(v, p + '/' + k, depth + 1)
    elif isinstance(o, list) and o:
        print('  ' * depth + '[0] sample:', json.dumps(o[0], ensure_ascii=False)[:300])
walk(d)
