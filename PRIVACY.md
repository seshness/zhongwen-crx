# Privacy Policy — Zhongwen character sidebar

_Last updated: 18 October 2026_

Zhongwen character sidebar is a Chinese-English dictionary that runs entirely inside your
browser. It has no servers, no accounts, no analytics and no advertising.

## What the extension accesses

**Text you highlight on web pages.** When you select text on a page, the
extension checks whether it contains Chinese characters. If it does, up to 300
characters of the selection are passed to the extension's side panel so they
can be looked up. Selections without Chinese characters are ignored. The
extension does not read any other content of the pages you visit, and it does
not record which pages you visit.

## What is stored, and where

All data stays on your device:

| Data | Where | How long |
| --- | --- | --- |
| The most recent Chinese text you highlighted | `chrome.storage.session` (in memory) | Until you clear it with the ✕ button or close the browser |
| Your Traditional/Simplified preference | `chrome.storage.local` | Until you uninstall the extension |
| Your back/forward lookup history | The side panel's memory | Until you clear it or close the side panel |

The dictionary (CC-CEDICT) and the Chinese font (AR PL UKai) are bundled with
the extension, so lookups never leave your computer and no web fonts are
downloaded.

## What is shared

The extension itself sends no data anywhere. It does not sell, transfer or
share your data with anyone, and does not use it for any purpose other than
showing dictionary entries.

**Pronunciation.** When you press a speaker button, the word is spoken by
Chrome's built-in text-to-speech. The extension prefers voices installed on
your device. If your device has no Mandarin voice, Chrome may use a Google
online voice instead; in that case Chrome sends the word being spoken to
Google's speech service, under
[Google's Privacy Policy](https://policies.google.com/privacy). You can avoid
this by installing a Mandarin voice in your operating system's settings.

**Links.** The "CC-CEDICT" credit link opens the dictionary publisher's website
only if you click it.

## Permissions

| Permission | Why |
| --- | --- |
| Read and change data on all websites (`<all_urls>`, `scripting`) | To notice when you highlight Chinese text on any page. The script only reads your selection. |
| Side panel (`sidePanel`) | To show the dictionary beside the page. |
| Storage (`storage`) | To remember your Traditional/Simplified choice and the last highlighted text, as described above. |
| Text-to-speech (`tts`) | To pronounce words. |
| Context menus (`contextMenus`) | To add "Look up in Zhongwen character sidebar" to the right-click menu. |

## Changes

If this policy changes, the updated version will be published at
https://github.com/seshness/zhongwen-crx/blob/main/PRIVACY.md with a new
"Last updated" date. The full history of this file is visible in the
repository.

## Contact

Questions or concerns: open an issue at
https://github.com/seshness/zhongwen-crx/issues
