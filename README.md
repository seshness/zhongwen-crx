# Zhongwen character sidebar

A Chrome extension for learning Chinese. Highlight Chinese text on any page and
the side panel shows each word's characters, tone-coloured pinyin, definitions
and pronunciation.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension/` folder.
3. Click the toolbar icon (or press **Alt+Shift+Z**) to open the sidebar.

## Using it

- **Site access is opt-in.** The extension installs with no website access.
  Clicking the toolbar icon (or Alt+Shift+Z, or right-click → Look up) turns on
  highlight lookup in that tab until it navigates. Tick **Look up highlights on
  every site** at the bottom of the sidebar to have it work everywhere without
  clicking first (Chrome asks you to confirm; untick to revoke).
- **Highlight** Chinese text on a page. A single word opens its entry. A phrase
  or sentence is split into words and shown as a scrolling list of every word's
  pinyin, definitions and pronunciation, in order. Click a word (in the sentence
  or a card's headword / ›) to open its own page with its characters and
  "Words with …" list; Back returns you to the same spot in the list.
- **Linked words** in definitions (e.g. *see 開金*, *variant of …*, measure
  words) can be clicked. Use ← / → (or Alt+← / Alt+→) to go back and forward,
  and ✕ (or Esc) to clear the history and search box.
- **繁 / 简**: click to switch between Traditional (the default) and Simplified.
  Your choice is saved. The labels are also real characters: highlight 繁 or 简
  to look them up. Highlighting Chinese text anywhere in the sidebar looks it up.
- **Search box**: accepts Chinese, pinyin (`ni hao`, `ni3hao3`) or English.
- **Speaker button**: reads the word aloud with Chrome's text-to-speech, using a
  Taiwan Mandarin voice in Traditional mode and a Mainland one in Simplified
  mode if those voices are installed.
- Right-click a selection and choose **Look up in Zhongwen character sidebar**.

Entries also list the word's individual characters and common words that
contain it.

## Files

`extension/` holds exactly what Chrome loads; everything else is tooling and
docs.

| Path | Purpose |
| --- | --- |
| `extension/manifest.json` | MV3 manifest (side panel, TTS, content script) |
| `extension/content.js` | Watches selections on pages and sends Chinese text to the extension |
| `extension/background.js` | Opens the panel, context menu, injects the selection watcher (activeTab or opt-in all sites) |
| `extension/sidepanel/dict.js` | CC-CEDICT parsing, segmentation, pinyin tone marks, search |
| `extension/sidepanel/sidepanel.*` | Sidebar UI |
| `extension/data/` | CC-CEDICT dictionary and its license notice |
| `extension/fonts/` | Bundled Kai font and its license |
| `extension/icons/` | Toolbar and store icons |
| `extension/analytics.js` | Anonymous usage events (GA4 Measurement Protocol) |
| `extension/analytics-config.js` | GA credentials; empty in git, filled in by the package script |
| `scripts/update-dictionary.mjs` | Downloads and installs the latest CC-CEDICT |
| `scripts/package.mjs` | Builds the store `.zip` and signed `.crx` |
| `scripts/build-fonts.py` | Builds `extension/fonts/ukai.woff2` from the AR PL UKai source |
| `pyproject.toml`, `uv.lock` | Python tools for the font build (via uv) |
| `scripts/store-assets.mjs` | Renders store screenshots and promo tiles |
| `store/` | Store listing text and images (`LISTING.md`, `LISTING-BETA.md`) |
| `beta/icons/` | Icons swapped into BETA builds |
| `PRIVACY.md` | Privacy policy |

## Packaging

```sh
npm run package        # builds both files below into dist/
npm run package:zip    # dist/<name>-<version>.zip  → upload to the Chrome Web Store
npm run package:crx    # dist/<name>-<version>.crx  → signed, for self-hosting
npm run package:beta   # dist/<name>-beta-<version>.zip → the unlisted BETA item
```

The package is the contents of `extension/` plus `LICENSE` (backups, dotfiles
and keys are skipped), and the script checks that every file the manifest
references is included. Building the same sources twice gives identical zips.

The Web Store signs uploads itself, so the `.crx` is only for distributing
outside the store. It is signed with `~/.config/zhongwen-crx/extension.pem`
(or `--key PATH` / `$CRX_KEY`), which is created on first run and determines
the extension ID. **Back the key up and never commit it.** The script refuses
a key inside the project folder, since Chrome would see it when loading the
folder unpacked. Note that
Chrome on Windows and macOS only installs `.crx` files from outside the store
through enterprise policy.

## Beta channel

An unlisted **BETA** item runs in parallel with the production item for early
feedback. `npm run package:beta` builds it from the same source with the
store-required "BETA" name and "THIS EXTENSION IS FOR BETA TESTING"
description, the slate icons in `beta/icons/`, a 4th version component from
the git commit count, a "Send feedback" link in the side panel, and analytics
tagged `channel=beta`. See `store/LISTING-BETA.md`.

## Publishing to the Chrome Web Store

`store/LISTING.md` has everything the Developer Dashboard asks for (description,
permission justifications, privacy answers) plus a pre-submission checklist.
`PRIVACY.md` is the privacy policy, which must be hosted at a public URL.
Store images live in `store/` and are regenerated from the real UI with:

```sh
node scripts/store-assets.mjs
```

## Font

Chinese characters are shown in AR PL UKai, a free Kai (楷书) font close in
style to KaiTi, bundled as `extension/fonts/ukai.woff2` so it looks the same on every
system. It is trimmed to the characters the dictionary uses (4.3 MB). After
updating the dictionary, rebuild it so new characters are included:

```sh
uv run scripts/build-fonts.py
```

[uv](https://docs.astral.sh/uv/) installs the Python tools listed in
`pyproject.toml` (exact versions are pinned in `uv.lock`).

## Usage statistics

The extension can send anonymous feature-usage events to Google Analytics 4
via the [Measurement Protocol](https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4)
(`extension/analytics.js`). Events never include looked-up text or page URLs;
see `PRIVACY.md`. It's on by default in store builds, with a "Share anonymous
usage stats" checkbox at the bottom of the side panel to turn it off.

The credentials stay out of the repository. `extension/analytics-config.js` is
committed empty, which disables analytics for unpacked development builds.
`npm run package` writes the real values into the packaged copy of that file
from `$GA_MEASUREMENT_ID` / `$GA_API_SECRET` or from
`~/.config/zhongwen-crx/analytics.json`:

```json
{ "measurementId": "G-XXXXXXXXXX", "apiSecret": "..." }
```

Get them in Google Analytics under **Admin → Data streams → (your Web stream)**:
the Measurement ID is at the top, and **Measurement Protocol API secrets**
creates the secret. Use `--no-analytics` to build without them.

Every event has a `channel` parameter: `production`, `beta` (from
`npm run package:beta`), or `dev` (unpacked, which sends nothing). To filter
reports by it, register it once in GA: **Admin → Custom definitions → Create
custom dimension**, scope *Event*, event parameter `channel`. The same applies
to the other event parameters you want to break down (`source`, `view`,
`script`, …). The secret is
readable by anyone who unpacks the extension (unavoidable with the
Measurement Protocol); keeping it out of git just avoids advertising it.

## Updating the dictionary

CC-CEDICT is updated almost daily. To pull the latest (Node 18+, no
dependencies):

```sh
npm run update-dict      # download, validate and install the latest version
npm run check-dict       # just report whether a newer version exists (exit code 2 if so)
node scripts/update-dictionary.mjs --force   # reinstall even if current
```

The script checks the download (valid gzip, CC-CEDICT header, every line
parses, entry count matches the header) before swapping it in, so a failed
download never breaks the extension. The previous file is kept as
`extension/data/cedict_ts.u8.bak`. Set `CEDICT_URL` to use a mirror.

Then reload the extension in `chrome://extensions`.

## License

The source code is released under the [MIT License](LICENSE).

Two bundled third-party works keep their own licenses and are not covered by
the MIT License:

- The dictionary, [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict),
  is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  See [extension/data/README.md](extension/data/README.md).
- The Chinese font, a modified [AR PL UKai](https://www.freedesktop.org/wiki/Software/CJKUnifonts/),
  is licensed under the [Arphic Public License](extension/fonts/ARPHICPL.TXT). See
  [extension/fonts/README.md](extension/fonts/README.md) for attribution and the modification notice.
