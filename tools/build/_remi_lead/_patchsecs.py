import io, os, json
P = os.path.join(os.getcwd(), 'tools', 'build', '_remi_lead', '_secs.py')
s = io.open(P, encoding='utf-8').read()
s = s.replace("('Final2',77,86),('outro',87,90)]", "('Final2',77,85),('outro',86,89)]")
io.open(P,'w',encoding='utf-8').write(s)
print('ok')
