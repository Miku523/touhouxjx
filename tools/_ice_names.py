import glob, UnityPy
paths = glob.glob(r'E:/SteamLibrary/steamapps/common/*Fairy*/Touhou*_Data/data.unity3d')
env = UnityPy.load(paths[0])
names = []
for o in env.objects:
    if o.type.name != 'Texture2D':
        continue
    try:
        d = o.read()
        names.append((d.m_Width, d.m_Height, d.m_Name))
    except Exception:
        pass
names.sort(reverse=True)
with open('_ice_tex_names.txt', 'w', encoding='utf-8') as f:
    for w, h, n in names:
        f.write('%dx%d\t%s\n' % (w, h, n))
print(len(names))
