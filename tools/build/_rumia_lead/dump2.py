import sys, collections
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\3. Apparitions Stalk the Night (ZUN).mid'
mid = M.parse_midi(p)
ch, segs, div = M.extract_channels(mid)
cnt = collections.Counter(n['m'] for n in ch[9]['notes'])
print('drum pitches', cnt.most_common())
print('first drums', [(round(n['t'],2), n['m']) for n in sorted(ch[9]['notes'], key=lambda x: x['t'])[:16]])
print('last pitched note', max(n['t']+n['d'] for c in ch if c != 9 for n in ch[c]['notes']))
print('theme end', max(n['t']+n['d'] for c in (2,3,4,14) for n in ch[c]['notes']))
