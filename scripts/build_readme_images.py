#!/usr/bin/env python3
"""Build and check the README images (OpenAEC README standard).

    python scripts/build_readme_images.py           # rebuild docs/images/readme/*.png
    python scripts/build_readme_images.py --check   # verify references, use, size and width

The images are derived from the source captures in docs/screenshots/: scaled
to 1280-1440 px wide and reduced to a palette until each PNG is at most 150 kB.
The check needs no third-party packages, so CI can run it as is.
"""
import argparse, re, struct, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/images/readme"
SRC = ROOT / "docs/screenshots"
READMES = [ROOT / "README.md", ROOT / "README.nl.md"]
MAX_BYTES, MIN_W, MAX_W, WIDTH = 150 * 1024, 1280, 1600, 1440

# README image -> source capture
SOURCES = {
    "hero.png": "01-cpt-sondering.jpg",
    "borehole.png": "02-bhr-boring.jpg",
    # The map capture (03-kaart-bro.jpg) shows an aerial photo and does not fit
    # 150 kB as PNG; recapture it on the BRT background map to add it.
    "report.png": "04-rapport-pdf.png",
    "site-plan.png": "05-situatietekening.jpg",
    "soil-model-3d.png": "10-soil-model-3d.png",
    "soil-model-3d-section.png": "11-soil-model-3d-section.png",
}


def build() -> None:
    from PIL import Image  # only needed to rebuild
    OUT.mkdir(parents=True, exist_ok=True)
    for name, source in SOURCES.items():
        source_im = Image.open(SRC / source).convert("RGB")
        target = OUT / name
        # Grootste breedte en meeste kleuren die binnen 150 kB passen.
        for width in (WIDTH, 1360, MIN_W):
            im = source_im.resize((width, round(source_im.height * width / source_im.width)), Image.LANCZOS)
            for colors in (256, 192, 128, 96, 64, 48, 32, 24, 16):
                im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(target, optimize=True)
                if target.stat().st_size <= MAX_BYTES:
                    break
            if target.stat().st_size <= MAX_BYTES:
                break
        print(f"{name}: {target.stat().st_size // 1024} kB, {width} px, {colors} colours")


def png_width(path: Path) -> int:
    with path.open("rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    return struct.unpack(">I", head[16:20])[0]


def check() -> int:
    errors = []
    used = set()
    for readme in READMES:
        if not readme.exists():
            errors.append(f"{readme.name} is missing")
            continue
        for ref in re.findall(r"docs/images/readme/([\w.-]+)", readme.read_text(encoding="utf-8")):
            used.add(ref)
            if not (OUT / ref).exists():
                errors.append(f"{readme.name} refers to missing image {ref}")
    for image in sorted(OUT.glob("*")):
        if image.name not in used:
            errors.append(f"{image.name} is not used by either README")
        if image.stat().st_size > MAX_BYTES:
            errors.append(f"{image.name} is {image.stat().st_size // 1024} kB (max 150 kB)")
        if image.suffix == ".png" and not MIN_W <= png_width(image) <= MAX_W:
            errors.append(f"{image.name} is {png_width(image)} px wide (1280-1600)")
    for e in errors:
        print(f"README images: {e}", file=sys.stderr)
    if not errors:
        print(f"README images: {len(used)} images, all present, used and within limits")
    return 1 if errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sys.exit(check() if args.check else build())
