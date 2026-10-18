#!/usr/bin/env python3
"""Builds the bundled Kai font in extension/fonts/ from AR PL UKai.

    uv run scripts/build-fonts.py

uv installs fontTools and brotli from pyproject.toml / uv.lock.

Downloads the AR PL UKai 0.2.20080216 source (the Debian upstream tarball),
verifies its checksum, then takes the TW face from ukai.ttc and:

  * keeps only the CJK characters that appear in the dictionary plus CJK
    punctuation, so the file stays small,
  * renames the family to "ZW UKai" and records the modification in the
    font's name table, as the Arphic Public License requires for modified
    copies,
  * writes extension/fonts/ukai.woff2 along with the unaltered license.

One face serves both scripts: the four faces in ukai.ttc cover the same
dictionary characters and differ in only two glyphs (令 and 骨).

Re-run after updating the dictionary so newly used characters are included.
"""

import hashlib
import io
import re
import sys
import tarfile
import urllib.request
from datetime import date
from pathlib import Path

try:
    from fontTools.ttLib import TTCollection
    from fontTools import subset
except ImportError:
    sys.exit("fontTools is missing; run this with: uv run scripts/build-fonts.py")

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
OUT = EXT / "fonts"
SRC_URL = ("https://deb.debian.org/debian/pool/main/f/fonts-arphic-ukai/"
           "fonts-arphic-ukai_0.2.20080216.2.orig.tar.bz2")
EXPECTED_SHA256 = "b4968d73519f4f8747e85548fb85d21b665da1bf1ba900a7c499976e6a8ae3d2"
PREFIX = "fonts-arphic-ukai-0.2.20080216.2/"

# Face index in ukai.ttc: 0 = CN, 1 = HK, 2 = TW, 3 = TW MBE.
FACE_INDEX = 2
FAMILY = "ZW UKai"
FILENAME = "ukai.woff2"

# Mirrors the unicode-range in extension/sidepanel/sidepanel.css.
CJK_RANGES = [
    (0x2E80, 0x2FDF), (0x3000, 0x303F), (0x3100, 0x312F), (0x31C0, 0x31EF),
    (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0xFE30, 0xFE4F),
    (0xFF00, 0xFFEF), (0x20000, 0x2FA1F),
]


def is_cjk(cp):
    return any(lo <= cp <= hi for lo, hi in CJK_RANGES)


def dictionary_codepoints():
    text = (EXT / "data" / "cedict_ts.u8").read_text(encoding="utf-8")
    cps = {ord(c) for line in text.splitlines() if not line.startswith("#") for c in line}
    # Punctuation and full-width forms are always kept, plus the UI's own labels.
    for lo, hi in [(0x3000, 0x303F), (0xFF00, 0xFFEF), (0xFE30, 0xFE4F)]:
        cps.update(range(lo, hi + 1))
    cps.update(map(ord, "繁简"))
    return {cp for cp in cps if is_cjk(cp)}


def fetch_source():
    print(f"Downloading {SRC_URL}")
    data = urllib.request.urlopen(SRC_URL).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED_SHA256:
        sys.exit(f"Checksum mismatch: got {digest}, expected {EXPECTED_SHA256}")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:bz2") as tar:
        ttc = tar.extractfile(PREFIX + "ukai.ttc").read()
        license_txt = tar.extractfile(PREFIX + "license/english/ARPHICPL.TXT").read()
    return ttc, license_txt


def build():
    ttc, license_txt = fetch_source()
    keep = dictionary_codepoints()
    OUT.mkdir(exist_ok=True)
    today = date.today().isoformat()

    font = TTCollection(io.BytesIO(ttc)).fonts[FACE_INDEX]
    unicodes = sorted(keep & set(font.getBestCmap()))

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = False  # TrueType hints aren't used at side-panel sizes
    options.drop_tables += ["FFTM"]  # FontForge timestamp
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    notice = (f"Modified {today} for the Zhongwen character sidebar extension: "
              f"extracted the AR PL UKai TW face from ukai.ttc 0.2.20080216, "
              f"subset to {len(unicodes)} CJK characters used by CC-CEDICT, removed "
              f"hinting, renamed to \"{FAMILY}\", converted to WOFF2. "
              f"Build script: scripts/build-fonts.py. "
              f"Licensed under the Arphic Public License (ARPHICPL.TXT).")
    name = font["name"]
    old_version = name.getDebugName(5) or ""
    for rec in list(name.names):
        if rec.nameID in (1, 3, 4, 5, 6, 10, 16, 17):
            name.removeNames(nameID=rec.nameID)
    name.setName(FAMILY, 1, 3, 1, 0x409)
    name.setName("Regular", 2, 3, 1, 0x409)
    name.setName(f"{FAMILY}; {today}", 3, 3, 1, 0x409)
    name.setName(FAMILY, 4, 3, 1, 0x409)
    name.setName(f"{old_version.strip()}; modified {today}", 5, 3, 1, 0x409)
    name.setName(FAMILY.replace(" ", ""), 6, 3, 1, 0x409)
    name.setName(notice, 10, 3, 1, 0x409)  # description

    out = OUT / FILENAME
    font.flavor = "woff2"
    font.save(out)
    print(f"✓ extension/fonts/{FILENAME}  {out.stat().st_size / 1e6:.1f} MB  "
          f"({len(unicodes)} of {len(keep)} dictionary characters; the rest use system fonts)")

    (OUT / "ARPHICPL.TXT").write_bytes(license_txt)
    print("✓ extension/fonts/ARPHICPL.TXT (unaltered)")


if __name__ == "__main__":
    build()
