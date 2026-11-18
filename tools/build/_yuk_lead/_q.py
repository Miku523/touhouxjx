
import json, io
d = json.load(io.open('tools/build/_pret_ref/necrofantasia/midi_flat.json', encoding='utf-8'))
n = d['notes']
def dump(ch, bar):
    xs = [x for x in n if x['ch']==ch and x['bar']==bar]
    xs.sort(key=lambda x: (x['beat'], x['m']))
    return [(round(x['beat'],2), x['m'], x['v']) for x in xs]
for bar in (2,3):
    print('bar', bar)
    for ch in (0,1,2,3,4,5,8,9,15):
        print('  ch%-2d'%ch, dump(ch,bar)[:14])
