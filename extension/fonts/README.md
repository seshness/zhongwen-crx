# Bundled font

`ukai.woff2` is a modified version of **AR PL UKai**, a Kai (楷书) style CJK
font. It is used for all Chinese characters in the side panel.

- Original fonts: Copyright (C) 1999 Arphic Technology Co., Ltd., released
  under the Arphic Public License.
- AR PL UKai: Arne Goetje and the CJK Unifonts contributors
  (https://www.freedesktop.org/wiki/Software/CJKUnifonts/), version 0.2.20080216.
- License: **Arphic Public License**; see [ARPHICPL.TXT](ARPHICPL.TXT), included
  unaltered. This license applies to the font only, not to the rest of the
  repository (MIT) or the dictionary data (CC BY-SA 4.0).

## Modifications

As required by section 2(a) of the Arphic Public License:

> Modified on 2026-10-18 by the Zhongwen character sidebar project: the
> "AR PL UKai TW" face was extracted from `ukai.ttc` (version 0.2.20080216, from
> `fonts-arphic-ukai_0.2.20080216.2.orig.tar.bz2`, SHA-256
> `b4968d73…ae3d2`), subset to the 13,701 CJK characters used by CC-CEDICT
> plus CJK punctuation, stripped of TrueType hinting and the FontForge
> timestamp table, renamed to "ZW UKai", and converted to WOFF2.

The same notice is embedded in the font's name table (description field). The
modified font is freely available in this repository, and it can be rebuilt
from the original with:

```sh
uv run scripts/build-fonts.py
```
