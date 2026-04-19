"""Rasterise the PWA icons from tools/gen-icons.html.

Produces three PNGs under icons/ matching the Canvas logic:
  - icon-192.png           (standard, with border)
  - icon-512.png           (standard, with border)
  - icon-512-maskable.png  (safe-zone friendly, no border, kanji scaled 0.5)

Run with a Python 3.10+ install that has Pillow:
  python tools/gen_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, 'icons')
FONT     = r'C:\Windows\Fonts\NotoSerifJP-VF.ttf'

# Match the Canvas palette exactly.
BG     = (10, 14, 20, 255)       # #0a0e14
CYAN   = (0, 229, 255, 255)      # #00e5ff
GLYPH  = '漢'


def _radial_alpha(size, cx, cy, radius, inner_alpha):
    """Build a grayscale mask for a radial gradient from `inner_alpha` at
    center to 0 at `radius`, linear falloff. Returned mask is Image mode 'L'.
    Uses per-pixel fill — slow for big sizes but only ~0.5s at 512."""
    mask = Image.new('L', (size, size), 0)
    px = mask.load()
    r2 = radius * radius
    for y in range(size):
        dy2 = (y - cy) ** 2
        for x in range(size):
            d2 = (x - cx) ** 2 + dy2
            if d2 >= r2:
                continue
            t = (d2 / r2) ** 0.5
            px[x, y] = max(0, int(inner_alpha * (1 - t)))
    return mask


def draw_icon(size, maskable):
    # Base
    im = Image.new('RGBA', (size, size), BG)

    # Radial cyan glow
    cx = size / 2
    cy = size * (0.52 if maskable else 0.56)
    radius = size * (0.44 if maskable else 0.50)
    glow_alpha = int(0.18 * 255)  # 46
    alpha_mask = _radial_alpha(size, cx, cy, radius, glow_alpha)
    glow = Image.new('RGBA', (size, size), (0, 229, 255, 0))
    glow.putalpha(alpha_mask)
    im = Image.alpha_composite(im, glow)

    # Border (non-maskable only)
    if not maskable:
        draw = ImageDraw.Draw(im, 'RGBA')
        x0 = int(size * 0.05)
        x1 = int(size * 0.95)
        line_w = max(1, int(size * 0.012))
        draw.rectangle([x0, x0, x1, x1],
                       outline=(0, 229, 255, int(0.35 * 255)),
                       width=line_w)

    # Kanji — render crisp text + blurred duplicate behind it for the
    # shadowBlur effect Canvas uses.
    font_size = int(size * (0.50 if maskable else 0.58))
    font = ImageFont.truetype(FONT, font_size)

    # Measure glyph so we can centre on (cx, cy) the same way Canvas's
    # textBaseline='middle' does.
    bbox = font.getbbox(GLYPH)
    gw = bbox[2] - bbox[0]
    gh = bbox[3] - bbox[1]
    gx = int(cx - bbox[0] - gw / 2)
    gy = int(cy - bbox[1] - gh / 2)

    # Shadow layer — render text on blank, blur, composite.
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((gx, gy), GLYPH, font=font, fill=CYAN)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.025))
    im = Image.alpha_composite(im, shadow)

    # Crisp glyph on top.
    ImageDraw.Draw(im).text((gx, gy), GLYPH, font=font, fill=CYAN)
    return im


def save(name, size, maskable):
    path = os.path.join(ICON_DIR, name)
    im = draw_icon(size, maskable)
    im.save(path, 'PNG', optimize=True)
    print(f'wrote {path}  ({os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    os.makedirs(ICON_DIR, exist_ok=True)
    save('icon-192.png',          192, maskable=False)
    save('icon-512.png',          512, maskable=False)
    save('icon-512-maskable.png', 512, maskable=True)
