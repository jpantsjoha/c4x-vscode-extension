'use strict';
// Stale-bundle detection for the headless render bundles (#353, #352):
// each bundle carries, in its banner, a SHA-256 over the
// first-party source files esbuild built it from. The equality and
// provenance tests rebuild the input list in memory, hash those files in the
// working tree, and fail when a committed bundle was built from other
// sources, with a message that names the bundle.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** The banner token esbuild.config.js replaces with the hash once the build has its metafile. */
const ENGINE_HASH_PLACEHOLDER = 'C4X_ENGINE_SHA256_PENDING';
const ENGINE_HASH_PATTERN = /c4x-engine-sha256: ([0-9a-f]{64})/;

/** First-party inputs of a metafile, as sorted forward-slash paths relative to `root`. */
function firstPartyInputs(metafile, root) {
    return Object.keys(metafile.inputs)
        .filter(input => !input.includes('node_modules'))
        .map(input => path.relative(root, path.resolve(root, input)).split(path.sep).join('/'))
        .sort();
}

/** SHA-256 over each input's path and its text with line endings normalised. */
function engineHash(inputs, root) {
    const hash = crypto.createHash('sha256');
    for (const input of inputs) {
        const text = fs.readFileSync(path.join(root, input), 'utf8').replace(/\r\n/g, '\n');
        hash.update(input).update('\0').update(text).update('\0');
    }
    return hash.digest('hex');
}

/** The hash a committed bundle carries, or undefined. */
function bundleEngineHash(bundleText) {
    return ENGINE_HASH_PATTERN.exec(bundleText.slice(0, 4096))?.[1];
}

module.exports = { ENGINE_HASH_PLACEHOLDER, ENGINE_HASH_PATTERN, bundleEngineHash, engineHash, firstPartyInputs };
