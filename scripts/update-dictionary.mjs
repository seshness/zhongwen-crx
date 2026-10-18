#!/usr/bin/env node
// Downloads the latest CC-CEDICT into data/cedict_ts.u8.
//
//   node scripts/update-dictionary.mjs           download and install
//   node scripts/update-dictionary.mjs --check   only report whether an update exists
//   node scripts/update-dictionary.mjs --force   reinstall even if already current
//
// Set CEDICT_URL to download from a mirror (must serve the .txt.gz export).
//
// The download is validated (gzip, header, every line parses, entry count
// matches the header) before it replaces the current file, so a failed or
// partial download never leaves the extension with a broken dictionary.

import { gunzipSync } from 'node:zlib';
import { readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_GZ = process.env.CEDICT_URL ||
  'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'data', 'cedict_ts.u8');
// Same pattern sidepanel/dict.js uses to parse entries.
const LINE_RE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const force = args.has('--force');

function parse(text) {
  const meta = {};
  const entries = new Set();
  const bad = [];
  text.split('\n').forEach((line, i) => {
    line = line.replace(/\r$/, '');
    if (!line) return;
    if (line.startsWith('#!')) {
      const m = /^#!\s*(\w+)=(.*)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim();
      return;
    }
    if (line.startsWith('#')) return;
    if (LINE_RE.test(line)) entries.add(line);
    else bad.push(`  line ${i + 1}: ${line.slice(0, 80)}`);
  });
  return { meta, entries, bad };
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

let current = null;
try {
  current = parse(await readFile(DEST, 'utf8'));
} catch {
  console.log('No existing dictionary found; installing fresh.');
}

console.log(`Downloading ${URL_GZ}`);
let gz;
try {
  const res = await fetch(URL_GZ);
  if (!res.ok) fail(`Download failed: HTTP ${res.status} ${res.statusText}`);
  gz = Buffer.from(await res.arrayBuffer());
} catch (err) {
  fail(`Download failed: ${err.message}`);
}

let text;
try {
  text = gunzipSync(gz).toString('utf8');
} catch (err) {
  fail(`Downloaded file is not valid gzip (${err.message})`);
}

const next = parse(text);
if (!next.meta.date || !next.meta.entries) fail('Downloaded file is missing the CC-CEDICT header.');
if (next.bad.length) {
  fail(`${next.bad.length} line(s) don't match the CC-CEDICT format:\n${next.bad.slice(0, 10).join('\n')}`);
}
const expected = Number(next.meta.entries);
// Count every entry line, including any exact duplicates, to compare with the header.
const lineCount = text.split('\n').filter((l) => l && !l.startsWith('#')).length;
if (lineCount !== expected) fail(`Header says ${expected} entries but file has ${lineCount}.`);

const curDate = current?.meta.date;
console.log(`Installed: ${curDate ?? 'none'}${current ? ` (${current.entries.size} entries)` : ''}`);
console.log(`Latest:    ${next.meta.date} (${expected} entries)`);

if (curDate === next.meta.date && !force) {
  console.log('✓ Dictionary is already up to date.');
  process.exit(0);
}

if (current) {
  let added = 0, removed = 0;
  for (const l of next.entries) if (!current.entries.has(l)) added++;
  for (const l of current.entries) if (!next.entries.has(l)) removed++;
  // Edited entries count once on each side.
  console.log(`Changes:   ${added} new or edited line(s), ${removed} removed or replaced line(s)`);
}

if (checkOnly) {
  console.log('Run without --check to install the update.');
  process.exit(curDate === next.meta.date ? 0 : 2);
}

// Write next to the destination, keep one backup, then swap atomically.
const tmp = `${DEST}.download`;
await writeFile(tmp, text, 'utf8');
if (current) await copyFile(DEST, `${DEST}.bak`);
await rename(tmp, DEST);

const { size } = await stat(DEST);
console.log(`✓ Installed ${path.relative(ROOT, DEST)} (${(size / 1e6).toFixed(1)} MB).`);
if (current) console.log(`  Previous version saved as ${path.relative(ROOT, DEST)}.bak`);
console.log('  Reload the extension in chrome://extensions to use it.');
