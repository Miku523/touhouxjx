import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()

def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:60])
    s = s.replace(a, b)

# 1) 主旋律再抬 1dB；管风琴 / 高音弦 / 钟抬起来
rep("lead = track('brass', 'square', 0.170)", "lead = track('brass', 'square', 0.190)")
rep("organ = track('pad', 'sine', 0.062)", "organ = track('pad', 'sine', 0.082)")
rep("strhi = track('strings', 'sawtooth', 0.062)\n    strhi.notes += midi_layer(dict(ch=12, poly=2, wins=W((49, 92, 0.8))))",
    """strhi = track('strings', 'sawtooth', 0.075)
    strhi.notes += midi_layer(dict(ch=12, poly=2, wins=W((49, 92, 0.8))))
    # 终曲（原曲 b65-81 = 新 69-85）高音弦乐八度加倍：让 ff 段的天顶亮起来
    _f0, _f1 = T(69, 0), T(86, 0)
    for n in list(lead.notes):
        if _f0 <= n[0] < _f1 and n[1] + 12 <= 100:
            strhi.notes.append([n[0], n[1] + 12, n[2], int(n[3] * 0.6)])""")
rep("bell = track('bell', 'sine', 0.085)", "bell = track('bell', 'sine', 0.105)")

# 2) 钟声加一个高八度泛音，段首能听见
rep("""        W_(bell, nb, 0, 58, 3.6, v)
        W_(bell, nb, 0, 70, 3.2, int(v * 0.66))
        W_(bell, nb, 0, 46, 5.0, int(v * 0.5))""",
    """        W_(bell, nb, 0, 58, 3.6, v)
        W_(bell, nb, 0, 70, 3.2, int(v * 0.66))
        W_(bell, nb, 0, 82, 2.6, int(v * 0.42))
        W_(bell, nb, 0, 46, 5.0, int(v * 0.5))""")

# 3) 终曲鼓组稍收，把皇冠让给旋律与高音弦
rep("""    for nb in range(69, 86):
        dr(nb, 0, 0, 112); dr(nb, 2, 0, 108); dr(nb, 3.5, 0, 94)
        dr(nb, 1, 1, 104); dr(nb, 3, 1, 106)
        for i in range(8):
            dr(nb, i * 0.5, 7, 52)""",
    """    for nb in range(69, 86):
        dr(nb, 0, 0, 104); dr(nb, 2, 0, 100); dr(nb, 3.5, 0, 90)
        dr(nb, 1, 1, 98); dr(nb, 3, 1, 100)
        for i in range(8):
            dr(nb, i * 0.5, 7, 48)""")
io.open(P, 'w', encoding='utf-8').write(s)
print('patched')
