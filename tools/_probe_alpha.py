import sys
from PIL import Image
for p in ["src/art/gen/boss/sakuya.png","src/art/gen/sakuya.png","src/art/gen/reimu_title.png","_sakuya_design/final/02_stand_blue.jpg"]:
    try:
        im = Image.open(p)
        info = [im.mode, im.size]
        if im.mode in ("RGBA","LA"):
            a = im.split()[-1]
            info.append(("alpha_min", a.getextrema()))
        print(p, info)
    except Exception as e:
        print(p, "ERR", e)
