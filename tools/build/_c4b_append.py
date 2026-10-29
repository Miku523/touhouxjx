import io,os
here=os.path.dirname(os.path.abspath(__file__))
p=os.path.join(here,'_fld_compose4.py')
s=io.open(p,encoding='utf-8').read()
s+='\n'+io.open(os.path.join(here,'_c4b.py'),encoding='utf-8').read()
io.open(p,'w',encoding='utf-8').write(s)
print('appended', len(s))
