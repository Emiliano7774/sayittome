from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import hashlib
import shutil

ROOT = Path(r"C:\Users\emibe\sayittome-web")
BASE = ROOT / "android/app/src/main/res"
SRC = ROOT / "assets/brand/new-icon-20261015.webp"
MASTER = ROOT / "assets/brand/app-icon-launcher-20261015.png"
BACKUP = ROOT / "assets/brand/backups/launcher-before-20261015"
EXPECTED = "8d79abaed6fb79c7aa26c22b80d7950edd1a8ff548d62fad3920492f281c2e6c"
assert hashlib.sha256(SRC.read_bytes()).hexdigest() == EXPECTED, "Transferencia alterada"
raw = Image.open(SRC).convert("RGB")
assert raw.size == (512, 512), raw.size
high = raw.resize((1024, 1024), Image.Resampling.LANCZOS)
MASTER.parent.mkdir(parents=True, exist_ok=True)
high.save(MASTER, optimize=True)

# Preserve existing launcher assets before any changes.
sizes = {"mipmap-mdpi": (48, 108), "mipmap-hdpi": (72, 162),
         "mipmap-xhdpi": (96, 216), "mipmap-xxhdpi": (144, 324),
         "mipmap-xxxhdpi": (192, 432)}
for folder in sizes:
    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        src = BASE / folder / name
        dst = BACKUP / folder / name
        if src.exists() and not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
bgfile = BASE / "values/ic_launcher_background.xml"
bakbg = BACKUP / "values/ic_launcher_background.xml"
bakbg.parent.mkdir(parents=True, exist_ok=True)
if not bakbg.exists():
    shutil.copy2(bgfile, bakbg)

# Android adaptive launchers display only the inner 2/3 of their 108dp
# layers. Add breathing room around the original art to retain the
# desired smaller moon and ensure no clipping.
background = high.filter(ImageFilter.GaussianBlur(radius=125))
adaptive = background.copy()
art_side = 806
art = high.resize((art_side, art_side), Image.Resampling.LANCZOS)
alpha = Image.new("L", (art_side, art_side), 0)
draw = ImageDraw.Draw(alpha)
draw.rounded_rectangle((12, 12, art_side-13, art_side-13), radius=125, fill=255)
alpha = alpha.filter(ImageFilter.GaussianBlur(radius=15))
pos = ((1024 - art_side) // 2, (1024 - art_side) // 2)
adaptive.paste(art, pos, alpha)
adaptive.save(ROOT / "assets/brand/app-icon-adaptive-20261015.png", optimize=True)

for folder, (legacy_px, foreground_px) in sizes.items():
    dest = BASE / folder
    dest.mkdir(parents=True, exist_ok=True)
    legacy = high.resize((legacy_px, legacy_px), Image.Resampling.LANCZOS)
    legacy.save(dest / "ic_launcher.png", optimize=True)
    legacy.save(dest / "ic_launcher_round.png", optimize=True)
    adaptive.resize((foreground_px, foreground_px), Image.Resampling.LANCZOS).save(
        dest / "ic_launcher_foreground.png", optimize=True)
    for name, px in (("ic_launcher.png",legacy_px),("ic_launcher_foreground.png",foreground_px)):
        assert Image.open(dest/name).size == (px, px)
    print(folder, legacy_px, foreground_px, "OK")

bgfile.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#140027</color>\n</resources>\n', encoding="utf-8")
print("ICON VERIFIED: launcher-only native Android resources updated")
print("BACKUP", BACKUP)
print("MASTER", MASTER)
