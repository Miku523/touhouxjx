
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
midi = M.parse_midi(os.path.join(M.SRC_BASE, file))
chans, segs, div = M.extract_channels(midi)
spec = dict(key='pre1', title='ほおずきみたいに紅い魂')
data = M.build_song(spec, chans, segs, verbose=True)
print('\n'.join(data['reasons']))
print('duration', data['duration'], 'bpm', data['bpm'], 'sizeKB', round(data['size']/1024,1))
for tr in data['tracks']:
    print('  %-8s %-8s gain=%.2f n=%d' % (tr['_name'], tr['wave'], tr['gain'], len(tr['notes'])))
print('  drums', len(data['drums']))
lead = data['tracks'][0]['notes']
print('  lead first20:', ', '.join('%s/%d/%.2f' % (M.num(n['t']), n['m'], n['d']) for n in lead[:20]))
