import io
s=io.open('tools/build/_yuyuko_diag.py',encoding='utf-8').read()
s=s.replace('open(os.path.join(HERE, "_yuyuko_kit", "diag.txt")','lines.append("BARS9=%.3f BARS42=%.3f BARS75=%.3f BARS90=%.3f"%(BARS[9],BARS[42],BARS[75],BARS[90] if len(BARS)>90 else BARS[-1]))\nopen(os.path.join(HERE, "_yuyuko_kit", "diag.txt")')
io.open('tools/build/_yuyuko_diag.py','w',encoding='utf-8',newline='\n').write(s)
print('ok')
