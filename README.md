# Zhongwen Sidebar

A Chrome extension for learning Chinese. Highlight Chinese text on any page and
the side panel shows each word's characters, tone-coloured pinyin, definitions
and pronunciation.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Click the toolbar icon (or press **Alt+Shift+Z**) to open the sidebar.

## Using it

- **Highlight** Chinese text on a page. A single word opens its entry; a phrase
  or sentence is split into words, each shown with pinyin, and you can click any
  word for its full entry.
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
- Right-click a selection and choose **Look up in Zhongwen sidebar**.

Entries also list the word's individual characters and common words that
contain it.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (side panel, TTS, content script) |
| `content.js` | Watches selections on pages and sends Chinese text to the extension |
| `background.js` | Opens the panel, context menu, injects into already-open tabs |
| `sidepanel/dict.js` | CC-CEDICT parsing, segmentation, pinyin tone marks, search |
| `sidepanel/sidepanel.*` | Sidebar UI |
| `data/cedict_ts.u8` | CC-CEDICT dictionary |
| `scripts/update-dictionary.mjs` | Downloads and installs the latest CC-CEDICT |

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
`data/cedict_ts.u8.bak`. Set `CEDICT_URL` to use a mirror.

Then reload the extension in `chrome://extensions`.

## Credits

Dictionary data is [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
