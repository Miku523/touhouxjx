import json
d = json.load(open('tools/_pt/perf_mem_summary.json', encoding='utf-8'))
for k in ('gpu', 'soft'):
    v = d[k]
    print('==', k)
    for f in ('heap0', 'heapA', 'heapB', 'metrics0', 'metrics1', 'idle'):
        print(f, json.dumps(v.get(f), ensure_ascii=False)[:700])
    tr = v.get('transitions')
    print('transitions type', type(tr).__name__, json.dumps(tr, ensure_ascii=False)[:1000])
    print('topAlloc', json.dumps(v.get('topAlloc'), ensure_ascii=False)[:1200])
    print('errors', json.dumps(v.get('errors'), ensure_ascii=False)[:400])
    ws = v.get('windows') or []
    print('windows n', len(ws), json.dumps(ws[:3], ensure_ascii=False)[:400])
    ss = v.get('samples') or []
    if ss:
        used = [x['used'] for x in ss]
        print('samples n', len(ss), 'usedMB min/max/last', round(min(used)/1e6,2), round(max(used)/1e6,2), round(used[-1]/1e6,2))
