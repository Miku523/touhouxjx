# -*- coding: utf-8 -*-
import io
p='src/engine/audio.js'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
old=" * 2. 全部音效与 BGM 都用 WebAudio 振荡器 + 增益包络实时合成，无任何外部音频文件。"
new=(" * 2. 音效与常规 BGM 都用 WebAudio 振荡器 + 增益包络实时合成，不依赖音频文件；\n"
     " *    例外：曲目数据里带 audio 字段时（如 EX 曲），改为 fetch + decodeAudioData 播放\n"
     " *    离线渲染好的音频文件并无缝循环，加载失败时自动回退到合成数据。")
assert old in s
s=s.replace(old,new)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('ok')
