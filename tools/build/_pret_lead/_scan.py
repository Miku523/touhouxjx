
import os, sys, json, collections
LEAD = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
SONGS = ['pre1', 'pre2', 'pre3', 'pre4', 'pre6']
for name in SONGS:
    d = json.load(open(os.path.join(LEAD, name + '_flat.json'), encoding='utf-8'))
    notes = d['notes']; bpm = d['bpm']; beat = d['beat']; bar = d['bar']
    lastbar = max(n['bar'] for n in notes)
    chans = sorted(set(n['ch'] for n in notes))
    # per 4-bar block counts
    print('='*10, name, 'bpm', bpm, 'bars', lastbar, 'dur', round(lastbar*bar, 2))
    hdr = 'blk ' + ' '.join('ch%-2d' % c for c in chans)
    print(hdr)
    for b0 in range(1, lastbar + 1, 4):
        b1 = min(b0 + 3, lastbar)
        cnt = collections.Counter()
        pcs = collections.defaultdict(list)
        for n in notes:
            if b0 <= n['bar'] <= b1:
                cnt[n['ch']] += 1
                pcs[n['ch']].append(n['m'])
        cells = []
        for c in chans:
            v = cnt.get(c, 0)
            if c == 9:
                cells.append('%3d' % v if v else '  .')
            else:
                med = sorted(pcs[c])[len(pcs[c])//2] if v else 0
                cells.append('%3d' % v if v else '  .')
        print('%3d %s' % (b0, ' '.join(cells)))
