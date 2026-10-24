#!/usr/bin/env python3
"""Prepare site images (run locally; outputs are committed, CI does not run this).

- Film thumbnails: downloads https://i.ytimg.com/vi/<id>/maxresdefault.jpg into
  raw-thumbs/ (gitignored) if missing, then writes static/img/films/<slug>-{1280,640}.{jpg,webp}.
  If YouTube only serves its grey placeholder (tiny file / flat image), a typographic
  title card is drawn instead so the site never shows a blank tile.
- Brand: favicons + default share image + shop image.

Usage: python3 tools/prep_images.py            (only builds what's missing)
       python3 tools/prep_images.py --force    (rebuild everything)
"""
import json, os, sys, glob, urllib.request, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORCE = "--force" in sys.argv
RAW = os.path.join(ROOT, "raw-thumbs")
OUT = os.path.join(ROOT, "static", "img", "films")
BRAND_SRC = os.path.expanduser("~/Movies/vibewithjudeo/merch-brand/brand")
SHOP_SRC = os.path.expanduser("~/Movies/vibewithjudeo/merch-brand/capsule01/lookbook_assets")
FONT_DIR = os.path.join(BRAND_SRC, "fonts")
CREAM, UMBER = (244, 241, 235), (76, 60, 47)
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)


def font(name, size):
    try:
        return ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    except OSError:
        return ImageFont.load_default()


def is_placeholder(path):
    if os.path.getsize(path) < 20000:
        return True
    st = ImageStat.Stat(Image.open(path).convert("L"))
    return st.stddev[0] < 12


def title_card(title, kicker, size=(1280, 720)):
    im = Image.new("RGB", size, CREAM)
    d = ImageDraw.Draw(im)
    w, h = size
    pad = int(w * 0.08)
    d.rectangle([pad // 2, pad // 2, w - pad // 2, h - pad // 2], outline=UMBER, width=3)
    d.text((pad, pad), kicker.upper(), font=font("IBMPlexMono-Medium.ttf", int(h * 0.04)), fill=UMBER)
    f = font("CormorantGaramond-600.ttf", int(h * 0.11))
    lines = textwrap.wrap(title, width=26)[:4]
    y = h * 0.30
    for ln in lines:
        d.text((pad, y), ln, font=f, fill=UMBER)
        y += h * 0.13
    d.text((pad, h - pad - h * 0.05), "VIBE WITH JUDEO", font=font("IBMPlexMono-Medium.ttf", int(h * 0.04)), fill=UMBER)
    return im


def save_set(im, base):
    for wdt in (1280, 640):
        r = im.resize((wdt, wdt * 9 // 16), Image.LANCZOS)
        r.save(f"{base}-{wdt}.jpg", "JPEG", quality=80 if wdt == 1280 else 78, optimize=True, progressive=True)
        r.save(f"{base}-{wdt}.webp", "WEBP", quality=78 if wdt == 1280 else 74, method=6)


def films():
    yt = {v["id"]: v for v in json.load(open(os.path.join(ROOT, "content", "youtube.json")))}
    for fp in sorted(glob.glob(os.path.join(ROOT, "content", "films", "*.json"))):
        f = json.load(open(fp))
        base = os.path.join(OUT, f["slug"])
        if os.path.exists(base + "-1280.jpg") and not FORCE:
            continue
        raw = os.path.join(RAW, f["id"] + ".jpg")
        if not os.path.exists(raw):
            urllib.request.urlretrieve(f"https://i.ytimg.com/vi/{f['id']}/maxresdefault.jpg", raw)
        if is_placeholder(raw):
            print("placeholder thumbnail on YouTube -> title card:", f["slug"])
            im = title_card(f["h1"].split(":")[0], "Documentary")
        else:
            im = Image.open(raw).convert("RGB")
            if im.size != (1280, 720):
                im = im.resize((1280, 720), Image.LANCZOS)
        save_set(im, base)
        print("thumb", f["slug"])


def brand():
    b = os.path.join(ROOT, "static", "img", "brand")
    os.makedirs(b, exist_ok=True)
    fav = Image.open(os.path.join(BRAND_SRC, "favicon_umber_512.png")).convert("RGBA")
    for s, name in ((32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        p = os.path.join(b, name)
        if FORCE or not os.path.exists(p):
            bg = Image.new("RGBA", fav.size, CREAM + (255,))
            bg.alpha_composite(fav)
            bg.convert("RGB").resize((s, s), Image.LANCZOS).save(p, "PNG", optimize=True)
    ico = os.path.join(ROOT, "static", "favicon.ico")
    if FORCE or not os.path.exists(ico):
        bg = Image.new("RGBA", fav.size, CREAM + (255,)); bg.alpha_composite(fav)
        bg.convert("RGB").save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    og = os.path.join(b, "og-default.jpg")
    if FORCE or not os.path.exists(og):
        im = Image.new("RGB", (1200, 630), CREAM)
        d = ImageDraw.Draw(im)
        d.rectangle([30, 30, 1170, 600], outline=UMBER, width=3)
        d.text((90, 110), "DOCUMENTARIES", font=font("IBMPlexMono-Medium.ttf", 26), fill=UMBER)
        d.text((86, 170), "Vibe with Judeo", font=font("CormorantGaramond-600.ttf", 120), fill=UMBER)
        d.text((90, 330), "Expeditions, disasters, mysteries and money,", font=font("CormorantGaramond-500.ttf", 46), fill=UMBER)
        d.text((90, 390), "told from the record.", font=font("CormorantGaramond-500.ttf", 46), fill=UMBER)
        d.text((90, 520), "VIBEWITHJUDEO.COM", font=font("IBMPlexMono-Medium.ttf", 26), fill=UMBER)
        im.save(og, "JPEG", quality=85, optimize=True)
    lock = os.path.join(b, "judeo-archive-lockup.png")
    if FORCE or not os.path.exists(lock):
        im = Image.open(os.path.join(BRAND_SRC, "lockup_by_vibe_with_judeo_umber_web.png"))
        im.resize((800, 800 * im.size[1] // im.size[0]), Image.LANCZOS).save(lock, "PNG", optimize=True)
    for src, name in (("09_chart_print_archive_wall.jpg", "shop-chart-print"), ("05_expedition_knit_navy_flatlay.jpg", "shop-expedition-knit")):
        p = os.path.join(b, name + ".webp")
        if FORCE or not os.path.exists(p):
            im = Image.open(os.path.join(SHOP_SRC, src)).convert("RGB")
            w = 800
            im = im.resize((w, w * im.size[1] // im.size[0]), Image.LANCZOS)
            im.save(p, "WEBP", quality=76, method=6)
            im.save(p[:-5] + ".jpg", "JPEG", quality=78, optimize=True, progressive=True)
            print(name, im.size)


if __name__ == "__main__":
    films()
    brand()
