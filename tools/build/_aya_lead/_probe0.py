
import sys, os
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
m = M2.parse_midi(os.path.join(BASE, '11. Wind God Girl (Kanade_KND34).mid'))
ch, segs, div = M2.extract_channels(m)
k = list(ch)[0]
v = ch[k]
print('keys', v.keys() if isinstance(v, dict) else 'n/a')
for kk, vv in v.items():
    print(' ', kk, type(vv), (len(vv) if hasattr(vv, '__len__') else vv))
print('segs sample', segs[:3], 'div', div)
