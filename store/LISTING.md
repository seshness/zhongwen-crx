# Chrome Web Store submission

Everything the Developer Dashboard asks for, ready to paste. Re-generate the
images with `node scripts/store-assets.mjs`; build the upload with
`npm run package:zip` and upload `dist/<name>-<version>.zip`.

## Before submitting

- [ ] Commit and push `PRIVACY.md` so the privacy policy URL below resolves.
- [ ] Put the GA4 credentials in `~/.config/zhongwen-crx/analytics.json` and
      check `npm run package` prints "Analytics: enabled". Confirm events in
      GA4 **Realtime** (or DebugView) from the built package before uploading.
- [ ] Verify the developer account contact email in the dashboard.
- [ ] Load `dist/*.zip` (unzipped) via **Load unpacked** and do a final manual
      pass: icon click then highlight, right-click lookup, the "every site"
      checkbox (grant and revoke), 繁/简, back/forward, ✕, speaker, search,
      right-click lookup.

---

## Store listing tab

**Name** — Zhongwen character sidebar

**Summary** (manifest `description`, ≤132 chars)

> Highlight Chinese text on any page to see pinyin, definitions and pronunciation in the side panel.

**Category** — Education

**Language** — English

**Description**

> Learn Chinese while you read. Highlight any Chinese word or sentence on a web page and a side panel shows each word's characters, tone-coloured pinyin, English definitions and pronunciation.
>
> FEATURES
> • Highlight a sentence to get a scrolling list of every word in it, in order, each with pinyin, definitions and a speaker button.
> • Click any word to open its own page with a breakdown of its characters and a list of common words that contain it.
> • Words mentioned inside definitions (variants, "see also" references, measure words) are links. Follow them and use Back/Forward to retrace your steps.
> • Traditional characters by default, with a one-click switch to Simplified that's remembered. Both forms are always shown.
> • Search by Chinese, pinyin (with or without tone numbers) or English.
> • Pinyin and characters are coloured by tone to help you remember them.
> • Pronunciation uses your computer's Mandarin voice (Taiwan voice for Traditional, Mainland voice for Simplified when available).
> • Works offline: the full CC-CEDICT dictionary (125,000+ entries) is built in.
> • Chinese is shown in a Kai (楷书) brush-style font, the style used in textbooks, so stroke shapes are easy to learn from.
> • Light and dark themes follow your system.
>
> PRIVACY
> Lookups happen entirely on your computer, and the extension only reads text you highlight that contains Chinese characters. It sends anonymous feature-usage statistics (for example, "a lookup happened" or "the speaker was used", never the words you look up or the pages you visit) to Google Analytics; you can turn this off with one click at the bottom of the side panel. Full details: https://github.com/seshness/zhongwen-crx/blob/main/PRIVACY.md
>
> HOW TO USE
> Click the toolbar icon (or press Alt+Shift+Z) to open the side panel, then highlight Chinese text on the page. You can also right-click a selection on any page and choose "Look up in Zhongwen character sidebar". To have highlights looked up on every site without clicking the icon first, tick "Look up highlights on every site" at the bottom of the side panel.
>
> The extension asks for no website access when you install it: it only sees the tab you've invoked it in, unless you opt in to every site.
>
> CREDITS
> Dictionary data: CC-CEDICT (https://www.mdbg.net/chinese/dictionary?page=cc-cedict), licensed under CC BY-SA 4.0.
> Font: AR PL UKai, © 1999 Arphic Technology Co., Ltd. and the CJK Unifonts contributors, modified and distributed under the Arphic Public License.
> Source code (MIT): https://github.com/seshness/zhongwen-crx

**Graphic assets** (all in `store/`)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `extension/icons/icon128.png` | 128×128, 96×96 artwork + 16 px transparent padding |
| Screenshot 1 — sentence → word list | `store/screenshot-1.png` | 1280×800 |
| Screenshot 2 — character page + "Words with" | `store/screenshot-2.png` | 1280×800 |
| Screenshot 3 — Simplified mode | `store/screenshot-3.png` | 1280×800 |
| Screenshot 4 — English search, dark theme | `store/screenshot-4.png` | 1280×800 |
| Small promo tile | `store/promo-small.png` | 440×280 |
| Marquee promo tile (optional) | `store/promo-marquee.png` | 1400×560 |

---

## Privacy tab

**Single purpose**

> Look up Chinese words that the user highlights on web pages, showing their pinyin, definitions and pronunciation in the browser side panel.

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The extension's entire interface is a side panel that shows dictionary entries beside the page being read. |
| `storage` | Stores the user's Traditional/Simplified preference (local), the most recently highlighted text (session, in memory) so the side panel can display it when opened, and the anonymous usage-statistics ID and opt-out setting. |
| `tts` | Pronounces Chinese words when the user presses a speaker button. |
| `contextMenus` | Adds a "Look up in Zhongwen character sidebar" item for selected text. |
| `activeTab` | When the user clicks the toolbar icon, presses the shortcut, or uses the context menu, the extension adds its selection watcher to that tab so further highlights there are looked up. No site access is requested at install. |
| `scripting` | Injects the selection-watching content script into the active tab (via activeTab) and, only if the user opts in to all-sites access, registers it for all pages. |
| Optional host permission `<all_urls>` | Requested at runtime only when the user ticks "Look up highlights on every site" in the side panel, for users who want highlights looked up on any site without clicking the icon first. The script only reads the current selection, and only forwards it if it contains Chinese characters. Can be turned off in the side panel. |

**Remote code** — No, I am not using remote code. (All JavaScript is in the
package; the dictionary and font are bundled files.)

**Data usage** — check:

- [x] **Website content** — text the user highlights, when it contains Chinese
      characters. Processed locally to show dictionary entries; never
      transmitted.
- [x] **User activity** — anonymous feature-usage events (which buttons and
      lookup methods are used, no content), sent to Google Analytics with a
      random ID; on by default with an opt-out in the side panel.

Leave all other categories unchecked (no personally identifiable, health,
financial, authentication, personal communications, location or web history
data). The random analytics ID is not personally identifiable.

Certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL** — https://github.com/seshness/zhongwen-crx/blob/main/PRIVACY.md

**Homepage URL** — https://github.com/seshness/zhongwen-crx

**Support URL** — https://github.com/seshness/zhongwen-crx/issues

---

## Distribution tab

- Visibility: Public (or Unlisted for a soft launch)
- Regions: All regions
- Pricing: Free
