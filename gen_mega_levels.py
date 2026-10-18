#!/usr/bin/env python3
"""为 stage5 / stage6 生成类银河平台关地图（34 行高，相机可垂直滚动）。

设计规则（对应玩家手感：跳高 4 格、跳远约 6.8 格）：
- 地面基线在 row 27..33
- 上层平台最多比下层高 3 格，水平间距不超过 5 格
- 每隔 4~6 个房间插一段垂直井，让上下两层真正连通
- 金币串铺在平台上，方便玩家看出落脚点
"""
import random
import sys

H = 34          # 行数
W = 120         # 列数
FLOOR_TOP = 27  # 地面顶面所在行


def blank():
    return [['.'] * W for _ in range(H)]


def fill(g, x0, y0, x1, y1, ch='#'):
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            g[y][x] = ch


def put(g, x, y, ch):
    if 0 <= x < W and 0 <= y < H:
        g[y][x] = ch


def build(rng, theme):
    g = blank()

    # --- 地面：起伏的顶面 ---
    surface = []
    row = FLOOR_TOP
    for x in range(W):
        step = rng.choice([-1, 0, 0, 0, 1])
        if x < 6 or x > W - 8:
            step = 0
        row = max(FLOOR_TOP - 3, min(FLOOR_TOP + 1, row + step))
        surface.append(row)
    # 几处深坑（跳跃挑战）
    pits = []
    for _ in range(5):
        px = rng.randint(14, W - 18)
        pw = rng.randint(3, 5)
        pits.append((px, pw))
    for (px, pw) in pits:
        for x in range(px, min(W, px + pw)):
            surface[x] = FLOOR_TOP + 2

    for x in range(W):
        top = surface[x]
        ch = 'G' if (x % 7 != 3) else '#'
        put(g, x, top, ch)
        fill(g, x, top + 1, x, H - 1, '#' if ch == '#' else '#')
    # 坑洞真正挖空
    for (px, pw) in pits:
        for x in range(px, min(W, px + pw)):
            for y in range(FLOOR_TOP + 2, H):
                g[y][x] = '.'

    # --- 上层平台 ---
    # 分三层：低层 y≈21、中层 y≈15、高层 y≈9
    layers = [21, 15, 9]
    for li, base_y in enumerate(layers):
        x = rng.randint(6, 12)
        while x < W - 6:
            w = rng.randint(3, 7)
            y = base_y + rng.choice([-1, 0, 0, 1])
            ch = '=' if rng.random() < 0.35 else 'B'
            top = 'G' if ch == 'B' else ch
            fill(g, x, y, min(W - 1, x + w - 1), y, top)
            if ch == 'B':
                # 砖块平台下面补一层，做出厚度
                for xx in range(x, min(W, x + w)):
                    put(g, xx, y + 1, 'B')
            # 金币串
            if rng.random() < 0.7:
                for k in range(w):
                    put(g, x + k, y - 1, 'o')
            # 敌人
            if rng.random() < 0.45 and li < 2:
                put(g, x + w // 2, y - 1, rng.choice(['s', 'f']))
            # 下一段的水平距离
            gap = rng.randint(3, 5)
            x = x + w + gap

    # --- 垂直井：打穿层间，用藤蔓/砖块做落脚 ---
    wells = [rng.randint(18, 30), rng.randint(52, 66), rng.randint(88, 100)]
    for wx in wells:
        for y in range(6, FLOOR_TOP):
            for dx in range(-1, 2):
                xx = wx + dx
                if 0 <= xx < W and g[y][xx] in ('#', 'B', 'G'):
                    g[y][xx] = '.'
        # 井壁上的踏板
        for y in range(9, FLOOR_TOP - 2, 4):
            put(g, wx - 2, y, '=')
            put(g, wx + 2, y + 2, '=')

    # --- 检查点 & P 点道具 ---
    for cx in (W // 3, (W * 2) // 3):
        put(g, cx, surface[cx] - 1, 'C')
    for _ in range(6):
        px = rng.randint(8, W - 10)
        put(g, px, surface[px] - 1, 'p')

    # --- 出生点与终点 ---
    put(g, 3, surface[3] - 1, 'P')
    put(g, W - 4, surface[W - 4] - 1, 'F')

    return g


def to_rows(g):
    return [''.join(r) for r in g]


def check_widths(rows):
    return all(len(r) == W for r in rows)


def main():
    seed5 = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    seed6 = int(sys.argv[2]) if len(sys.argv) > 2 else 6

    for name, seed in (('stage5', seed5), ('stage6', seed6)):
        rng = random.Random(seed)
        g = build(rng, name)
        rows = to_rows(g)
        assert check_widths(rows), 'width mismatch'
        assert len(rows) == H
        path = '/tmp/%s.txt' % name
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(rows))
        # 简单统计
        counts = {}
        for r in rows:
            for c in r:
                counts[c] = counts.get(c, 0) + 1
        print(name, 'ok  rows=%d cols=%d  entities=' % (len(rows), W),
              {k: v for k, v in counts.items() if k in 'PFCospf'})
        print('  path:', path)


if __name__ == '__main__':
    main()
