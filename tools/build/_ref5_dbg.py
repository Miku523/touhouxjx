# -*- coding: utf-8 -*-
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
d = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref5_raw.json', encoding='utf-8'))
for nm, r in d.items():
    print('=====', nm, r['dur'], 'BPM', r['bpm'], 'bar', r['bar_sec'], 'off', r['beat_offset'])
    print('novelty peaks', r['novelty_peaks'][:10])
    print('nov range %.3f..%.3f' % (min(r['novelty']), max(r['novelty'])))
    print('key', r['key'][:3])
    print('bars', len(r['bars']))
    for b in r['bars'][:8]:
        print('  bar%02d %6.2f rms%.3f low%.2f mid%.2f midh%.2f high%.2f cen%5d ch[%s] b[%s] k%d s%d h%d' % (
            b['i'], b['t0'], b['rms'], b['low'], b['mid'], b['midh'], b['high'], b['cen'],
            b['chord'], b['bass'].index(max(b['bass'])), b['kick'], b['snare'], b['hat']))
