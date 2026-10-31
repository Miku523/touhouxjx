import sys, collections
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\3. Apparitions Stalk the Night (ZUN).mid'
mid = M.parse_midi(p)
ch, segs, div = M.extract_channels(mid)
nm = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return nm[m % 12] + str(m // 12 - 1)
mel = sorted([n for n in ch[2]['notes'] if n['t'] >= 28.0], key=lambda n: (n['t'], n['m']))
print('melody ch2 count', len(mel))
for n in mel[:40]:
    print('  t=%.2f %s d=%.2f v=%d' % (n['t'], pn(n['m']), n['d'], n['v']))
print('counter ch3:')
for n in sorted([n for n in ch[3]['notes'] if n['t'] >= 28.0], key=lambda x: (x['t'], x['m']))[:20]:
    print('  t=%.2f %s d=%.2f' % (n['t'], pn(n['m']), n['d']))
print('guitar ch10 chords:')
for n in sorted([n for n in ch[10]['notes'] if n['t'] >= 30.0], key=lambda x: (x['t'], x['m']))[:24]:
    print('  t=%.2f %s d=%.2f' % (n['t'], pn(n['m']), n['d']))
print('organ ch8 first 40:')
for n in sorted(ch[8]['notes'], key=lambda x: (x['t'], x['m']))[:40]:
    print('  t=%.2f %s d=%.2f' % (n['t'], pn(n['m']), n['d']))
print('ch7 rock organ:')
for n in sorted(ch[7]['notes'], key=lambda x: (x['t'], x['m']))[:20]:
    print('  t=%.2f %s d=%.2f' % (n['t'], pn(n['m']), n['d']))
print('strings ch5:')
for n in sorted(ch[5]['notes'], key=lambda x: (x['t'], x['m']))[:20]:
    print('  t=%.2f %s d=%.2f' % (n['t'], pn(n['m']), n['d']))
