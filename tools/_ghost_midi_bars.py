# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
path = os.path.join(M.SRC_BASE, '8 - Imperishable Night', '2. Illusionary Night ~ Ghostly Eyes (ZUN).mid')
midi = M.parse_midi(path); chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60.0/bpm
end = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
bars = int(end/bar) + 1
print('bpm', bpm, 'bar %.3fs' % bar, 'end %.2fs' % end, 'bars', bars)
lead_chs = [0, 3]
bass_ch = 4
for b in range(bars):
    a, z = b*bar, (b+1)*bar
    def cnt(ch):
        return sum(1 for n in chans.get(ch, {}).get('notes', []) if a <= n['t'] < z)
    def pcs(ch):
        s = collections.Counter(n['m'] % 12 for n in chans.get(ch, {}).get('notes', []) if a <= n['t'] < z)
        return ','.join(str(k) for k, _ in s.most_common(3))
    print('bar%2d  lead0=%-2d lead3=%-2d bass=%-2d harm=%-2d arp=%-2d  basspcs=%s'
          % (b+1, cnt(0), cnt(3), cnt(bass_ch), cnt(1), cnt(8), pcs(bass_ch)))
