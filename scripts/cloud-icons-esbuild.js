'use strict';
// Stamps the SHA-256 of data/cloud-icons.json into the bundles that draw icons (#534). The digest is
// read on every build, not once at process start, and the data file is a watched input, so
// regenerating the icons under `pnpm watch` rebuilds the bundles against the new digest.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'cloud-icons.json');
const DECLARATION = /declare const __C4X_CLOUD_ICONS_SHA256__: string \| undefined;/;

/** The SHA-256 of the icon data file as it is now. */
function cloudIconsDigest(file = DATA_FILE) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** src/assets/cloudIcons.ts with its build-time constant bound to `digest`. */
function stampDigest(source, digest) {
  if (!DECLARATION.test(source)) throw new Error('src/assets/cloudIcons.ts no longer declares __C4X_CLOUD_ICONS_SHA256__');
  return source.replace(DECLARATION, `const __C4X_CLOUD_ICONS_SHA256__: string | undefined = ${JSON.stringify(digest)};`);
}

function cloudIconsPlugin({ file = DATA_FILE } = {}) {
  return {
    name: 'c4x-cloud-icons-digest',
    setup(build) {
      // onLoad runs again on every rebuild, so the digest is current for each one.
      build.onLoad({ filter: /[\\/]src[\\/]assets[\\/]cloudIcons\.ts$/ }, args => ({
        contents: stampDigest(fs.readFileSync(args.path, 'utf8'), cloudIconsDigest(file)),
        loader: 'ts',
        watchFiles: [file],
      }));
    },
  };
}

module.exports = { DATA_FILE, cloudIconsDigest, cloudIconsPlugin, stampDigest };
