# -*- coding: utf-8 -*-
import os, sys, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

SRC = M.SRC_BASE
FILES = {
  'ghost': ('8 - Imperishable Night', '2. Illusionary Night ~ Ghostly Eyes (ZUN).mid'),
  'sweet': ('8 - Imperishable Night', '3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid'),
}
for key, (d, f) in FILES.items():
    path = os.path.join(SRC, d, f)
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    end = max((n['t'] + n['d'] for c in chans.values() for n in c['notes']), default=0)
    print('\n=== %s  bpm=%s  end=%.2fs  chans=%d' % (key, bpm, end, len(chans)))
    for ch in sorted(chans):
        notes = chans[ch]['notes']
        if not notes or ch == 9:
            continue
        st = M.chan_stats(notes)
        prog = M.main_prog(chans[ch]['progs'])
        # 每 8 秒的音符数，看哪些通道在哪些时段活
        bins = collections.Counter(int(n['t'] // 8.0) for n in notes)
        spread = ' '.join('%d' % bins.get(b, 0) for b in range(int(end // 8) + 1))
        print('  ch%-2d prog=%-3d n=%-4d med=%-3d poly=%.2f avgDur=%.2f  %s'
              % (ch, prog, len(notes), st['med'], st['poly'], st['avg_dur'], spread))
