import sys, os
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M2
MIDI = os.path.join(os.environ['TEMP'], 'thmidi', 'touhou-midi-collection-main', '1 - Shooter Games',
                    '8 - Imperishable Night', '15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid')
m = M2.parse_midi(MIDI)
evs = m['tracks'][0]['events']
print('first 6 events:')
for e in evs[:6]: print('  ', e)
print('len', len(evs))
# meta events: look for tuples containing 0xFF or strings
uniq = {}
for e in evs:
    key = str(e[1])[:40] if len(e) > 1 else '?'
    uniq[key] = uniq.get(key, 0) + 1
for k, v in sorted(uniq.items(), key=lambda x: -x[1])[:14]:
    print('%6d  %s' % (v, k))
