#!/usr/bin/env node
// Packages the extension into dist/:
//
//   <name>-<version>.zip   upload this to the Chrome Web Store (the store signs it)
//   <name>-<version>.crx   signed CRX3 for self-hosting / enterprise installs
//
//   node scripts/package.mjs              build both
//   node scripts/package.mjs --zip        store zip only
//   node scripts/package.mjs --crx        crx only
//   node scripts/package.mjs --beta       unlisted BETA build (zip only), see below
//   node scripts/package.mjs --no-analytics   build with analytics disabled
//   node scripts/package.mjs --key PATH   signing key (default
//                                         ~/.config/zhongwen-crx/extension.pem,
//                                         or $CRX_KEY); created if missing
//
// The CRX signing key determines the extension ID for self-hosted installs.
// Keep it secret and back it up: losing it means a new ID, and a leaked key
// lets anyone ship updates as you. It is not needed for Web Store uploads.
// It lives outside the project so it is never inside the folder Chrome loads
// with "Load unpacked" (Chrome warns about .pem files there) or in git.
//
// Google Analytics credentials are read from $GA_MEASUREMENT_ID and
// $GA_API_SECRET, or from ~/.config/zhongwen-crx/analytics.json:
//   { "measurementId": "G-XXXXXXXXXX", "apiSecret": "..." }
// and written into the package's analytics-config.js. The copy in the
// repository stays empty, so unpacked dev builds send nothing.
//
// BETA builds are uploaded as a separate, unlisted Web Store item. Per the
// store's rules (developer.chrome.com/docs/webstore/cws-dashboard-distribution),
// the name ends in "BETA" and the description starts with "THIS EXTENSION IS
// FOR BETA TESTING", or both items risk takedown as repetitive content. The
// beta package gets that name and description, the icons from beta/icons/, a
// fourth version component (the git commit count, so every upload is newer)
// and analytics events tagged channel=beta. The source in extension/ is
// shared and unchanged.
//
// No dependencies; requires Node 18+.

import { readFile, writeFile, mkdir, readdir, stat, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

// The package is everything in extension/ (which holds only runtime files)
// plus the repository LICENSE; backups, dotfiles and keys are skipped.
const EXTRA = { LICENSE: path.join(ROOT, 'LICENSE') };
const EXCLUDE = [/(^|\/)\./, /\.bak$/, /\.download$/, /\.pem$/];

// ---- CLI ------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const keyArg = argv.includes('--key') ? argv[argv.indexOf('--key') + 1] : null;
const wantZip = flag('--zip') || !flag('--crx');
const wantCrx = !flag('--beta') && (flag('--crx') || !flag('--zip'));
const CONFIG_DIR = path.join(os.homedir(), '.config', 'zhongwen-crx');
const DEFAULT_KEY = path.join(CONFIG_DIR, 'extension.pem');
const ANALYTICS_CONFIG = path.join(CONFIG_DIR, 'analytics.json');
const KEY_PATH = path.resolve(keyArg || process.env.CRX_KEY || DEFAULT_KEY);
if (KEY_PATH.startsWith(ROOT + path.sep)) {
  fail(`Signing key ${KEY_PATH} is inside the project; keep it outside so it can't be loaded or committed.`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---- Collect & validate ---------------------------------------------------

async function walk(rel = '') {
  const abs = path.join(EXT, rel);
  if ((await stat(abs)).isFile()) return [rel];
  const out = [];
  for (const name of (await readdir(abs)).sort()) out.push(...(await walk(path.posix.join(rel, name))));
  return out;
}

if (!existsSync(path.join(EXT, 'manifest.json'))) fail('extension/manifest.json not found');
const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
const beta = flag('--beta');
// Package path -> replacement contents.
const overrides = new Map();
// Package path -> source path on disk.
const sources = new Map();
for (const rel of await walk()) if (!EXCLUDE.some((re) => re.test(rel))) sources.set(rel, path.join(EXT, rel));
for (const [rel, abs] of Object.entries(EXTRA)) {
  if (!existsSync(abs)) fail(`Missing ${path.relative(ROOT, abs)}`);
  sources.set(rel, abs);
}
const files = [...sources.keys()];

// ---- BETA variant -----------------------------------------------------------

const BETA_DIR = path.join(ROOT, 'beta');
const BETA_DESCRIPTION =
  'THIS EXTENSION IS FOR BETA TESTING. Highlight Chinese text to see pinyin, definitions and audio in the side panel.';

if (beta) {
  if (flag('--crx')) fail('--beta builds are for the Web Store only (zip)');
  let build, sha = 'unknown';
  try {
    build = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: ROOT }).toString().trim());
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
    // Uncommitted changes would reuse the last commit's build number.
    if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim()) {
      sha += '-dirty';
      console.warn('! Working tree has uncommitted changes; commit first so this build gets a new number.');
    }
  } catch {
    fail('--beta needs git to number the build');
  }
  if (manifest.version.split('.').length > 3) fail('Use a 3-part manifest version; --beta adds the 4th');
  const productionName = manifest.name;
  manifest.name = `${productionName} BETA`;
  manifest.version = `${manifest.version}.${build}`;
  manifest.version_name = `${manifest.version} beta (${sha})`;
  manifest.description = BETA_DESCRIPTION;
  manifest.action.default_title = `Open ${manifest.name}`;
  manifest.commands._execute_action.description = `Open the ${manifest.name}`;
  overrides.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  for (const rel of Object.values(manifest.icons)) {
    const src = path.join(BETA_DIR, rel);
    if (!existsSync(src)) fail(`Missing beta icon ${path.relative(ROOT, src)} (run node scripts/store-assets.mjs)`);
    sources.set(rel, src);
  }
  if (!manifest.name.endsWith(' BETA')) fail('Beta name must end with "BETA"');
  if (!manifest.description.startsWith('THIS EXTENSION IS FOR BETA TESTING')) fail('Beta description label missing');
  if (manifest.name === productionName) fail('Beta name must differ from production');
}

// ---- Analytics credentials -------------------------------------------------

async function analyticsCredentials() {
  if (flag('--no-analytics')) return null;
  let id = process.env.GA_MEASUREMENT_ID;
  let secret = process.env.GA_API_SECRET;
  if (!id && !secret && existsSync(ANALYTICS_CONFIG)) {
    const cfg = JSON.parse(await readFile(ANALYTICS_CONFIG, 'utf8'));
    id = cfg.measurementId;
    secret = cfg.apiSecret;
  }
  if (!id && !secret) return null;
  if (!/^G-[A-Z0-9]+$/.test(id || '')) fail(`Invalid GA measurement ID "${id}" (expected G-XXXXXXXXXX)`);
  if (!secret) fail('GA measurement ID is set but the API secret is missing');
  return { id, secret };
}

const ga = await analyticsCredentials();
const channel = beta ? 'beta' : 'production';
if (ga) {
  overrides.set('analytics-config.js',
    `// Generated by scripts/package.mjs.\nexport const MEASUREMENT_ID = ${JSON.stringify(ga.id)};\n` +
    `export const API_SECRET = ${JSON.stringify(ga.secret)};\n` +
    `export const CHANNEL = ${JSON.stringify(channel)};\n`);
}

// Every file the manifest points at must be in the package.
const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const ref of referenced) if (!sources.has(ref)) fail(`manifest.json references ${ref}, which is not packaged`);
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`Invalid manifest version "${manifest.version}"`);
if ((manifest.description || '').length > 132) fail('manifest description exceeds 132 characters');

// ---- ZIP ------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (1980-01-01) so identical sources produce identical zips.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

async function buildZip(paths) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const rel of paths) {
    const data = overrides.has(rel) ? Buffer.from(overrides.get(rel), 'utf8') : await readFile(sources.get(rel));
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: Unix, v2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(paths.length, 8);
  end.writeUInt16LE(paths.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---- CRX3 -----------------------------------------------------------------
// Format: "Cr24" | u32 version=3 | u32 header length | CrxFileHeader | zip
// CrxFileHeader (protobuf):
//   2:     AsymmetricKeyProof sha256_with_rsa { 1: public_key, 2: signature }
//   10000: bytes signed_header_data = SignedData { 1: crx_id (16 bytes) }
// The signature covers "CRX3 SignedData\0" | u32 len(signed_header_data) |
// signed_header_data | zip.

function varint(n) {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}
const field = (num, bytes) => Buffer.concat([varint((num << 3) | 2), varint(bytes.length), bytes]);

async function loadOrCreateKey() {
  if (existsSync(KEY_PATH)) return crypto.createPrivateKey(await readFile(KEY_PATH));
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await mkdir(path.dirname(KEY_PATH), { recursive: true });
  await writeFile(KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await chmod(KEY_PATH, 0o600);
  console.log(`! Created new signing key ${KEY_PATH} — back it up and keep it private.`);
  return privateKey;
}

function buildCrx(zip, privateKey) {
  const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const crxId = crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16);
  const signedData = field(1, crxId);

  const len = Buffer.alloc(4);
  len.writeUInt32LE(signedData.length);
  const signature = crypto.sign('sha256',
    Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'binary'), len, signedData, zip]), privateKey);

  const header = Buffer.concat([
    field(2, Buffer.concat([field(1, publicKey), field(2, signature)])),
    field(10000, signedData),
  ]);
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'binary');
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);

  // Extension IDs are the crx_id in hex, using the letters a–p for 0–f.
  const id = [...crxId.toString('hex')].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
  return { crx: Buffer.concat([prefix, header, zip]), id };
}

// ---- Main -----------------------------------------------------------------

const base = `${(manifest.name || 'extension').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${manifest.version}`;
await mkdir(DIST, { recursive: true });
const zip = await buildZip(files);
const mb = (b) => `${(b.length / 1e6).toFixed(2)} MB`;

console.log(`Packaging ${manifest.name} ${manifest.version_name || manifest.version} (${files.length} files)`);
console.log(ga ? `  Analytics: enabled (${ga.id}, channel=${channel})`
  : `  Analytics: disabled — no credentials (see ${path.relative(os.homedir(), ANALYTICS_CONFIG).replace(/^/, '~/')})`);
if (wantZip) {
  const out = path.join(DIST, `${base}.zip`);
  await writeFile(out, zip);
  console.log(`✓ ${path.relative(ROOT, out)}  ${mb(zip)}  ← upload to the Chrome Web Store`);
}
if (wantCrx) {
  const { crx, id } = buildCrx(zip, await loadOrCreateKey());
  const out = path.join(DIST, `${base}.crx`);
  await writeFile(out, crx);
  console.log(`✓ ${path.relative(ROOT, out)}  ${mb(crx)}  extension ID ${id}`);
}
