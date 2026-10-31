import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    assert s.count(a) == 1, (s.count(a), a[:60])
    s = s.replace(a, b)

rep("""    _f0, _f1 = T(69, 0), T(86, 0)
    for n in list(lead.notes):
        if _f0 <= n[0] < _f1 and n[1] + 12 <= 100:
            strhi.notes.append([n[0], n[1] + 12, n[2], int(n[3] * 0.6)])""",
    """    _f0, _f1 = T(69, 0), T(86, 0)
    for n in list(lead.notes):
        if _f0 <= n[0] < _f1 and n[1] + 12 <= 100:
            strhi.notes.append([n[0], n[1] + 12, n[2], int(n[3] * 0.6)])
    # 终曲主旋律再抬 0.9dB：让「王座」那一段真正由小号领奏
    for n in lead.notes:
        if _f0 <= n[0] < _f1:
            n[3] = min(127, int(round(n[3] * 1.10)))""")

rep("""        dr(nb, 0, 0, 98); dr(nb, 2, 0, 96); dr(nb, 3.5, 0, 88)
        dr(nb, 1, 1, 94); dr(nb, 3, 1, 96)
        for i in range(8):
            dr(nb, i * 0.5, 7, 48)""",
    """        dr(nb, 0, 0, 90); dr(nb, 2, 0, 88); dr(nb, 3.5, 0, 82)
        dr(nb, 1, 1, 88); dr(nb, 3, 1, 90)
        for i in range(8):
            dr(nb, i * 0.5, 7, 44)""")
io.open(P, 'w', encoding='utf-8').write(s)
print('patched8')
