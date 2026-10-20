import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT,'tools'))
import preboss_rewrite as R, midi2js as M
midi = M.parse_midi(R.MID); chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60.0/bpm; bars = int(round((R.T1-R.T0)/bar))
bass = chans[1]['notes']; harm = chans[4]['notes']
chords = R.analyse_chords(bass, harm, bars, bar)
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for b,c in enumerate(chords):
    a = R.T0 + b*bar; z = a + bar
    pcs = sorted({n['m']%12 for n in bass+harm if a <= n['t'] < z})
    tones = sorted(c['tones'])
    print('%2d %-8s root=%-2s tones=%s' % (b+1, R.chord_symbol(c), names[c['root']],
          ' '.join(names[(c['root']+t)%12] for t in sorted(c['tones']))))
