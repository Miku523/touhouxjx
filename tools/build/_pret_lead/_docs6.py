# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
# --- optimize_audio_mp3.py ---
p = os.path.join(ROOT, 'tools/optimize_audio_mp3.py')
s = io.open(p, encoding='utf-8').read()
old = '"aya_stage4", "kaguya_stage6")'
assert s.count(old) == 1
s = s.replace(old, '"aya_stage4", "kaguya_stage6", "pre1", "pre2", "pre3", "pre4", "pre6")')
marker = '"aya_stage4": ROOT / "tools" / "build" / "_aya_kit" / "aya_stage4_stereo.wav",'
assert s.count(marker) == 1
add = '\n'.join(['           "%s": ROOT / "tools" / "build" / "_pret_kit" / "%s_stereo.wav",' % (k, k) for k in K])
s = s.replace(marker, marker + '\n' + add)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('mp3 tool ok')

# --- verify_audio_mp3.html ---
h = os.path.join(ROOT, 'tools/verify_audio_mp3.html')
t = io.open(h, encoding='utf-8').read()
o2 = "'aya_stage4', 'kaguya_stage6'];"
assert t.count(o2) == 1
t = t.replace(o2, "'aya_stage4', 'kaguya_stage6', 'pre1', 'pre2', 'pre3', 'pre4', 'pre6'];")
m2 = "cirno_stage3: '/tools/build/_cirno_kit/cirno_stage3_stereo.wav',"
assert t.count(m2) == 1
add2 = '\n'.join(["    %s: '/tools/build/_pret_kit/%s_stereo.wav'," % (k, k) for k in K])
t = t.replace(m2, m2 + '\n' + add2)
io.open(h, 'w', encoding='utf-8', newline='\n').write(t)
print('verify page ok')
