
import json, collections, os
ROOT = r"C:\Users\GuSheng\Downloads\HKS"
d = json.load(open(os.path.join(ROOT,'tools/build/_kag_lead/midi_flat.json')))
notes = d['notes']
BT = d['beat']
per = collections.defaultdict(collections.Counter)
for n in notes:
    tickish = round(n['t'] / BT * 480)
    per[n['ch']][tickish % 480] += 1
for ch in sorted(per):
    c = per[ch]
    top = sorted(c.items(), key=lambda x: -x[1])[:5]
    print('ch%-2d' % ch, ' '.join('tick%%480=%d:%d' % (k, v) for k, v in top))
