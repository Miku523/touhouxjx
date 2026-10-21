# -*- coding: utf-8 -*-
import io
p='src/game/musicTracks.js'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
old_orig = "    orig: '原曲「U.N.オーエンは彼女なのか？」/ 作曲：ZUN / 8bit 改编',"
new_orig = "    orig: '原曲「U.N.オーエンは彼女なのか？」/ 作曲：ZUN / 原曲三轨保留 × 鼓组重写 + 钟琴琶音叠回',"
assert old_orig in s
s=s.replace(old_orig,new_orig)
old_note = """    note:
      '血月下的水晶。芙兰朵露把音量开到最大，说这样才听得见曲子里的心跳。' +
      '曲子确实有心跳——一大一小，大的在底鼓，小的藏在左手八分音符的缝里，你得多听两遍才数得清。' +
      '别问是谁的，也别在血月下问第二遍。',"""
new_note = """    note:
      '血月下的水晶。芙兰朵露把音量开到最大，说这样才听得见曲子里的心跳。' +
      '原曲那三条旋律一个音都没动，动的是脚下——原来那套 8bit 鼓换成了四踩和十六分踩镲，' +
      '被 8bit 版砍掉的钟琴十六分琶音也叠了回来，那才是原曲一路往上跑的劲。' +
      '三十四小节起鼓整个撤掉，只剩心跳：一大一小，大的是底鼓，小的藏在左手八分音符的缝里。' +
      '别问是谁的，也别在血月下问第二遍。',"""
assert old_note in s
s=s.replace(old_note,new_note)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('patched musicTracks.js')
