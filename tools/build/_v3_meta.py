# -*- coding: utf-8 -*-
import io, sys

def jsq(s):
    o=[]
    for ch in s:
        if ch=='\\': o.append('\\\\')
        elif ch=='"': o.append('\\"')
        elif ch=='\n': o.append('\\n')
        elif ch=='\r': o.append('\\r')
        elif ch=='\t': o.append('\\t')
        else: o.append(ch)
    return '"'+''.join(o)+'"'

def repl(s, old_key, new_key, new_value):
    k=jsq(old_key); i=s.find(k)
    if i<0:
        print('KEY MISS:', old_key[:24]); sys.exit(1)
    j=i+len(k); m=s.find(':', j)
    vs=m+1
    while s[vs] in ' \t': vs+=1
    if s[vs]!='"':
        print('VAL MISS'); sys.exit(1)
    p=vs+1
    while True:
        if s[p]=='\\': p+=2; continue
        if s[p]=='"': break
        p+=1
    return s[:i]+jsq(new_key)+s[j:m+1]+jsq(new_value)+s[p+1:]

OLD_PRE5='五面道中。鼓、贝斯、管风琴各就各位，高音对句让给铃。主旋律还是那条会唱的线，谁都不许碰。冥界的路上没有风，花一直开着，落下来的没人扫。妖梦说弓她拉满了，剩下的是原曲自己的事。'
OLD_ST5='五面 Boss 曲。这次不重排：从一个音到最后一个音，全照原样，连它自己那点慢吞吞的脾气也留着。开头只有钢琴琶音，主旋律要等很久才肯开口。中间那段大喘气我没补东西，只留一颗心跳在底下。她听得见死者的话，所以不催。\n——西行寺幽幽子：「急什么。反正夜还长。」'
OLD_SUB='西行寺幽幽子 · 道中'

NEW_PRE5={
 'zh':'',
 'en':'Stage 5 midstage theme. Every note of the original is still there — only the blade has been sharpened: the youkai-side answer lines step out of the dark, the drums fall back half a step in the bridge, and the chorus then surges up in a single breath. There is no wind on the road of the netherworld; the flowers keep blooming and no one sweeps up those that fall. Youmu says she has drawn the bow to the full; the rest is the original’s own business.',
 'ja':'5面道中。曲のすべての音はそのまま残っていて、刃を研いだだけ。妖側の応唱が暗がりから現れ、ブリッジではドラムが半歩退き、副歌で一気に押し上げる。冥界の道に風はなく、花は開き続け、落ちたものは誰も掃かない。妖夢は弓を張り切ったと言った。残りは原曲自身の仕事だ。',
 'hant':'五面道中。原曲的每個音都還在，只是刀口磨快了：妖側對句從暗處遞上來，橋段讓鼓先退半步，副歌再一口氣推上去。冥界的路上沒有風，花一直開著，落下來的沒人掃。妖夢說弓她拉滿了，剩下的是原曲自己的事。',
}
NEW_ST5={
 'zh':'五面 Boss 曲。原谱一个音没动，二十段速度也照旧，只是把藏在底下的层全翻上来：竖琴、钟琴、弦乐、人声各归各位，副歌多了一圈八度光环，结尾不再像断电，而是绸缎慢慢落下。\n——西行寺幽幽子：「急什么。反正夜还长。」',
 'en':'Stage 5 boss theme. Not a single note of the original score was moved and all twenty tempo stages stay as they are — only the layers hidden underneath are brought up: harp, celesta, strings and voice each take their place, the chorus gains an octave halo, and the ending no longer cuts out but settles like silk coming slowly down.\n——Saigyouji Yuyuko: "What is the rush. The night is long anyway."',
 'ja':'5面ボス曲。原譜の音符はひとつも動かさず、20のテンポ段階もそのまま。ただ下に隠れていた層をすべて表に出した。ハープ、チェレスタ、ストリングス、声部がそれぞれの座に着き、副歌には八度の光環が加わり、終幕は電源が落ちるのではなく、絹が静かに降りていくように終わる。\n——西行寺幽々子：「何着急るの。夜はまだ長いでしょう。」',
 'hant':'五面 Boss 曲。原譜一個音沒動，二十段速度也照舊，只是把藏在底下的層全翻上來：豎琴、鐘琴、弦樂、人聲各歸各位，副歌多了一圈八度光環，結尾不再像斷電，而是綢緞慢慢落下。\n——西行寺幽幽子：「急什麼。反正夜還長。」',
}
SUB={'en':'Youmu Konpaku · Midstage','ja':'魂魄妖夢・道中','hant':'魂魄妖夢 · 道中'}

for pack,key in (('en','en'),('ja','ja'),('zh-hant','hant')):
    p='src/i18n/packs/'+pack+'.js'
    s=io.open(p,encoding='utf-8').read()
    s=repl(s, OLD_PRE5, NEW_PRE5['zh'], NEW_PRE5[key])
    s=repl(s, OLD_ST5, NEW_ST5['zh'], NEW_ST5[key])
    s=repl(s, OLD_SUB, '魂魄妖梦 · 道中', SUB[key])
    io.open(p,'w',encoding='utf-8',newline='\n').write(s)
    print('pack patched', pack)

# --- musicTracks.js ---
p='src/game/musicTracks.js'
s=io.open(p,encoding='utf-8').read()
i=s.index("key: 'pre5'")
j=s.index("key: 'stage5'")
pre=s[i:j]; st=s[j:]
pre=pre.replace("sub: '西行寺幽幽子 · 道中'","sub: '魂魄妖梦 · 道中'")
pre=pre.replace('time: 105.3','time: 106.8')
pre=pre.replace("'"+OLD_PRE5+"'","'"+NEW_PRE5['zh']+"'")
st=st.replace("time: 141.1","time: 142.4")
old_first=OLD_ST5.split('\n')[0]+'\\n'
new_first=NEW_ST5['zh'].split('\n')[0]+'\\n'
if old_first not in st:
    print('ST5 first-part MISS'); sys.exit(1)
st=st.replace(old_first, new_first, 1)
s=s[:i]+pre+st
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('musicTracks patched')
