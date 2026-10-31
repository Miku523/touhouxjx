import re, json, os
src = open('src/engine/songs/remilia_septette.js', encoding='utf-8').read()
ns = {}
exec(compile(re.sub(r'^export const ', 'const ', src, flags=re.M).replace('export const REMILIA_EX', 'REMILIA_EX'), '<s>', 'exec'), ns)
song = ns['REMILIA_EX']['ex_mid']
DUR = 20.0
tracks = []
for t in song['tracks']:
    notes = [n for n in t['notes'] if n[0] < DUR]
    if notes:
        tracks.append(dict(t, notes=notes))
drums = [d for d in song['drums'] if d[0] < DUR]
out = {'title': 'probe', 'duration': DUR, 'bpm': song['bpm'], 'tracks': tracks, 'drums': drums}
lines = ['const P = ' + json.dumps(out, ensure_ascii=False) + ';', 'export const PROBE = { ex_mid: P };']
open('tools/build/_remi_lead/_stereo_probe.js','w',encoding='utf-8').write('\n'.join(lines)+'\n')
print('tracks', len(tracks), 'notes', sum(len(t['notes']) for t in tracks), 'drums', len(drums))
