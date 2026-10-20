
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
midi = M.parse_midi(os.path.join(M.SRC_BASE, file))
chans, segs, div = M.extract_channels(midi)
spec = dict(key='pre1', title='ほおずきみたいに紅い魂',
            arrange=dict(lead_plan=[(20.24, 45.0, [5]), (45.0, 60.0, [3]), (60.0, 80.24, [6])],
                         bass_ch=1, harm_chs=[4],
                         window=(20.24, 80.24),
                         drum_limits={0:3,1:3,2:3,3:2,4:2}))
data = M.build_song(spec, chans, segs, verbose=True)
print('\n'.join(data['reasons']))
lead = data['tracks'][0]['notes']
print('duration', data['duration'], 'lead n', len(lead))
print('first30:', ' '.join('%s/%d' % (M.num(n['t']), n['m']) for n in lead[:30]))
print('mid40:', ' '.join('%s/%d' % (M.num(n['t']), n['m']) for n in lead[120:150]))
print('drums', len(data['drums']))
