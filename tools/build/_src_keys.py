# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.expanduser('~'), 'Downloads', 'HKS', 'tools'))
import midi2js as M
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
files = {
 'TH06 stage3 (ch2)': os.path.join(base, '6 - The Embodiment of Scarlet Devil', '5. Tomboyish Girl in Love (ZUN).mid'),
 'TH09 (all)': os.path.join(base, '9 - Phantasmagoria of Flower View', '7. Adventure of the Lovestruck Tomboy (ZUN).mid'),
}
for label, path in files.items():
    data = M.parse_midi(path)
    print('==', label, 'exists', os.path.exists(path))
    for ch, notes in sorted(data.items()):
        if ch == 9 or not notes: continue
        c = [0.0]*12
        for n in notes:
            t, m, d, v = (n if not isinstance(n, dict) else (n['t'], n['m'], n['d'], n['v']))
            if v > 0: c[m % 12] += d
        tot = sum(c) or 1
        top = sorted(range(12), key=lambda i: -c[i])[:4]
        print('  ch%-2d n=%-4d %s | 前四 %s' % (ch, len(notes), ' '.join('%2d' % round(x/tot*100) for x in c),
              ', '.join('%s%d%%' % (names[i], round(c[i]/tot*100)) for i in top)))
