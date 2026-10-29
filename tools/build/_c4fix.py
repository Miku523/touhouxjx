
import io
p='tools/build/_fld_compose4.py'
s=io.open(p,encoding='utf-8').read()
s=s.replace('import os\nimport sys\n','import json\nimport os\nimport sys\n',1)
io.open(p,'w',encoding='utf-8').write(s)
print('patched')
