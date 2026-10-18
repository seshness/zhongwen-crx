#!/usr/bin/env node
// Renders Chrome Web Store images into store/ using headless Chrome:
//
//   screenshot-1..4.png   1280x800  the real side panel beside a sample article
//   promo-small.png        440x280  small promo tile (required)
//   promo-marquee.png     1400x560  marquee promo tile (optional)
//
//   node scripts/store-assets.mjs
//
// The side panel is the actual sidepanel.html with the chrome.* APIs stubbed,
// so re-run this after UI changes. Set CHROME to the Chrome binary if it isn't
// in the default location.

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'store');
const CHROME = process.env.CHROME || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform] || 'google-chrome';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.u8': 'text/plain; charset=utf-8' };

// ---- Pages ------------------------------------------------------------------

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
const HANT = `"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
// The bundled Kai font the side panel uses for Chinese characters.
const KAI_FACE = `@font-face { font-family: "ZW UKai"; src: url("/fonts/ukai.woff2") format("woff2"); }`;
const KAI = `"ZW UKai", ${HANT}`;

// Side panel with chrome.* stubbed; ?text= is the "highlighted" text.
async function panelPage(q) {
  const html = await readFile(path.join(EXT, 'sidepanel/sidepanel.html'), 'utf8');
  const stub = `<base href="/sidepanel/"><script>
    window.chrome = {
      runtime: { getURL: (p) => '/' + p },
      tts: { getVoices: async () => [], speak() {} },
      storage: {
        onChanged: { addListener() {} },
        local: { get: async () => ({ script: ${JSON.stringify(q.get('script') || 'trad')} }), set() {} },
        session: { remove() {}, get: async () => ({ lastSelection: { text: ${JSON.stringify(q.get('text') || '')} } }) },
      },
    };</script>`;
  return html.replace('<head>', `<head>${stub}`);
}

// Original sample text (not taken from any real site).
const ARTICLE = [
  '學習中文的時候，每天閱讀一點新聞或故事是很好的方法。',
  '遇到不認識的詞，只要選取它，就能馬上看到拼音、意思和發音。',
  '慢慢地，你會發現自己認識的漢字越來越多，閱讀也變得越來越輕鬆。',
];

function screenshotPage(q) {
  const highlight = q.get('highlight') || '';
  const dark = q.get('dark') === '1';
  const body = ARTICLE.map((p) => `<p>${highlight && p.includes(highlight)
    ? p.replace(highlight, `<mark>${highlight}</mark>`) : p}</p>`).join('');
  const panel = `/panel?${new URLSearchParams({ text: q.get('text') || highlight, script: q.get('script') || 'trad' })}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: ${dark ? 'dark' : 'light'}; }
    body { margin: 0; display: flex; height: 800px; font-family: ${FONT};
      background: ${dark ? '#121212' : '#ffffff'}; color: ${dark ? '#e8e3dc' : '#1f1c19'}; }
    .page { flex: 1; padding: 70px 72px; overflow: hidden; }
    .kicker { color: #b5382a; font-size: 14px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 10px 0 28px; font: 600 40px/1.3 ${HANT}; }
    p { margin: 0 0 22px; font: 24px/1.9 ${HANT}; }
    mark { background: ${dark ? '#2f5bb7' : '#b4d2ff'}; color: inherit; border-radius: 2px; }
    iframe { width: 420px; height: 800px; border: 0; border-left: 1px solid ${dark ? '#333' : '#dcd6cc'}; }
  </style></head><body>
    <div class="page"><div class="kicker">Reading practice</div><h1>每天讀一點中文</h1>${body}</div>
    <iframe src="${panel}"></iframe>
  </body></html>`;
}

// Promo tiles: the icon and a few tone-coloured characters, no copy text.
function promoPage(q) {
  const big = q.get('size') === 'marquee';
  // One character per tone: zhōng wén hěn bàng.
  const chars = [['中', 't1', 'zhōng'], ['文', 't2', 'wén'], ['很', 't3', 'hěn'], ['棒', 't4', 'bàng']];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${KAI_FACE}
    body { margin: 0; width: ${big ? 1400 : 880}px; height: 560px; display: flex;
      align-items: center; justify-content: center; gap: ${big ? 90 : 56}px;
      background: radial-gradient(circle at 30% 20%, #fffaf2, #f3ebdf); font-family: ${FONT}; }
    .icon { width: ${big ? 200 : 180}px; height: ${big ? 200 : 180}px; display: grid; place-items: center;
      border-radius: ${big ? 44 : 40}px; background: #b5382a; color: #fff; box-shadow: 0 12px 30px rgba(120,40,20,.28);
      font: 600 ${big ? 136 : 124}px/1 ${HANT}; }  /* matches icons/icon128.png */
    .words { display: flex; gap: ${big ? 26 : 16}px; padding: ${big ? '34px 44px' : '28px 32px'};
      border-radius: 28px; background: #fff; box-shadow: 0 10px 40px rgba(80,50,20,.12); }
    .w { display: flex; flex-direction: column; align-items: center; }
    .py { font-size: ${big ? 30 : 24}px; font-weight: 500; }
    .hz { font: ${big ? 112 : 88}px/1.15 ${KAI}; }
    .t1 { color: #d23c2e; } .t2 { color: #d68a00; } .t3 { color: #2f9a4c; } .t4 { color: #2f6fd0; }
  </style></head><body>
    <div class="icon">中</div>
    <div class="words">${chars.map(([c, t, p]) =>
      `<div class="w"><span class="py ${t}">${p}</span><span class="hz ${t}">${c}</span></div>`).join('')}</div>
  </body></html>`;
}

// ---- Server -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    let body, type = 'text/html; charset=utf-8';
    if (url.pathname === '/panel') body = await panelPage(url.searchParams);
    else if (url.pathname === '/shot') body = screenshotPage(url.searchParams);
    else if (url.pathname === '/promo') body = promoPage(url.searchParams);
    else {
      const file = path.join(EXT, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ''));
      if (!file.startsWith(EXT)) throw new Error('outside extension/');
      body = await readFile(file);
      type = TYPES[path.extname(file)] || 'application/octet-stream';
    }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const run = promisify(execFile);
async function shoot(name, urlPath, [w, h], { scale = 1, dark = false } = {}) {
  const args = ['--headless', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000',
    `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`,
    `--screenshot=${path.join(OUT, name)}`];
  if (dark) args.push('--force-dark-mode', '--blink-settings=preferredColorScheme=0');
  await run(CHROME, [...args, base + urlPath]);
  console.log(`✓ store/${name}`);
}

await mkdir(OUT, { recursive: true });
const q = (o) => `?${new URLSearchParams(o)}`;
try {
  await shoot('screenshot-1.png', `/shot${q({ highlight: '每天閱讀一點新聞或故事' })}`, [1280, 800]);
  await shoot('screenshot-2.png', `/shot${q({ highlight: '字' })}`, [1280, 800]);
  await shoot('screenshot-3.png', `/shot${q({ highlight: '發音', script: 'simp' })}`, [1280, 800]);
  await shoot('screenshot-4.png', `/shot${q({ text: 'panda', dark: '1' })}`, [1280, 800], { dark: true });
  // Headless Chrome won't lay out narrower than 500px, so draw the small
  // tile at 2x and scale it down.
  await shoot('promo-small.png', `/promo${q({ size: 'small' })}`, [880, 560], { scale: 0.5 });
  await shoot('promo-marquee.png', `/promo${q({ size: 'marquee' })}`, [1400, 560]);
} catch (err) {
  console.error(`✗ ${err.message}\nSet CHROME to your Chrome binary if it isn't at ${CHROME}.`);
  process.exitCode = 1;
} finally {
  server.close();
}
