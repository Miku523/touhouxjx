
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_exsr_ref'))
import _midilib as M

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analysis.json')
d = json.load(open(D, encoding='utf-8'))
SHIFT = d['barDefinition']['shiftTicks']
parsed = M.parse_file(d['file'])
grid = M.build_grid(parsed)
ns = M.notes(parsed, grid)
BPM = float(d['bpm']['main'])

def gbar(t): return int((t - SHIFT) // 1920) + 1
def gbeat(t): return ((t - SHIFT) % 1920) / 480.0 + 1.0

CH = {1: 2, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 14, 8: 3, 9: 3}
for i, s in enumerate(d['sections']):
    ch = CH[i + 1]
    sel = [n for n in ns if n['ch'] == ch and s['startBar'] <= gbar(n['tickOn']) <= s['endBar']]
    sel.sort(key=lambda n: n['tickOn'])
    arr = [[gbar(n['tickOn']), round(gbeat(n['tickOn']), 3), n['pitch'],
            round((n['tickOff'] - n['tickOn']) / 480.0, 3), n['vel']] for n in sel[:96]]
    s['melody'] = arr
    s['melodyCh'] = ch
    s['melodyTruncated'] = len(sel) > 96

d['sectionsMelodyNote'] = ('每个 section 的 melody 是 [bar(1-based, 游戏口径), beat(小节内 1-based), midi, durBeats, vel]，'
                           '取该段主旋律通道（Intro=ch2 钢琴右手，E=ch14 管风琴，其余=ch3 小号），最多 96 音。')
json.dump(d, open(D, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# verify against motif themeA (should be identical notes within its bars)
ta = d['motifs']['themeA']['notes']
sec = d['sections'][1]['melody']
sel = [n for n in sec if n[0] <= 16]
ok = all(abs(a[1] - b[1]) < 1e-6 and a[2] == b[2] for a, b in zip(ta, sel))
print('CROSSCHECK themeA vs section A:', ok, len(ta), len(sel))
for s in d['sections']:
    print(s['startBar'], s['endBar'], s['melodyCh'], len(s['melody']), s['melody'][:3])
