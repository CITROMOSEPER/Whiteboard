"""Download the public handwriting datasets used to train the recogniser into training/data/.

Run:  python training/download.py

  EMNIST   digits and Latin letters   https://www.nist.gov/itl/products-and-services/emnist-dataset
  HASYv2   math symbols and Greek     https://doi.org/10.5281/zenodo.259444        (ODbL 1.0)
  CoMNIST  Cyrillic letters           https://github.com/GregVial/CoMNIST          (CC BY-SA 4.0)

See THIRD-PARTY-NOTICES.md in the project root for the licences. The data itself is not part
of this project and should not be uploaded with it (training/data/ is ignored by git).
"""
import hashlib
import sys
from pathlib import Path

import requests

DATA = Path(__file__).parent / "data"
FILES = [
    ("emnist-gzip.zip", "https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip", None),
    ("HASYv2.tar.bz2", "https://zenodo.org/records/259444/files/HASYv2.tar.bz2?download=1", "fddf23f36e24b5236f6b3a0880c778e3"),
    ("comnist-cyrillic.zip", "https://github.com/GregVial/CoMNIST/raw/master/images/Cyrillic.zip", None),
]


def fetch(name, url, md5):
    out = DATA / name
    if out.exists() and out.stat().st_size > 0:
        print(f"{name}: already here ({out.stat().st_size / 1e6:.1f} MB)")
        return
    tmp = out.with_suffix(out.suffix + ".part")
    digest = hashlib.md5()
    with requests.get(url, stream=True, timeout=60, headers={"User-Agent": "dataset-downloader"}) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        done = 0
        step = 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if done // (50 << 20) > step:
                    step = done // (50 << 20)
                    print(f"{name}: {done / 1e6:.0f} / {total / 1e6:.0f} MB", flush=True)
    if md5 and digest.hexdigest() != md5:
        tmp.unlink()
        sys.exit(f"{name}: checksum mismatch, download discarded")
    tmp.rename(out)
    print(f"{name}: done ({out.stat().st_size / 1e6:.1f} MB)", flush=True)


if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    for item in FILES:
        fetch(*item)
