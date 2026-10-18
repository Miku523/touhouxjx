import glob, os, UnityPy
from PIL import Image

paths = glob.glob(r'E:/SteamLibrary/steamapps/common/*Fairy*/Touhou*_Data/data.unity3d')
env = UnityPy.load(paths[0])
out = '_ice_tex'
os.makedirs(out, exist_ok=True)
saved = []
for o in env.objects:
    if o.type.name != 'Texture2D':
        continue
    try:
        d = o.read()
        w = getattr(d, 'm_Width', 0)
        h = getattr(d, 'm_Height', 0)
        if w * h < 200 * 200:
            continue
        img = d.image
        if img is None:
            continue
        name = (d.m_Name or 'tex')
        for ch in '/\\:*?"<>|':
            name = name.replace(ch, '_')
        fn = os.path.join(out, '%dx%d_%s.png' % (w, h, name[:40]))
        img.save(fn)
        saved.append((w * h, fn))
    except Exception:
        pass

saved.sort(reverse=True)
print('saved', len(saved))
for a, f in saved[:15]:
    print(os.path.basename(f))
