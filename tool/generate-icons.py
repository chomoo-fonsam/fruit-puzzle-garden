# generate-icons.py — 生成分享缩略图与站点图标（PNG）
#
# 为什么需要这个脚本：
#   HTML 里内联的 data:URI 图标，微信 / QQ / 微博等平台**不会**当作分享缩略图。
#   它们要求一个真实可访问的图片文件（HTTPS + PNG）。本脚本用 Pillow 画出与
#   游戏同一套视觉的图标，输出到 icons/ 目录。
#
# 用法（在本项目根目录打开命令行）：
#   pip install pillow
#   python tool\generate-icons.py
#
# 生成后：
#   icons/icon-512.png      512×512   PWA / 分享缩略图（og:image）
#   icons/icon-192.png      192×192   PWA 主屏图标
#   icons/apple-touch-icon.png 180×180  iOS"添加到主屏幕"图标
#   icons/share-1200x630.png   1200×630  微信/QQ/微博等链接卡片的推荐尺寸

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')

# 与游戏一致的一点点配色
C_BG_1 = (255, 168, 76)
C_BG_2 = (242, 112, 74)
C_APPLE_1 = (255, 107, 107)
C_APPLE_2 = (214, 40, 57)
C_ORANGE_1 = (255, 180, 87)
C_ORANGE_2 = (239, 138, 43)
C_GRAPE_1 = (185, 138, 232)
C_GRAPE_2 = (123, 63, 191)
C_STEM = (122, 82, 48)
C_LEAF = (95, 174, 68)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def diagonal_gradient(size, c1, c2):
    """生成对角渐变底图（可缩放到任意尺寸）"""
    img = Image.new('RGB', (size, size), c1)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            px[x, y] = lerp(c1, c2, t)
    return img


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_scene(size):
    """在 size×size 画布上画出"果园"图标：苹果 + 橙子 + 葡萄"""
    base = diagonal_gradient(size, C_BG_1, C_BG_2).convert('RGBA')
    d = ImageDraw.Draw(base, 'RGBA')
    s = size / 512.0

    def sc(v):
        return v * s

    # ── 苹果 ──
    apple = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ad = ImageDraw.Draw(apple, 'RGBA')
    ad.ellipse([sc(150), sc(186), sc(256), sc(372)], fill=C_APPLE_1)   # 左半
    ad.ellipse([sc(256), sc(186), sc(362), sc(372)], fill=C_APPLE_2)   # 右半
    ad.ellipse([sc(150), sc(186), sc(362), sc(372)], outline=(0, 0, 0, 26), width=max(1, int(sc(5))))
    # 果柄
    ad.line([sc(250), sc(208), sc(244), sc(128)], fill=C_STEM, width=max(2, int(sc(15))))
    # 叶子
    ad.ellipse([sc(262), sc(120), sc(358), sc(178)], fill=C_LEAF)
    # 高光
    ad.ellipse([sc(182), sc(236), sc(230), sc(264)], fill=(255, 255, 255, 120))
    base.alpha_composite(apple)

    # ── 橙子（左下） ──
    orange = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    od = ImageDraw.Draw(orange, 'RGBA')
    od.ellipse([sc(68), sc(302), sc(212), sc(446)], fill=C_ORANGE_2)
    od.ellipse([sc(76), sc(310), sc(204), sc(438)], fill=C_ORANGE_1)
    for i in range(6):
        a = i * math.pi / 3.0
        od.line(
            [sc(140), sc(374), sc(140) + math.cos(a) * sc(64), sc(374) + math.sin(a) * sc(64)],
            fill=(255, 255, 255, 110), width=max(1, int(sc(6)))
        )
    od.ellipse([sc(96), sc(328), sc(132), sc(350)], fill=(255, 255, 255, 130))
    base.alpha_composite(orange)

    # ── 葡萄（右下） ──
    grape = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grape, 'RGBA')
    gd.line([sc(372), sc(300), sc(396), sc(246)], fill=C_STEM, width=max(2, int(sc(12))))
    berries = [(372, 330, C_GRAPE_1), (330, 366, C_GRAPE_2), (414, 366, C_GRAPE_1),
               (372, 402, C_GRAPE_2), (330, 438, C_GRAPE_2), (414, 438, C_GRAPE_1)]
    for (cx, cy, col) in berries:
        gd.ellipse([sc(cx - 36), sc(cy - 36), sc(cx + 36), sc(cy + 36)], fill=col)
    gd.ellipse([sc(348), sc(306), sc(370), sc(322)], fill=(255, 255, 255, 120))
    base.alpha_composite(grape)

    # ── 圆角裁剪（保留透明圆角） ──
    base.putalpha(rounded_mask(size, int(size * 0.22)))
    return base


def draw_share_wide(w, h):
    """1200×630 的链接卡片图：图标居中 + 渐变底"""
    base = diagonal_gradient(w, C_BG_1, C_BG_2).convert('RGBA')
    icon = draw_scene(int(h * 0.62))
    x = (w - icon.width) // 2
    y = (h - icon.height) // 2
    base.alpha_composite(icon, (x, y))
    return base


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-512.png', 512),
        ('icon-192.png', 192),
        ('apple-touch-icon.png', 180),
    ]
    for name, size in jobs:
        img = draw_scene(size)
        path = os.path.join(OUT, name)
        img.save(path, 'PNG', optimize=True)
        print('已生成', os.path.relpath(path, ROOT), '%dx%d' % (size, size))

    wide = draw_share_wide(1200, 630)
    path = os.path.join(OUT, 'share-1200x630.png')
    wide.save(path, 'PNG', optimize=True)
    print('已生成', os.path.relpath(path, ROOT), '1200x630')
    print('\n完成。把这些文件一起提交推送即可生效。')


if __name__ == '__main__':
    main()
