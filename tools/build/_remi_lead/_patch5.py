import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()

# 1) 钟声只敲主音八度（原来带五度 F，会和旋律的 F# 打小二度）
a = """    for (nb, v) in ((1, 74), (13, 78), (29, 80), (53, 82), (69, 86), (86, 96), (88, 58)):
        W_(bell, nb, 0, 58, 4.0, v)
        W_(bell, nb, 0, 65, 4.0, int(v * 0.72))
        W_(bell, nb, 0, 46, 6.0, int(v * 0.6))"""
b = """    for (nb, v) in ((1, 74), (13, 78), (29, 80), (53, 82), (69, 86), (86, 96), (88, 58)):
        W_(bell, nb, 0, 58, 3.6, v)
        W_(bell, nb, 0, 70, 3.2, int(v * 0.66))
        W_(bell, nb, 0, 46, 5.0, int(v * 0.5))"""
assert s.count(a) == 1
s = s.replace(a, b)

# 2) 圣咏段（新 53-68）加 16' 管风琴踏板 Eb1/Bb1，把「大教堂」的地板垫起来
anchor = "    # 尾声 86-89：全奏 Bb 小调终止\n"
assert s.count(anchor) == 1
add = """    # 圣咏段（新 53-68 = 原曲 b49-64）16' 管风琴踏板：Eb1 / Bb1 循环
    for nb, root in ((53, 27), (57, 34), (61, 27), (65, 34)):
        for k in range(4):
            W_(ped, nb + k, 0, root, 4 * BL(nb + k) * 0.97, 66 - k * 2)
            if k % 2 == 1:
                W_(ped, nb + k, 2, root + 7, 2 * BL(nb + k) * 0.95, 52)

"""
s = s.replace(anchor, add + anchor)
io.open(P, 'w', encoding='utf-8').write(s)
print('ok')
