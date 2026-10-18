#!/usr/bin/env node
// Packages the extension into dist/:
//
//   <name>-<version>.zip   upload this to the Chrome Web Store (the store signs it)
//   <name>-<version>.crx   signed CRX3 for self-hosting / enterprise installs
//
//   node scripts/package.mjs              build both
//   node scripts/package.mjs --zip        store zip only
//   node scripts/package.mjs --crx        crx only
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
// No dependencies; requires Node 18+.

import { readFile, writeFile, mkdir, readdir, stat, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
const wantCrx = flag('--crx') || !flag('--zip');
const DEFAULT_KEY = path.join(os.homedir(), '.config', 'zhongwen-crx', 'extension.pem');
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
// Package path -> source path on disk.
const sources = new Map();
for (const rel of await walk()) if (!EXCLUDE.some((re) => re.test(rel))) sources.set(rel, path.join(EXT, rel));
for (const [rel, abs] of Object.entries(EXTRA)) {
  if (!existsSync(abs)) fail(`Missing ${path.relative(ROOT, abs)}`);
  sources.set(rel, abs);
}
const files = [...sources.keys()];

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
    const data = await readFile(sources.get(rel));
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

console.log(`Packaging ${manifest.name} ${manifest.version} (${files.length} files)`);
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
