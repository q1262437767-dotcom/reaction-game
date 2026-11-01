import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const PAGE_FILES = [
  'adventure/index.html',
  'adventure/style.css',
  'adventure/engine.js',
  'adventure/renderer.js',
  'adventure/net.js',
  'adventure/campaign.js',
  'adventure/cloud-config.js',
  'adventure/cloud.js',
  'adventure/account.js',
  'adventure/app.js'
];

export function measureTree(root) {
  const files = [];
  let raw = 0;
  let gzip = 0;
  for (const relative of PAGE_FILES) {
    const bytes = fs.readFileSync(path.join(root, relative));
    const compressed = zlib.gzipSync(bytes, { level: 6 }).length;
    files.push({ file: relative, raw: bytes.length, gzip: compressed });
    raw += bytes.length;
    gzip += compressed;
  }
  return { raw, gzip, files };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  console.log(JSON.stringify(measureTree(root), null, 2));
}
