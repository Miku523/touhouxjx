# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid'
mid = M.parse_midi(p); chans, segs, div = M.extract_channels(mid)
dur = max(n['t']+n['d'] for c in chans.values() for n in c['notes'])
print('总时长 %.2fs  tempo bpm %s' % (dur, sorted({round(60e6/s[2],1) for s in segs})))
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if not ns: continue
    st = M.chan_stats(ns); t0 = min(n['t'] for n in ns); t1 = max(n['t']+n['d'] for n in ns)
    print(' ch%-2d n=%-4d prog=%-6s t=%.1f-%.1f 音域 %d-%d 中位 %d 单音性 %.2f 级进 %.1f' % (
        ch, len(ns), list(chans[ch]['progs'].keys()), t0, t1,
        min(n['m'] for n in ns), max(n['m'] for n in ns), st['med'], 1-st['poly'], st['leap']))
print('8 秒窗口密度:')
for w0 in range(0, int(dur)+1, 8):
    row = ['%d:%d' % (ch, sum(1 for n in chans[ch]['notes'] if w0 <= n['t'] < w0+8)) for ch in sorted(chans) if sum(1 for n in chans[ch]['notes'] if w0 <= n['t'] < w0+8)]
    print('  %3ds ' % w0 + ' '.join(row))
