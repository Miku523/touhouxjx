import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
FILES = [
 ('tillwhen', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'),
 ('border13', '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'),
 ('border14', '14. Border of Life (ZUN).mid'),
]
DRUMSET = set([35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67])
out = []
for key, fn in FILES:
    midi = M.parse_midi(os.path.join(SRC, fn))
    chans, segs, div = M.extract_channels(midi)
    # classify drum-ish: all pitches <=67 AND prog>=100 or density high
    info = {}
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns: continue
        ps = set(n['m'] for n in ns)
        dur = max(n['t']+n['d'] for n in ns) - min(n['t'] for n in ns)
        info[ch] = dict(ns=ns, ps=ps, span=dur, progs=sorted(set(n['p'] for n in ns)))
    # grid 0.05s
    STEP = 0.05
    cells = collections.defaultdict(list)  # (ch) -> no
    grid = collections.defaultdict(list)   # idx -> [(ch,pitch)]
    tmax = 0
    for ch, d in info.items():
        for n in d['ns']:
            t0 = int(n['t']/STEP); t1 = int((n['t']+n['d'])/STEP)
            for i in range(t0, min(t1, t0+400)+1):
                grid[i].append((ch, n['m']))
            tmax = max(tmax, t1)
    out.append('######## %s  (grid %.2fs, %d cells)' % (key, STEP, len(grid)))
    for ch, d in sorted(info.items()):
        ps = d['ps']
        # density
        dens = len(d['ns'])/max(d['span'], 0.001)
        # simultaneity: average number of notes at an onset
        onsets = collections.defaultdict(int)
        for n in d['ns']: onsets[round(n['t'],3)] += 1
        avg_sim = sum(onsets.values())/len(onsets)
        # top voice cells
        top = 0; total = 0
        for i, lst in grid.items():
            if not any(c==ch for c,_ in lst): continue
            total += 1
            mx = max(p for _,p in lst)
            if any(c==ch and p==mx for c,p in lst): top += 1
        # mean pitch weighted by duration
        wsum = sum(n['m']*n['d'] for n in d['ns']); wt = sum(n['d'] for n in d['ns'])
        out.append('ch%-3d n=%-5d span=%6.1fs dens=%5.2f/s avgsim=%.2f meanpitch=%5.1f maxp=%3d minp=%3d progs=%s topcells=%d/%d (%.2f)' % (
            ch, len(d['ns']), d['span'], dens, avg_sim, wsum/max(wt,1e-9), max(ps), min(ps), d['progs'], top, max(total,1), top/max(total,1)))
    out.append('')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'explore3_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
