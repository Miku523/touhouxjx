
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
path = os.path.join(M.SRC_BASE, file)
midi = M.parse_midi(path)
chans, segs, div = M.extract_channels(midi)
raw_end = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
print('tracks', len(midi['tracks']), 'division', div, 'tempo pts', len(segs))
print('bpm', M.bpm_of(segs), 'raw_end', round(raw_end,2), 's')
for ch in sorted(chans):
    st = M.chan_stats(chans[ch]['notes'])
    print('ch%-2d prog=%-14s n=%-5d med=%-3d poly=%3.0f%% dur=%.2f first=%.2f last=%.2f'
          % (ch, M.fmt_progs(chans[ch]['progs']), st['count'], st['med'], st['poly']*100, st['avg_dur'],
             min(n['t'] for n in chans[ch]['notes']), max(n['t']+n['d'] for n in chans[ch]['notes'])))
