#!/usr/bin/env python3
"""
Build the bundled thrall art set from assets/thrall.webp (the source cutout, left untouched).

  assets/thrall-portrait.webp  sheet/chat portrait: the cutout as-is
  assets/thrall-subject.webp   dynamic-ring subject: top half untouched (pops out of the ring),
                               everything below Y_SPLIT clipped to a circle that sits just inside the rim
  assets/thrall-token.webp     plain token (ring off): whole figure, bottom edge faded out

Foundry's dynamic ring draws the subject ~1.21x larger than a plain token and does not clip it,
so the subject has to carry its own transparency.

Usage:
  python3 tools/make_thrall_subject.py                 # write the three assets
  python3 tools/make_thrall_subject.py --sheet out.png # also write a contact sheet of variants
Requires Pillow.
"""
import argparse
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SOURCE = os.path.join(ASSETS, "thrall.webp")

# Circle radius as a fraction of the half-width, vertical offset of its centre (fraction of height),
# where the mask starts (fraction of height) and its soft edge (px).
R_FRAC = 0.75
CY_OFFSET = 0.0
Y_SPLIT = 0.55
FEATHER = 1.5
# How much of the bottom of the plain token fades out (fraction of height).
TOKEN_FADE = 0.14
# The ring draws the subject this much larger than a plain fit at subject.scale 1.
RING_POP = 1.21
QUALITY = 90


def subject(src, r_frac=R_FRAC, cy_offset=CY_OFFSET, y_split=Y_SPLIT, feather=FEATHER):
    w, h = src.size
    ss = 4  # supersample the mask for a clean edge
    circle = Image.new("L", (w * ss, h * ss), 0)
    cx, cy, r = w / 2 * ss, (h / 2 + cy_offset * h) * ss, r_frac * w / 2 * ss
    ImageDraw.Draw(circle).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    circle = circle.resize((w, h), Image.LANCZOS)
    if feather > 0:
        circle = circle.filter(ImageFilter.GaussianBlur(feather))
    # keep everything above y_split; below it, keep only what is inside the circle
    mask = Image.new("L", (w, h), 255)
    below = int(round(y_split * h))
    mask.paste(circle.crop((0, below, w, h)), (0, below))
    out = src.copy()
    out.putalpha(ImageChops.multiply(src.getchannel("A"), mask))
    return out


def token(src, fade=TOKEN_FADE):
    w, h = src.size
    start = int(round(h * (1 - fade)))
    ramp = Image.new("L", (w, h), 255)
    px = ramp.load()
    for y in range(start, h):
        v = int(round(255 * (1 - (y - start) / (h - start)) ** 1.5))
        for x in range(w):
            px[x, y] = v
    out = src.copy()
    out.putalpha(ImageChops.multiply(src.getchannel("A"), ramp))
    return out


def mock_cell(art, cell=300, scale=1.0, ring=True, pop=RING_POP, margin=0.3):
    """Composite art over a grid cell the way a ring token draws it (bronze rim, pop-out visible)."""
    m = int(cell * margin)
    full = cell + 2 * m
    img = Image.new("RGBA", (full, full), (38, 40, 46, 255))
    d = ImageDraw.Draw(img)
    d.rectangle((m, m, m + cell, m + cell), outline=(96, 100, 112, 255), width=2)
    size = int(cell * (pop * scale if ring else 1))
    img.alpha_composite(art.resize((size, size), Image.LANCZOS), ((full - size) // 2, (full - size) // 2))
    if ring:
        ss = 4
        rim = Image.new("RGBA", (full * ss, full * ss), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rim)
        c = full * ss / 2
        ro, ri = cell * ss * 0.5, cell * ss * 0.455
        rd.ellipse((c - ro, c - ro, c + ro, c + ro), fill=(176, 120, 54, 255))
        rd.ellipse((c - ri, c - ri, c + ri, c + ri), fill=(0, 0, 0, 0))
        img.alpha_composite(rim.resize((full, full), Image.LANCZOS))
    return img


def contact_sheet(src, path, scales=(1.0,)):
    rs = (0.70, 0.75, 0.80)
    ys = (0.45, 0.55, 0.65)
    cell, pad, label = 300, 10, 22
    full = int(cell * 1.6)
    font = ImageFont.load_default()
    cols, rows = len(ys), len(rs) * len(scales)
    sheet = Image.new("RGBA", (cols * (full + pad) + pad, rows * (full + label + pad) + pad), (20, 20, 24, 255))
    d = ImageDraw.Draw(sheet)
    row = 0
    for s in scales:
        for r in rs:
            for col, y in enumerate(ys):
                art = subject(src, r_frac=r, y_split=y)
                cellimg = mock_cell(art, cell, scale=s)
                x0 = pad + col * (full + pad)
                y0 = pad + row * (full + label + pad)
                d.text((x0, y0 + 4), f"R_FRAC {r}  Y_SPLIT {y}  scale {s}", fill=(230, 230, 230, 255), font=font)
                sheet.alpha_composite(cellimg, (x0, y0 + label))
            row += 1
    sheet.convert("RGB").save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="write a contact sheet of R_FRAC x Y_SPLIT variants to this path")
    ap.add_argument("--scales", default="1.0", help="comma list of ring.subject.scale values for the sheet")
    ap.add_argument("--r-frac", type=float, default=R_FRAC)
    ap.add_argument("--y-split", type=float, default=Y_SPLIT)
    ap.add_argument("--feather", type=float, default=FEATHER)
    ap.add_argument("--cy-offset", type=float, default=CY_OFFSET)
    args = ap.parse_args()

    src = Image.open(SOURCE).convert("RGBA")
    if args.sheet:
        contact_sheet(src, args.sheet, tuple(float(s) for s in args.scales.split(",")))
        print("wrote", args.sheet)
        return
    outputs = {
        "thrall-portrait.webp": src,
        "thrall-subject.webp": subject(src, args.r_frac, args.cy_offset, args.y_split, args.feather),
        "thrall-token.webp": token(src),
    }
    for name, img in outputs.items():
        p = os.path.join(ASSETS, name)
        img.save(p, "WEBP", quality=QUALITY, method=6)
        print(name, img.size, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
