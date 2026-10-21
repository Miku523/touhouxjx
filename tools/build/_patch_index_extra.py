# -*- coding: utf-8 -*-
import io
p='src/engine/songs/index.js'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
assert "import { KAGUYA_STAGE6 } from './kaguya_stage6.js';" in s
s=s.replace("import { KAGUYA_STAGE6 } from './kaguya_stage6.js';",
"""import { KAGUYA_STAGE6 } from './kaguya_stage6.js';
import { UN_FUSE } from './un_fuse.js';""")
old="  stage6: KAGUYA_STAGE6.stage6,\n};"
new="""  stage6: KAGUYA_STAGE6.stage6,
  // EX Boss：U.N.オーエンは彼女なのか？ —— 游戏内原曲三条旋律轨逐音保留 × 鼓组重写 + 钟琴琶音叠回
  // （见 tools/un_fuse.py；audio 让引擎直接播离线渲染成品 src/assets/bgm/extra_fuse.wav，
  //  fetch 失败时自动回退到 un_fuse.js 里的合成数据）
  extra: { ...UN_FUSE.extra, audio: 'src/assets/bgm/extra_fuse.wav' },
};"""
assert old in s
s=s.replace(old,new)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('patched index.js')
