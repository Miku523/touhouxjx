
import os, glob
base=r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
dirs=sorted(os.listdir(base))
print('GAMES:', len(dirs))
for d in dirs: print(' ', d)
