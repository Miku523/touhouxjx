# -*- coding: utf-8 -*-
# 6 面道中 MIDI：逐通道角色 + 逐小节谱
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
bar = 4.0 * div
sec_of_bar = lambda b: M.tick_to_sec(segs, div, int(round(b * bar)))
print('bar sec', round(sec_of_bar(1.0), 4))
bars = int(sec_of_bar(1e9) if False else 0)
# 末小节
end_sec = max(sec_of_bar(b) for b in range(1, 200) if sec_of_bar(b) < 90)
print('80s ≈ bar %.2f' % (80.0 / sec_of_bar(1.0)))
for ch in sorted(chans):
    ns = chans[ch]['notes']
    durs = [n['d'] for n in ns]
    durs.sort()
    mono = len({round(n['t'], 6) for n in ns})
    print('ch%-2d n=%-4d dur median %.3fs  p90 %.3fs  max %.3fs  单音时刻 %d (%.2f 音/时刻)' % (
        ch, len(ns), durs[len(durs)//2], durs[int(len(durs)*0.9)], durs[-1], mono, len(ns)/mono))
# 逐小节各通道音数
print('\nbar | ' + ' '.join('ch%-2d' % c for c in sorted(chans)))
for b in range(0, 56):
    t0, t1 = sec_of_bar(b), sec_of_bar(b + 1)
    row = []
    for ch in sorted(chans):
        cnt = sum(1 for n in chans[ch]['notes'] if t0 <= n['t'] < t1)
        row.append('%4d' % cnt)
    print('%3d | %s' % (b, ' '.join(row)))
