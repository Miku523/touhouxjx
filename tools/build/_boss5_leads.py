# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
midi = M.parse_midi(BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12] + str(m//12-1)
print('bar | ch2 | ch7 | ch11 | ch6 | ch5 | ch3 | ch0')
for b in range(0, 88, 2):
    t0, t1 = b*bar, (b+2)*bar
    def cnt(ch):
        return sum(1 for n in chans[ch]['notes'] if t0 <= n['t'] < t1) if ch in chans else 0
    print('%3d | %3d | %3d | %3d | %3d | %3d | %3d | %3d' % (b, cnt(2), cnt(7), cnt(11), cnt(6), cnt(5), cnt(3), cnt(0)))

print()
print('=== ch2 (lead) bars 40-56 逐音 ===')
for b in range(40, 56):
    t0, t1 = b*bar, (b+1)*bar
    ns = [n for n in chans[2]['notes'] if t0 <= n['t'] < t1]
    print('b%02d %s' % (b, ' '.join('%s(%g)' % (pn(n['m']), round(n['d']/bar*4,2)) for n in ns)))
print()
print('=== ch7 (lead) bars 44-72 首 4 小节每组 ===')
for b in range(44, 72, 4):
    t0, t1 = b*bar, (b+4)*bar
    ns = [n for n in chans[7]['notes'] if t0 <= n['t'] < t1]
    print('b%02d-b%02d %s' % (b, b+3, ' '.join(pn(n['m']) for n in ns[:24])))
