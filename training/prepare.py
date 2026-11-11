"""Turn the downloaded datasets, plus characters drawn from the fonts on this PC, into one
training set of 32x32 images: training/work/dataset.npz.

Run:  python training/prepare.py      (after download.py)

Every image is normalised the same way the app will render pen strokes: white ink on black,
cropped to the ink, scaled to fit 24x24 keeping its proportions, centred in 32x32.
"""
import csv
import gzip
import io
import random
import struct
import tarfile
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from classes import HASY, INDEX, JUNK, LABELS, SETS

HERE = Path(__file__).parent
DATA, WORK = HERE / "data", HERE / "work"
SIZE, BOX = 32, 24
rng = random.Random(7)
np.random.seed(7)


def norm(img):
    """uint8 array (ink bright) -> 32x32 uint8, or None if empty."""
    ys, xs = np.nonzero(img > 48)
    if len(xs) == 0:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = Image.fromarray(img[y0:y1, x0:x1])
    w, h = x1 - x0, y1 - y0
    k = BOX / max(w, h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    crop = crop.resize((nw, nh), Image.LANCZOS if k < 1 else Image.BICUBIC)
    out = Image.new("L", (SIZE, SIZE), 0)
    out.paste(crop, ((SIZE - nw) // 2, (SIZE - nh) // 2))
    return np.asarray(out, dtype=np.uint8)


def distort(im, strength=1.0):
    """Random handwriting-like variation of a PIL 'L' image: slant, stretch, wobble, stroke weight."""
    w, h = im.size
    big = Image.new("L", (w * 2, h * 2), 0)
    big.paste(im, (w // 2, h // 2))
    W, H = big.size
    j = lambda a: rng.uniform(-a, a) * strength
    shear, rot = j(0.28), j(0.14)
    sx, sy = 1 + j(0.18), 1 + j(0.18)
    cx, cy = W / 2, H / 2
    a, b = np.cos(rot) / sx, (np.sin(rot) + shear) / sx
    d, e = -np.sin(rot) / sy, np.cos(rot) / sy
    big = big.transform((W, H), Image.AFFINE, (a, b, cx - a * cx - b * cy, d, e, cy - d * cx - e * cy), Image.BICUBIC)
    q = W * 0.045 * strength   # uneven corners: a mild non-linear wobble
    quad = [rng.uniform(-q, q) for _ in range(8)]
    big = big.transform((W, H), Image.QUAD, (quad[0], quad[1], quad[2], H + quad[3], W + quad[4], H + quad[5], W + quad[6], quad[7]), Image.BICUBIC)
    r = rng.random()
    if r < 0.3:
        big = big.filter(ImageFilter.MaxFilter(3))
    elif r < 0.4:
        big = big.filter(ImageFilter.MaxFilter(5))
    elif r < 0.5:
        big = big.filter(ImageFilter.MinFilter(3))
    return big


X, Y, SRC = [], [], []   # images, label index, source name


def add(img, ch, src):
    n = norm(img)
    if n is not None:
        X.append(n); Y.append(INDEX[ch]); SRC.append(src)


# ---------------------------------------------------------------- EMNIST (ByClass: 62 classes)
def read_idx(zf, name):
    raw = gzip.decompress(zf.read(name))
    magic, n = struct.unpack(">II", raw[:8])
    if magic == 2051:
        rows, cols = struct.unpack(">II", raw[8:16])
        return np.frombuffer(raw, np.uint8, offset=16).reshape(n, rows, cols)
    return np.frombuffer(raw, np.uint8, offset=8)


def emnist(cap_train=2600, cap_test=350):
    with zipfile.ZipFile(DATA / "emnist-gzip.zip") as zf:
        names = {Path(n).name: n for n in zf.namelist()}
        mapping = dict(line.split() for line in zf.read(names["emnist-byclass-mapping.txt"]).decode().splitlines() if line.strip())
        for split, cap in (("train", cap_train), ("test", cap_test)):
            labels = read_idx(zf, names[f"emnist-byclass-{split}-labels-idx1-ubyte.gz"])
            images = read_idx(zf, names[f"emnist-byclass-{split}-images-idx3-ubyte.gz"])
            seen = Counter()
            for i in np.random.permutation(len(labels)):
                ch = chr(int(mapping[str(labels[i])]))
                if seen[ch] >= cap:
                    continue
                seen[ch] += 1
                add(images[i].T, ch, "emnist" if split == "train" else "emnist-test")   # stored transposed
            print(f"EMNIST {split}: {sum(seen.values())} images, {len(seen)} classes", flush=True)


# ---------------------------------------------------------------- HASYv2 (math, Greek, plus letters/digits)
def hasy(cap=1300):
    unknown, seen = Counter(), Counter()
    root = DATA / "hasy"
    if not (root / "hasy-data-labels.csv").exists():        # unpack once; reading out of the archive in random order is very slow
        with tarfile.open(DATA / "HASYv2.tar.bz2") as tf:
            tf.extractall(root, filter="data")
    with open(root / "hasy-data-labels.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rng.shuffle(rows)
    for r in rows:
        latex = r["latex"]
        ch = HASY.get(latex, latex if len(latex) == 1 and latex in INDEX else None)
        if ch is None or ch not in INDEX:
            unknown[latex] += 1
            continue
        if seen[ch] >= cap:
            continue
        seen[ch] += 1
        im = Image.open(root / r["path"]).convert("L")
        add(255 - np.asarray(im), ch, "hasy-test" if seen[ch] % 10 == 0 else "hasy")
    print(f"HASYv2: {sum(seen.values())} images, {len(seen)} classes; not used: {len(unknown)} symbol kinds", flush=True)
    return seen


# ---------------------------------------------------------------- CoMNIST (Cyrillic, case mixed per letter)
def comnist(copies=3):
    seen = Counter()
    with zipfile.ZipFile(DATA / "comnist-cyrillic.zip") as zf:
        for info in zf.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".png"):
                continue
            name = info.filename if info.flag_bits & 0x800 else info.filename.encode("cp437").decode("utf-8", "replace")
            letter = Path(name).parent.name.lower()
            if letter == "i":
                letter = "і"                                     # the folder for Cyrillic І is named with a Latin I
            if letter not in INDEX or letter not in SETS["cyr"]:
                continue
            im = Image.open(io.BytesIO(zf.read(info)))
            if im.mode == "RGBA" and np.asarray(im)[..., 3].min() < 250:
                ink = im.split()[3]                              # drawn on a transparent background
            else:
                ink = Image.fromarray(255 - np.asarray(im.convert("L")))
            ink = ink.resize((96, 96), Image.LANCZOS)
            seen[letter] += 1
            if seen[letter] % 10 == 0:
                add(np.asarray(ink), letter, "comnist-test")
                continue
            add(np.asarray(ink), letter, "comnist")
            for _ in range(copies):                              # small dataset: add varied copies
                add(np.asarray(distort(ink, 0.7)), letter, "comnist")
    print(f"CoMNIST: {sum(seen.values())} originals, {len(seen)} letters", flush=True)
    return seen


# ---------------------------------------------------------------- Characters drawn from fonts
FONT_DIR = Path("C:/Windows/Fonts")
FONT_FILES = ["segoepr.ttf", "Inkfree.ttf", "comic.ttf", "mvboli.ttf", "segoesc.ttf", "LHANDW.TTF", "Gabriola.ttf",
              "segoeui.ttf", "arial.ttf", "calibri.ttf", "verdana.ttf", "tahoma.ttf", "trebuc.ttf", "times.ttf", "georgia.ttf",
              "consola.ttf", "cour.ttf", "cambria.ttc:0", "cambria.ttc:1", "seguisym.ttf", "comici.ttf", "ariali.ttf", "timesi.ttf"]


def load_fonts():
    fonts = []
    for spec in FONT_FILES:
        name, _, idx = spec.partition(":")
        path = FONT_DIR / name
        if not path.exists():
            continue
        try:
            cmap = TTFont(path, fontNumber=int(idx or 0), lazy=True).getBestCmap()
            fonts.append((ImageFont.truetype(str(path), 44, index=int(idx or 0)), set(cmap)))
        except Exception as exc:   # a font that cannot be read is simply skipped
            print("skip font", spec, exc)
    return fonts


def synthetic(real_counts, plenty=300, few=110, many=520):
    fonts = load_fonts()
    made, missing = 0, []
    for ch in LABELS:
        if ch == JUNK:
            continue
        have = [f for f, cmap in fonts if ord(ch) in cmap]
        if not have:
            missing.append(ch)
            continue
        cyr_upper = ch.upper() if ch in SETS["cyr"] else None
        for i in range(few if real_counts.get(ch, 0) >= plenty else many):
            font = have[i % len(have)]
            text = cyr_upper if cyr_upper and i % 2 else ch      # Cyrillic classes hold both cases
            im = Image.new("L", (96, 96), 0)
            d = ImageDraw.Draw(im)
            l, t, r, b = d.textbbox((0, 0), text, font=font)
            d.text(((96 - (r - l)) / 2 - l, (96 - (b - t)) / 2 - t), text, fill=255, font=font)
            add(np.asarray(distort(im)), ch, "font-test" if i % 12 == 0 else "font")
            made += 1
    print(f"Fonts: {made} images from {len(fonts)} fonts; no font has: {''.join(missing) or 'none'}", flush=True)


# ---------------------------------------------------------------- "Not one character"
def junk(pairs=30000, triples=6000, scribbles=12000):
    pool = [i for i, s in enumerate(SRC) if not s.endswith("-test")]
    def glyph():
        g = X[rng.choice(pool)]
        ys, xs = np.nonzero(g > 48)
        return g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    for k in range(pairs + triples):
        parts = [glyph() for _ in range(2 if k < pairs else 3)]
        hmax = max(p.shape[0] for p in parts)
        canvas = np.zeros((hmax + 8, sum(p.shape[1] for p in parts) + 8 * len(parts)), np.uint8)
        x = 2
        for p in parts:
            y = rng.randint(0, hmax - p.shape[0] + 4)
            region = canvas[y:y + p.shape[0], x:x + p.shape[1]]
            np.maximum(region, p, out=region)
            x += p.shape[1] + rng.randint(-2, 4)
        add(canvas, JUNK, "junk-test" if k % 12 == 0 else "junk")
    for k in range(scribbles):
        im = Image.new("L", (64, 64), 0)
        d = ImageDraw.Draw(im)
        pts = [(rng.uniform(6, 58), rng.uniform(6, 58))]
        for _ in range(rng.randint(9, 26)):
            px, py = pts[-1]
            pts.append((min(60, max(4, px + rng.uniform(-30, 30))), min(60, max(4, py + rng.uniform(-30, 30)))))
        d.line(pts, fill=255, width=rng.choice((2, 2, 3)), joint="curve")
        add(np.asarray(im), JUNK, "junk-test" if k % 12 == 0 else "junk")
    print(f"Junk: {pairs + triples + scribbles} images", flush=True)


if __name__ == "__main__":
    WORK.mkdir(exist_ok=True)
    emnist()
    counts = Counter()
    counts.update(hasy())
    counts.update(comnist())
    for i, s in enumerate(SRC):
        if s == "emnist":
            counts[LABELS[Y[i]]] += 1
    synthetic(counts)
    junk()
    x, y, src = np.stack(X), np.asarray(Y, np.int16), np.asarray(SRC)
    np.savez_compressed(WORK / "dataset.npz", x=x, y=y, src=src)
    per_class = Counter(y[[not s.endswith("-test") for s in src]].tolist())
    thin = [LABELS[i] for i in range(len(LABELS)) if per_class[i] < 300]
    print(f"Saved {len(y)} images, {len(LABELS)} classes. By source: {dict(Counter(src.tolist()))}")
    print("Classes with under 300 training images:", "".join(thin) or "none")
