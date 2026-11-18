import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import midi2js as M

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
FILES = {
 'tillwhen': '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',
 'border13': '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',
 'border14': '14. Border of Life (ZUN).mid',
}
out = []
for key, fn in FILES.items():
    path = os.path.join(SRC, fn)
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    out.append('=== %s : %s' % (key, fn))
    out.append('division=%s  tracks=%d  bpm_of=%s' % (div, len(midi['tracks']), M.bpm_of(segs)))
    out.append('tempo segs (tick, sec, uspq):')
    for s in segs:
        out.append('   tick=%d sec=%.3f uspq=%d bpm=%.2f' % (s[0], s[1], s[2], 60e6/s[2]))
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            out.append('  ch%d EMPTY progs=%s' % (ch, chans[ch]['progs']))
            continue
        pitches = [n['m'] for n in ns]
        progs = sorted(set(n['p'] for n in ns))
        vels = [n['v'] for n in ns]
        out.append('  ch%d notes=%d pitch=%d..%d progs=%s avgvel=%.1f t=%.3f..%.3f' % (
            ch, len(ns), min(pitches), max(pitches), progs, sum(vels)/len(vels),
            min(n['t'] for n in ns), max(n['t']+n['d'] for n in ns)))
    out.append('')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('done')
