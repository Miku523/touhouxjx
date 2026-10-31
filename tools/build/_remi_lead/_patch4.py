import io, os
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_compose.py')
s = io.open(P, encoding='utf-8').read()
a = "    dr(87, 0, 4, 120); dr(87, 0, 0, 118); dr(87, 0, 5, 104); dr(87, 2.5, 5, 92)\n    dr(88, 0, 0, 92); dr(88, 2, 5, 80)\n    dr(90, 0, 0, 76)"
b = "    dr(86, 0, 4, 120); dr(86, 0, 0, 118); dr(86, 0, 5, 104); dr(86, 2.5, 5, 92)\n    dr(87, 0, 0, 92); dr(87, 2, 5, 80)\n    dr(89, 0, 0, 76)"
assert s.count(a) == 1
io.open(P, 'w', encoding='utf-8').write(s.replace(a, b))
print('ok')
