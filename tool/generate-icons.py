# generate-icons.py — 生成分享缩略图与站点图标（PNG）
#
# 为什么要生成：
#   HTML 里内联的 data:URI 图标，微信 / QQ / 微博等平台**不会**当作分享缩略图；
#   它们要求一个真实可访问的图片文件（HTTPS + PNG）。
#
# 视觉：
#   棋格风 App 图标 —— 奶油底 + 2×2 圆角格子（苹果 / 橙子 / 葡萄 / 草莓），
#   与游戏内的手绘水果同一套配色；小到 48px 也能认出来。
#
# 实现要点：
#   PIL 的 ImageDraw **没有抗锯齿**，所以先按 SS 倍（默认 4 倍）尺寸绘制，
#   再用 LANCZOS 缩回目标尺寸——这是用 PIL 画平滑图标的标准做法。
#
# 用法（在本项目根目录打开命令行）：
#   pip install pillow
#   python tool\generate-icons.py
#
# 想更精致可以改用矢量图：
#   pip install cairosvg
#   python -c "import cairosvg;cairosvg.svg2png(url='icon.svg',write_to='icons/icon-512.png',output_width=512)"

import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')

SS = 4  # 超采样倍数

# 系统彩色 Emoji 字体候选（有的话图标会好看得多）
EMOJI_FONTS = [
    r'C:\Windows\Fonts\seguiemj.ttf',            # Windows 10/11
    '/System/Library/Fonts/Apple Color Emoji.ttc',  # macOS
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',  # Linux
    '/usr/share/fonts/noto/NotoColorEmoji.ttf'
]
FRUIT_EMOJI = ['🍎', '🍊', '🍇', '🍓']


def load_emoji_font(px):
    """尝试加载彩色 Emoji 字体；返回 (font, path)，加载不到则 (None, None)"""
    for path in EMOJI_FONTS:
        if not os.path.exists(path):
            continue
        try:
            return ImageFont.truetype(path, px), path
        except Exception:
            continue
    return None, None


def draw_emoji(img, ch, cx, cy, half):
    """把 Emoji 居中画在 (cx,cy) 附近，大小约 2*half；成功返回 True"""
    font, path = load_emoji_font(max(16, int(half * 1.16)))
    if font is None:
        return False

    d = ImageDraw.Draw(img, 'RGBA')

    def paint(f):
        l, t, r, b = f.getbbox(ch)
        if (r - l) <= 0 or (b - t) <= 0:
            return False
        d.text((cx - l - (r - l) / 2.0, cy - t - (b - t) / 2.0), ch,
               font=f, embedded_color=True)
        return True

    try:
        if paint(font):
            return True
    except Exception:
        pass

    # Apple Color Emoji 这类位图字体只接受固定字号，换 109 再试一次
    if path:
        try:
            if paint(ImageFont.truetype(path, 109)):
                return True
        except Exception:
            pass
    return False


# ── 配色（与游戏内一致） ──
C_BG = (255, 246, 230)          # 奶油底
C_TILE = (255, 255, 255)        # 格子底
C_TILE_EDGE = (238, 224, 202)   # 格子描边
C_APPLE = (230, 57, 70)
C_ORANGE = (239, 138, 43)
C_ORANGE_LIGHT = (252, 186, 105)
C_GRAPE = (155, 106, 214)
C_GRAPE_DARK = (123, 63, 191)
C_STRAWBERRY = (232, 50, 79)
C_STEM = (122, 82, 48)
C_LEAF = (79, 156, 58)
C_WHITE = (255, 255, 255)


def rounded(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def ellipse(d, cx, cy, rx, ry, color):
    """以 (cx,cy) 为中心、半径 rx/ry 画实心椭圆"""
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)


def draw_apple(d, cx, cy, r):
    """苹果：三段圆弧拼果身 + 果柄 + 叶 + 高光"""
    ellipse(d, cx - r * 0.42, cy + r * 0.06, r * 0.6, r * 0.68, C_APPLE)
    ellipse(d, cx + r * 0.42, cy + r * 0.06, r * 0.6, r * 0.68, C_APPLE)
    ellipse(d, cx, cy + r * 0.1, r * 0.72, r * 0.72, C_APPLE)
    d.line([cx, cy - r * 0.6, cx - r * 0.08, cy - r * 1.15],
           fill=C_STEM, width=max(2, int(r * 0.2)))
    ellipse(d, cx + r * 0.45, cy - r * 1.02, r * 0.42, r * 0.22, C_LEAF)
    ellipse(d, cx - r * 0.36, cy - r * 0.3, r * 0.2, r * 0.13, C_WHITE + (150,))


def draw_orange(d, cx, cy, r):
    """橙子：圆 + 内圈浅色 + 六道瓣纹 + 高光 + 叶"""
    ellipse(d, cx, cy, r, r, C_ORANGE)
    ellipse(d, cx, cy, r * 0.7, r * 0.7, C_ORANGE_LIGHT)
    for i in range(6):
        a = i * math.pi / 3.0
        d.line([cx, cy, cx + math.cos(a) * r * 0.86, cy + math.sin(a) * r * 0.86],
               fill=C_WHITE + (95,), width=max(1, int(r * 0.1)))
    ellipse(d, cx - r * 0.38, cy - r * 0.4, r * 0.2, r * 0.12, C_WHITE + (170,))
    ellipse(d, cx + r * 0.45, cy - r * 1.05, r * 0.36, r * 0.2, C_LEAF)


def draw_grape(d, cx, cy, r):
    """葡萄：一簇小圆 + 果柄（用上深下浅两种紫增加体积感）"""
    d.line([cx, cy - r * 0.75, cx + r * 0.2, cy - r * 1.2],
           fill=C_STEM, width=max(2, int(r * 0.17)))
    berries = [
        (0, -0.60, C_GRAPE),
        (-0.48, -0.28, C_GRAPE_DARK), (0.48, -0.28, C_GRAPE),
        (-0.70, 0.18, C_GRAPE_DARK), (0, 0.18, C_GRAPE), (0.70, 0.18, C_GRAPE_DARK),
        (-0.38, 0.62, C_GRAPE), (0.38, 0.62, C_GRAPE),
        (0, 0.98, C_GRAPE_DARK)
    ]
    br = r * 0.4
    for (ox, oy, col) in berries:
        ellipse(d, cx + ox * r, cy + oy * r * 0.78, br, br, col)
    ellipse(d, cx - r * 0.5, cy + r * 0.02, r * 0.13, r * 0.09, C_WHITE + (165,))


def draw_strawberry(d, cx, cy, r):
    """草莓：倒心形轮廓（多边形近似）+ 白籽 + 绿蒂"""
    pts = []
    for i in range(60):
        t = i / 60.0 * math.pi * 2
        # 心形参数方程，取下半部分并倒过来 -> 草莓轮廓
        hx = 16 * math.sin(t) ** 3
        hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + hx / 16.0 * r, cy + hy / 16.0 * r * 0.92))
    d.polygon(pts, fill=C_STRAWBERRY)
    # 白籽
    for (ox, oy) in [(-0.3, -0.1), (0.1, -0.3), (0.38, -0.02), (-0.12, 0.22), (0.22, 0.3), (-0.42, 0.12)]:
        ellipse(d, cx + ox * r, cy + oy * r, r * 0.07, r * 0.1, C_WHITE + (215,))
    # 绿蒂（三片小叶）
    for ang in (-0.9, -0.15, 0.7):
        rx, ry = r * 0.5, r * 0.2
        ex = cx + math.cos(ang) * rx * 0.55
        ey = cy - r * 0.62 + math.sin(ang) * ry
        ellipse(d, ex, ey, r * 0.3, r * 0.15, C_LEAF)
    d.line([cx, cy - r * 0.6, cx, cy - r * 1.05], fill=C_STEM, width=max(2, int(r * 0.14)))


def draw_icon(size):
    """画一张 size×size 的图标（内部按 SS 倍超采样后再缩回）"""
    S = size * SS
    img = Image.new('RGBA', (S, S), C_BG + (255,))
    d = ImageDraw.Draw(img, 'RGBA')

    rounded(d, [0, 0, S - 1, S - 1], int(S * 0.22), fill=C_BG + (255,))

    pad = S * 0.1
    gap = S * 0.035
    cell = (S - pad * 2 - gap) / 2.0
    centers = [
        (pad + cell / 2, pad + cell / 2),
        (pad + cell + gap + cell / 2, pad + cell / 2),
        (pad + cell / 2, pad + cell + gap + cell / 2),
        (pad + cell + gap + cell / 2, pad + cell + gap + cell / 2)
    ]
    painters = [draw_apple, draw_orange, draw_grape, draw_strawberry]

    emoji_ok = True
    for i, (cx, cy) in enumerate(centers):
        rounded(d, [cx - cell / 2, cy - cell / 2, cx + cell / 2, cy + cell / 2],
                cell * 0.26, fill=C_TILE + (255,), outline=C_TILE_EDGE + (255,),
                width=max(1, int(cell * 0.045)))
        if emoji_ok:
            emoji_ok = draw_emoji(img, FRUIT_EMOJI[i], cx, cy, cell * 0.34)
        if not emoji_ok:
            painters[i](d, cx, cy, cell * 0.3)

    return img.resize((size, size), Image.LANCZOS)


def draw_share(w, h):
    """1200×630 分享卡片：横向一排四个格子"""
    S = SS
    img = Image.new('RGBA', (w * S, h * S), C_BG + (255,))
    d = ImageDraw.Draw(img, 'RGBA')
    rounded(d, [0, 0, w * S - 1, h * S - 1], int(h * S * 0.08), fill=C_BG + (255,))

    tile = h * 0.52 * S
    gap = h * 0.06 * S
    total = tile * 4 + gap * 3
    x0 = (w * S - total) / 2.0
    y0 = (h * S - tile) / 2.0
    painters = [draw_apple, draw_orange, draw_grape, draw_strawberry]

    emoji_ok = True
    for i, fn in enumerate(painters):
        cx = x0 + i * (tile + gap) + tile / 2
        cy = y0 + tile / 2
        rounded(d, [cx - tile / 2, cy - tile / 2, cx + tile / 2, cy + tile / 2],
                tile * 0.24, fill=C_TILE + (255,), outline=C_TILE_EDGE + (255,),
                width=max(1, int(tile * 0.035)))
        if emoji_ok:
            emoji_ok = draw_emoji(img, FRUIT_EMOJI[i], cx, cy, tile * 0.36)
        if not emoji_ok:
            fn(d, cx, cy, tile * 0.32)

    return img.resize((w, h), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180)]:
        path = os.path.join(OUT, name)
        draw_icon(size).save(path, 'PNG', optimize=True)
        print('已生成', os.path.relpath(path, ROOT), '%dx%d' % (size, size))

    path = os.path.join(OUT, 'share-1200x630.png')
    draw_share(1200, 630).save(path, 'PNG', optimize=True)
    print('已生成', os.path.relpath(path, ROOT), '1200x630')

    print('')
    print('完成。若想更精致，可改用矢量图渲染：')
    print('  pip install cairosvg')
    print("  python -c \"import cairosvg;cairosvg.svg2png(url='icon.svg',write_to='icons/icon-512.png',output_width=512)\"")


if __name__ == '__main__':
    main()
