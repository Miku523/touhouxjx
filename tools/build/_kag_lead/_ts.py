import sys, os
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M2
MIDI = os.path.join(os.environ['TEMP'], 'thmidi', 'touhou-midi-collection-main', '1 - Shooter Games',
                    '8 - Imperishable Night', '15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid')
m = M2.parse_midi(MIDI)
print('division', m.get('division'), 'tracks', len(m['tracks']))
for ti, tr in enumerate(m['tracks']):
    for ev in tr['events'][:80]:
        pass
    # dump meta events (type 0xFF usually kept as ('meta', ...) or skipped)
    kinds = set()
    for ev in tr['events']:
        kinds.add(tuple(ev.keys()) if isinstance(ev, dict) else type(ev).__name__)
    print(ti, len(tr['events']), list(kinds)[:4])
