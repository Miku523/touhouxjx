
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
midi = M.parse_midi(os.path.join(M.SRC_BASE, file))
chans, segs, div = M.extract_channels(midi)
for lead_ch in (6, 5):
    spec = dict(key='pre1', title='ほおずきみたいに紅い魂',
                arrange=dict(lead_chs=[lead_ch], bass_ch=1, harm_chs=[4],
                             window=(20.24, 80.24),
                             drum_limits={0:3,1:3,2:3,3:2,4:2}))
    data = M.build_song(spec, chans, segs, verbose=True)
    print('=== lead ch%d ===' % lead_ch)
    print('\n'.join(data['reasons']))
    print('duration', data['duration'], 'sizeKB', round(data['size']/1024,1))
    for tr in data['tracks']:
        notes = tr['notes']
        leaps = [abs(notes[i+1]['m']-notes[i]['m']) for i in range(len(notes)-1)]
        print('  %-8s n=%-4d lev_avg=%.1f med=%d' % (tr['_name'], len(notes),
              (sum(leaps)/len(leaps) if leaps else 0), M.chan_stats(notes)['med']))
    print('  drums', len(data['drums']))
    print()
