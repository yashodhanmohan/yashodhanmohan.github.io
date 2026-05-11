#!/usr/bin/env python3
"""Generate /og-image.png — a 1200×630 Open Graph card for the site.

Run with: python3 scripts/gen_og.py
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (238, 240, 238)
INK = (20, 22, 30)
INK_SOFT = (44, 47, 58)
MUTED = (107, 111, 120)
ACCENT = (46, 76, 199)

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"


def main():
    img = Image.new("RGB", (W, H), BG)

    # Soft cobalt orb in the upper-right corner — gaussian-blurred filled circle.
    orb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    od.ellipse([W - 520, -260, W + 220, 480], fill=ACCENT + (110,))
    orb = orb.filter(ImageFilter.GaussianBlur(80))
    img.paste(orb, (0, 0), orb)

    draw = ImageDraw.Draw(img)

    f_name = ImageFont.truetype(SERIF, 132)
    f_name_italic = ImageFont.truetype(SERIF_ITALIC, 132)
    f_tagline = ImageFont.truetype(SERIF_ITALIC, 38)
    f_url = ImageFont.truetype(MONO, 22)
    f_mark = ImageFont.truetype(MONO, 22)

    # Staircase name — matches the home page treatment
    x0 = 96
    y0 = 92
    step = 64  # horizontal step per line
    line_h = 124

    # Line 1: "Yashodhan." (period in cobalt)
    name_text = "Yashodhan"
    draw.text((x0, y0), name_text, font=f_name, fill=INK)
    period_x = x0 + draw.textlength(name_text, font=f_name)
    draw.text((period_x, y0), ".", font=f_name, fill=ACCENT)

    # Line 2: "Mohan" italic, indented
    x1 = x0 + step
    y1 = y0 + line_h
    draw.text((x1, y1), "Mohan", font=f_name_italic, fill=INK_SOFT)

    # Line 3: "Bhatnagar" cobalt, further indented
    x2 = x1 + step
    y2 = y1 + line_h
    draw.text((x2, y2), "Bhatnagar", font=f_name, fill=ACCENT)

    # Tagline below
    y_tag = y2 + line_h + 22
    draw.text(
        (x0 + 8, y_tag),
        "— engineer · head of engineering at Superr",
        font=f_tagline,
        fill=MUTED,
    )

    # Mark in top-left + URL in bottom-right (mono)
    draw.text((x0, 44), "Y M B", font=f_mark, fill=INK, spacing=4)

    url = "yashodhanmohan.github.io"
    url_w = draw.textlength(url, font=f_url)
    draw.text((W - url_w - 48, H - 52), url, font=f_url, fill=MUTED)

    out = "og-image.png"
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({W}×{H})")


if __name__ == "__main__":
    main()
