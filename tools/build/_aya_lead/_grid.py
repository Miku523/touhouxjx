
import sys, os, collections, json
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
for NAME, tag in (('11. Wind God Girl (Kanade_KND34).mid', 'kanade'), ('11. Wind God Girl (rongns_2).mid', 'rongns')):
    m = M2.parse_midi(os.path.join(BASE, NAME))
    ons = [(e[0], e[2], e[3], e[4] if len(e) > 4 else 100) for tr in m['tracks'] for e in tr['events'] if e[1] == 'on' and (len(e) < 5 or e[4] > 0)]
    print('===', tag, 'note-ons', len(ons))
    mods = collections.Counter(t % 480 for t, *_ in ons)
    print(' mod480 top', mods.most_common(6))
    mods2 = collections.Counter(t % 1920 for t, *_ in ons)
    print(' mod1920 top', [(k, v) for k, v in mods2.most_common(6)])
    print(' first tick', min(t for t, *_ in ons), 'last', max(t for t, *_ in ons))
