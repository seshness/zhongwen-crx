# Chrome Web Store submission — BETA item

The beta is a **separate, unlisted item** in the Developer Dashboard, published
in parallel with the production item so testers get changes first. It's built
from the same source:

```sh
git commit ...            # each beta upload needs a new commit (build number)
npm run package:beta      # → dist/zhongwen-character-sidebar-beta-<version>.zip
```

The beta package gets the name "… BETA", a description starting with
"THIS EXTENSION IS FOR BETA TESTING", the slate icons from `beta/icons/`, a
version with a 4th component (the git commit count, e.g. `1.0.1.6`), a
"BETA · Send feedback" row in the side panel, and analytics tagged
`channel=beta`. The store requires the BETA name and description labels on a
parallel test version; without them both items can be taken down as
repetitive content
([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/#publish_a_test_version)).

## Setup (once)

- [ ] In the Developer Dashboard, click **New item** and upload the beta zip.
      This creates a second item with its own extension ID; don't upload the
      beta zip to the production item.
- [ ] Fill in the tabs below, set **Visibility: Unlisted**, and submit.
- [ ] Once approved, share the item's store link with testers. Unlisted items
      are installable by anyone with the link but don't appear in search.

## Each beta release

1. Commit, then `npm run package:beta` (it warns if the tree is dirty).
2. Upload the zip to the **beta** item → Submit for review.
3. When it's ready for everyone, `npm run package:zip` and upload to the
   production item. Bump `version` in `extension/manifest.json` and
   `package.json` before a production release so it's higher than the last one.

---

## Store listing tab

**Name** — comes from the package: `Zhongwen character sidebar BETA`

**Summary** — comes from the package:

> THIS EXTENSION IS FOR BETA TESTING. Highlight Chinese text to see pinyin, definitions and audio in the side panel.

**Category** — Education

**Language** — English

**Description**

> THIS EXTENSION IS FOR BETA TESTING.
>
> This is the early-access version of Zhongwen character sidebar, used to try new features before they reach the regular version. It may change often and can contain bugs. If you just want the dictionary, install the regular version instead.
>
> Please report problems and ideas with the "Send feedback" link at the bottom of the side panel, or at https://github.com/seshness/zhongwen-crx/issues.
>
> WHAT IT DOES
> Highlight Chinese text on a web page and the side panel shows each word's characters, tone-coloured pinyin, English definitions and pronunciation. Highlight a sentence for a scrolling list of every word in it; click a word for its own page with its characters and related words; follow words linked inside definitions; switch between Traditional and Simplified; search by Chinese, pinyin or English. Works offline with the built-in CC-CEDICT dictionary.
>
> HOW TO USE
> Click the toolbar icon (or press Alt+Shift+Z) to open the side panel, then highlight Chinese text on the page. Right-click a selection on any page and choose "Look up in Zhongwen character sidebar BETA". To have highlights looked up on every site, tick "Look up highlights on every site" at the bottom of the side panel.
>
> PRIVACY
> Lookups happen entirely on your computer. The extension sends anonymous feature-usage statistics (never the words you look up or the pages you visit) to Google Analytics; turn this off at the bottom of the side panel. Details: https://github.com/seshness/zhongwen-crx/blob/main/PRIVACY.md
>
> CREDITS
> Dictionary data: CC-CEDICT (https://www.mdbg.net/chinese/dictionary?page=cc-cedict), licensed under CC BY-SA 4.0.
> Font: AR PL UKai, © 1999 Arphic Technology Co., Ltd. and the CJK Unifonts contributors, modified and distributed under the Arphic Public License.
> Source code (MIT): https://github.com/seshness/zhongwen-crx

**Graphic assets**

| Field | File |
| --- | --- |
| Store icon | `beta/icons/icon128.png` (slate, with BETA band) |
| Screenshots | same as production: `store/screenshot-1.png` … `screenshot-4.png` |
| Small promo tile | `store/promo-small.png` |

---

## Privacy tab

Identical to production. Copy the single purpose, permission
justifications, remote code answer, data usage and certifications from
[`LISTING.md`](LISTING.md#privacy-tab). Same privacy policy URL:
https://github.com/seshness/zhongwen-crx/blob/main/PRIVACY.md

## Distribution tab

- **Visibility: Unlisted**
- Regions: All regions
- Pricing: Free
