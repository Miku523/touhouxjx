
import io
p='tools/build/_fld_lead/_qc5.py'
s=io.open(p,encoding='utf-8').read()
s=s.replace("HERE = os.path.dirname(os.path.abspath(__file__))\nsys.path.insert(0, HERE)","HERE = os.path.dirname(os.path.abspath(__file__))\nsys.path.insert(0, HERE)\nsys.path.insert(0, os.path.dirname(HERE))",1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
