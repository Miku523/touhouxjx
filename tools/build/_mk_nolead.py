import re
src = open('src/engine/songs/tepes_ex.js', encoding='utf-8').read()
i = src.find("gain: 0.21,")
print('idx', i, repr(src[i-30:i+15]))
out = src[:i] + "gain: 0.0," + src[i+len("gain: 0.21,"):]
open('tools/build/_tepes_nolead.js','w',encoding='utf-8').write(out)
