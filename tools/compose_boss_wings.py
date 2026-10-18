"""把「黑枝 + 七色尖晶」翅膀素材合成到无翼的芙兰身上（P4 用）。

素材: tools/boss_src/flandre_wings.png + tools/boss_src/flandre_body_nowings.png
输出: _cand/flandre_wing_composite.png（再拷进 src/art/gen/boss/flandre.png）
用法: python tools/compose_boss_wings.py <翅膀宽/身体宽> <翅膀底边位置 0-1>
"""
from PIL import Image
import sys

body = Image.open(r'tools/boss_src/flandre_body_nowings.png').convert('RGBA')
wing = Image.open(r'tools/boss_src/flandre_wings.png').convert('RGBA')

bw, bh = body.size
ww, wh = wing.size
scale = float(sys.argv[1]) if len(sys.argv) > 1 else 1.15   # wing width / body width
target_w = int(bw * scale)
target_h = int(round(target_w * wh / ww))
w2 = wing.resize((target_w, target_h), Image.LANCZOS)

# 翅膀底部（挂环）对齐到身体腰部附近
bottom = int(bh * (float(sys.argv[2]) if len(sys.argv) > 2 else 0.78))
left = (bw - target_w) // 2
top = bottom - target_h

canvas_w = max(bw, target_w + 40)
canvas_h = bh
# 把底部中央的挂环掐掉（会从裙摆下面露出来）
px = w2.load()
cx = target_w // 2
half = int(target_w * 0.085)
y0 = int(target_h * 0.86)
for yy in range(y0, target_h):
    for xx in range(cx - half, cx + half):
        r, g, b, a = px[xx, yy]
        px[xx, yy] = (r, g, b, 0)

canvas = Image.new('RGBA', (canvas_w, canvas_h), (255, 255, 255, 0))
ox = (canvas_w - bw) // 2
canvas.alpha_composite(w2, (ox + left, top))
canvas.alpha_composite(body, (ox, 0))
canvas.save(r'_cand/flandre_wing_composite.png')
print('composite', canvas.size)
