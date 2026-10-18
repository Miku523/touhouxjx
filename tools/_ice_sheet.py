import glob, os
from PIL import Image, ImageDraw, ImageFont
files = glob.glob('_ice_tex/*.png')
items = []
for f in files:
    try:
        im = Image.open(f)
        w, h = im.size
        if w >= 1200 and h >= 700:
            items.append((w * h, f, im))
    except Exception:
        pass
items.sort(reverse=True)
items = items[:16]
tw, th = 420, 260
cols = 4
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (10, 10, 14))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 16)
for i, (a, f, im) in enumerate(items):
    im2 = im.convert('RGB')
    im2.thumbnail((tw - 8, th - 26))
    x = (i % cols) * tw + (tw - im2.width) // 2
    y = (i // cols) * th + 4
    sheet.paste(im2, (x, y))
    d.text(((i % cols) * tw + 6, (i // cols) * th + th - 22), '%d %dx%d %s' % (i, im.size[0], im.size[1], os.path.basename(f)[:34]), font=font, fill=(240, 230, 240))
sheet.save('_ice_bgs.jpg', quality=88)
print(len(items), sheet.size)
