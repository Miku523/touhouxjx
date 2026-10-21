# -*- coding: utf-8 -*-
"""《U.N.オーエンは彼女なのか？》原曲 MIDI 结构分析（ZUN 版）。
产出 tools/build/_un_orig.json：bpm / 每通道统计 / 16 分格谱面。
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from midi2js import parse_midi, extract_channels  # noqa: E402

MID = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\15. U.N. Owen was her (ZUN).mid'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_un_orig.json')

midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
dur = max((n['t'] + n['d'] for c in chans.values() for n in c['notes']), default=0)
print('division=%d  tempo 段=%d  首段 %.3f BPM' % (div, len(segs), 60e6 / segs[0][2]))
BPM = 60e6 / segs[0][2]
BAR = 240.0 / BPM
print('起始 %.3f BPM  小节 %.4fs  时长 %.2fs ≈ %.2f 小节' % (BPM, BAR, dur, dur / BAR))
for ch in sorted(chans):
    c = chans[ch]
    ms = [n['m'] for n in c['notes']]
    if not ms:
        continue
    prog = max(c['progs'], key=c['progs'].get) if c['progs'] else -1
    print('  ch%-2d prog%-3s 音符%4d 中位%3d 范围%2d-%2d 密度%.1f/s' % (
        ch, prog, len(ms), sorted(ms)[len(ms) // 2], min(ms), max(ms), len(ms) / max(1e-9, dur)))
json.dump({'file': MID, 'division': div, 'bpm': BPM, 'bar': BAR, 'duration': dur,
           'tempo': [[s, u] for (tk, s, u) in segs],
           'channels': {str(ch): {'progs': {str(k): v for k, v in c['progs'].items()},
                                  'notes': [[n['t'], n['m'], n['d'], n['v']] for n in c['notes']]}
                        for ch, c in chans.items() if c['notes']}},
          open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('写入', OUT)
