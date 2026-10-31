import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:60])
    s = s.replace(a, b)

# 1) 终曲每小节补一层管风琴持续音（取该小节最低的贝斯音高八度），把祭祀的体量补上
rep("""    # 尾声 86-89：全奏 Bb 小调终止""",
    """    # 终曲（新 69-85）每小节管风琴持续音：取该小节最低贝斯音高八度，撑住 ff 段的体量
    for nb in range(69, 86):
        _b0, _b1 = T(nb, 0), T(nb + 1, 0) if nb < 89 else DUR
        _lo = [n[1] for n in bass.notes if _b0 - 0.01 <= n[0] < _b1]
        if not _lo:
            continue
        _p = min(_lo) + 12
        _v = 52 if nb in (69, 73, 77, 81, 85) else 44
        W_(pad, nb, 0, _p, (_b1 - _b0) * 0.99, _v)
        if nb in (69, 73, 77, 81, 85):
            W_(ped, nb, 0, _p - 12, (_b1 - _b0) * 0.99, 56)

    # 尾声 86-89：全奏 Bb 小调终止""")

# 2) 终曲鼓组再让 0.5dB，皇冠留给旋律
rep("""        dr(nb, 0, 0, 104); dr(nb, 2, 0, 100); dr(nb, 3.5, 0, 90)
        dr(nb, 1, 1, 98); dr(nb, 3, 1, 100)""",
    """        dr(nb, 0, 0, 98); dr(nb, 2, 0, 96); dr(nb, 3.5, 0, 88)
        dr(nb, 1, 1, 94); dr(nb, 3, 1, 96)""")
io.open(P, 'w', encoding='utf-8').write(s)
print('patched7')
