#!/usr/bin/env python3
"""Generate per-lab Open Graph cards.

Produces /lab/<slug>/og.png at 1200x630 for each entry in LABS.
Visual language mirrors /og-image.png: cobalt orb in the upper-right,
serif title with cobalt end-dot, italic tagline, mono mark + url.

Run from repo root: python3 scripts/gen_lab_og.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (238, 240, 238)
INK = (20, 22, 30)
MUTED = (107, 111, 120)
ACCENT = (46, 76, 199)

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"

LABS = [
    {
        "num": "07",
        "slug": "reaction-diffusion",
        "title": "Reaction–diffusion",
        "tagline": "Two chemicals on a grid. Watch a Turing pattern grow.",
    },
    {
        "num": "08",
        "slug": "lattice",
        "title": "Spring lattice",
        "tagline": "A grid of masses on springs. Pluck. Watch the wave radiate.",
    },
    {
        "num": "09",
        "slug": "lissajous",
        "title": "Lissajous",
        "tagline": "Two perpendicular sines. Rational closes; irrational fills.",
    },
    {
        "num": "10",
        "slug": "predator-prey",
        "title": "Predator–prey",
        "tagline": "Rabbits and foxes. A closed orbit in phase space.",
    },
    {
        "num": "11",
        "slug": "double-pendulum",
        "title": "Double pendulum",
        "tagline": "Two arms, deterministic equations, no predictable future.",
    },
    {
        "num": "12",
        "slug": "diffraction",
        "title": "Diffraction",
        "tagline": "A wavefront, N slits, a screen. Watch lines sharpen.",
    },
    {
        "num": "13",
        "slug": "mandelbrot",
        "title": "Mandelbrot",
        "tagline": "Iterate z² + c. Drag, zoom, hover for the Julia twin.",
    },
]

REPO = Path(__file__).resolve().parent.parent


def fit_font(text, max_w, ttf_path, start=160, min_=84, step=4):
    """Return the largest font size for `text` that fits within `max_w`."""
    size = start
    while size > min_:
        font = ImageFont.truetype(ttf_path, size)
        l, _, r, _ = font.getbbox(text)
        if r - l <= max_w:
            return font
        size -= step
    return ImageFont.truetype(ttf_path, min_)


def render_lab(lab):
    img = Image.new("RGB", (W, H), BG)

    # Soft cobalt orb in upper-right.
    orb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    od.ellipse([W - 520, -260, W + 220, 480], fill=ACCENT + (110,))
    orb = orb.filter(ImageFilter.GaussianBlur(80))
    img.paste(orb, (0, 0), orb)

    draw = ImageDraw.Draw(img)

    f_mark = ImageFont.truetype(MONO, 22)
    f_lab = ImageFont.truetype(MONO, 22)
    f_num = ImageFont.truetype(MONO, 32)
    f_tagline = ImageFont.truetype(SERIF_ITALIC, 38)
    f_url = ImageFont.truetype(MONO, 22)

    x0 = 96

    # Top corners: YMB mark + "lab"
    draw.text((x0, 44), "Y M B", font=f_mark, fill=INK, spacing=4)
    lab_w = draw.textlength("lab", font=f_lab)
    draw.text((W - lab_w - x0, 44), "lab", font=f_lab, fill=MUTED)

    # Lab number, cobalt mono
    y_num = 200
    draw.text((x0, y_num), lab["num"], font=f_num, fill=ACCENT)

    # Title with cobalt end-dot, auto-fitted
    title = lab["title"]
    f_title = fit_font(title + ".", W - 2 * x0, SERIF, start=160, min_=92)
    y_title = y_num + 56
    title_w = draw.textlength(title, font=f_title)
    draw.text((x0, y_title), title, font=f_title, fill=INK)
    draw.text((x0 + title_w, y_title), ".", font=f_title, fill=ACCENT)

    # Tagline (italic, muted)
    _, t, _, b = f_title.getbbox("Aj")
    title_h = b - t
    y_tag = y_title + title_h + 60
    draw.text((x0, y_tag), "— " + lab["tagline"], font=f_tagline, fill=MUTED)

    # URL bottom-right
    url = "yashodhanmohan.github.io"
    url_w = draw.textlength(url, font=f_url)
    draw.text((W - url_w - 48, H - 52), url, font=f_url, fill=MUTED)

    out = REPO / "lab" / lab["slug"] / "og.png"
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out.relative_to(REPO)} ({W}×{H})")


def main():
    for lab in LABS:
        render_lab(lab)


if __name__ == "__main__":
    main()
