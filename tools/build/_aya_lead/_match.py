
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))
notes = d['notes']
BEAT, BAR = d['beat'], d['bar']
byc = collections.defaultdict(set)
for n in notes:
    byc[n['ch']].add((round(n['t'], 2), n['m']))

# 读游戏现曲
import re
src = open(ROOT + '/src/engine/songs/aya_stage4_b.js', encoding='utf-8').read()
js = src[src.index('{'):].rstrip().rstrip(';')
obj = json.loads(js)  # {stage4: {...}}
song = obj['stage4']
print('game song', song['title'], song['duration'], song['bpm'], 'tracks', len(song['tracks']))
for ti, tr in enumerate(song['tracks']):
    ns = tr['notes']
    s = set((round(n[0], 2), n[1]) for n in ns)
    best = []
    for ch in sorted(byc):
        inter = len(s & byc[ch])
        best.append((inter / max(1, len(s)), inter, ch))
    best.sort(reverse=True)
    r = best[0]
    print('track%2d %-10s n=%4d  best ch%-2d overlap %.2f (%d)' % (ti, tr.get('name', '?'), len(ns), r[2], r[0], r[1]))
