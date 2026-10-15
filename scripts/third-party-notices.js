'use strict';
// Third-party licence notices for the VSIX.
//
// dist/extension.js inlines npm packages (markdown-it, dagre, lodash, the Gemini
// SDK, ...). MIT, BSD and Apache-2.0 all require their licence text, and an
// Apache-2.0 NOTICE file when one exists, to travel with redistributed code, so
// the package ships THIRD_PARTY_NOTICES.txt beside the bundle.
//
// The list is never written by hand. esbuild.config.js passes the extension
// build's metafile here, every bundled input under node_modules is resolved to
// its package, and the file is rebuilt on every build. A dependency change
// (#232 swaps @google/generative-ai for @google/genai and ~30 transitive
// packages) therefore changes the notices with no manual edit.
//
// The build fails when a bundled package has no licence file, declares no
// licence, or declares one outside ALLOWED_LICENSES. Widening the allowlist is a
// licence decision for the maintainer, not a build fix.
//
// Dependency-free on purpose: esbuild.config.js loads it in the public mirror,
// and scripts/test-vsix-smoke.js uses it to check the shipped bundle.
const fs = require('node:fs');
const path = require('node:path');

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

// SPDX identifiers C4X may redistribute in the VSIX. All permissive; each needs
// only its licence text (and, for Apache-2.0, any NOTICE file) to travel with
// the code. Only MIT, BSD-2-Clause, BSD-3-Clause and Apache-2.0 are bundled on main
// (2026-10-08); the rest cover the permissive licences npm packages commonly
// declare, so a routine transitive bump does not fail the build.
const ALLOWED_LICENSES = new Set([
    '0BSD',
    'Apache-2.0',
    'BlueOak-1.0.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'MIT',
]);

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[.-][\w.-]*)?$/i;
const NOTICE_FILE = /^notice(?:\.(?:md|txt))?$/i;

/** Forward slashes, so metafile paths, bundle comments and Windows paths compare alike. */
function toPosix(file) {
    return file.split(path.sep).join('/').replace(/\\/g, '/');
}

/**
 * The package a bundled module path belongs to: the directory after its last
 * `node_modules/` segment (two segments for a scoped name). Null for first-party
 * code. Walking up to the nearest package.json is not used, because packages
 * ship nested package.json files ({"type": "module"} and the like).
 */
function packageLocation(modulePath) {
    const normalised = toPosix(modulePath).replace(/^\(disabled\):/, '');
    const marker = normalised.lastIndexOf('node_modules/');
    if (marker === -1) {
        return null;
    }
    const rest = normalised.slice(marker + 'node_modules/'.length).split('/');
    const nameSegments = rest[0].startsWith('@') ? 2 : 1;
    if (rest.length <= nameSegments || !rest[0] || rest[0] === '.pnpm' || rest[0] === '.bin') {
        return null;
    }
    const name = rest.slice(0, nameSegments).join('/');
    return { name, directory: normalised.slice(0, marker) + 'node_modules/' + name };
}

/**
 * The SPDX expression a manifest declares, or null. Accepts the current
 * `license` string, the deprecated `{ type }` object, and the deprecated
 * `licenses` array (alternatives, so joined with OR).
 */
function declaredLicense(manifest) {
    const { license, licenses } = manifest;
    if (typeof license === 'string' && license.trim()) {
        return license.trim();
    }
    if (license && typeof license === 'object' && typeof license.type === 'string' && license.type.trim()) {
        return license.type.trim();
    }
    if (Array.isArray(licenses)) {
        const types = licenses
            .map(entry => (typeof entry === 'string' ? entry : entry && entry.type))
            .filter(type => typeof type === 'string' && type.trim())
            .map(type => type.trim());
        if (types.length === 1) {
            return types[0];
        }
        if (types.length > 1) {
            return `(${types.join(' OR ')})`;
        }
    }
    return null;
}

/**
 * Whether an SPDX expression is satisfiable from the allowlist: OR needs one
 * allowed branch, AND needs every operand allowed. `WITH` exceptions,
 * `LicenseRef-`, `SEE LICENSE IN`, `UNLICENSED` and anything unparsable are
 * refused, so they reach a person instead of the VSIX.
 */
function isAllowedLicense(expression, allowed = ALLOWED_LICENSES) {
    if (typeof expression !== 'string') {
        return false;
    }
    const tokens = expression.match(/\(|\)|[^\s()]+/g) || [];
    let position = 0;
    const peek = () => tokens[position];
    const next = () => tokens[position++];

    function primary() {
        const token = next();
        if (token === '(') {
            const value = disjunction();
            if (next() !== ')') {
                throw new Error('unbalanced');
            }
            return value;
        }
        if (!token || token === ')' || /^(?:AND|OR|WITH)$/i.test(token)) {
            throw new Error('operand expected');
        }
        if (peek() && /^WITH$/i.test(peek())) {
            next();
            next();
            return false;
        }
        return allowed.has(token);
    }
    function conjunction() {
        let value = primary();
        while (peek() && /^AND$/i.test(peek())) {
            next();
            value = primary() && value;
        }
        return value;
    }
    function disjunction() {
        let value = conjunction();
        while (peek() && /^OR$/i.test(peek())) {
            next();
            value = conjunction() || value;
        }
        return value;
    }

    try {
        const value = disjunction();
        return position === tokens.length && value;
    } catch {
        return false;
    }
}

function readText(file) {
    return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').trim();
}

// The permission notice each licence requires to travel with the code. A README
// section may stand in for a missing LICENSE file only when it carries this
// text for the declared licence (whitespace-insensitive). Apache-2.0 and every
// other licence have no entry, so they never use the fallback: Apache-2.0 4(a)
// requires a copy of the full licence, which a README summary is not.
const README_PERMISSION_NOTICE = {
    'MIT': /permission is hereby granted, free of charge, to any person obtaining a copy/i,
    'ISC': /permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted/i,
    'BSD-2-Clause': /redistribution and use in source and binary forms, with or without modification, are permitted/i,
    'BSD-3-Clause': /redistribution and use in source and binary forms, with or without modification, are permitted/i,
};

/** True when the README section carries the permission notice of every licence in the declared expression. */
function carriesPermissionNotice(section, license) {
    if (typeof license !== 'string') {
        return false;
    }
    const ids = license.split(/[\s()]+/).filter(token => token && !/^(?:AND|OR)$/.test(token));
    const text = section.replace(/\s+/g, ' ');
    return ids.length > 0 && ids.every(id => Object.prototype.hasOwnProperty.call(README_PERMISSION_NOTICE, id) && README_PERMISSION_NOTICE[id].test(text));
}

const README_FILE = /^readme(?:\.(?:md|markdown|txt))?$/i;
const LICENSE_HEADING = /^licen[cs]e\b/i;

/**
 * The licence section of a README, for packages that publish their licence
 * only there (data-uri-to-buffer 4.0.1, a transitive dependency of the Gemini
 * SDK in #232, ships no LICENSE file). Accepts an ATX (`## License`) or setext
 * (`License` over `-------`) heading and runs to the next heading. Returns null
 * unless the section carries the permission notice of the declared `license`
 * (MIT, ISC, BSD-2/3-Clause; see README_PERMISSION_NOTICE), so a one-line "MIT"
 * badge or a "Licensed under the MIT licence" sentence never passes as the
 * notice. Never accepts Apache-2.0, or any call without a declared licence.
 */
function readmeLicenseSection(readme, license) {
    const lines = readme.replace(/\r\n?/g, '\n').split('\n');
    const headingAt = index => {
        const atx = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[index]);
        if (atx) {
            return { title: atx[1], bodyStart: index + 1 };
        }
        if (lines[index].trim() && index + 1 < lines.length && /^\s*(?:=+|-+)\s*$/.test(lines[index + 1])) {
            return { title: lines[index].trim(), bodyStart: index + 2 };
        }
        return null;
    };
    for (let index = 0; index < lines.length; index++) {
        const heading = headingAt(index);
        if (!heading || !LICENSE_HEADING.test(heading.title)) {
            continue;
        }
        let end = heading.bodyStart;
        while (end < lines.length && !headingAt(end)) {
            end++;
        }
        const section = lines.slice(heading.bodyStart, end)
            .filter(line => !/^\s*\[[^\]]+\]:\s*\S+/.test(line))
            .join('\n')
            .trim();
        if (carriesPermissionNotice(section, license)) {
            return section;
        }
    }
    return null;
}

/**
 * The packages behind a set of bundled module paths (an esbuild metafile's
 * `inputs` keys, relative to rootDir), each with its manifest and the licence
 * and notice texts found in its directory. Throws one error naming every
 * package that has no licence file, no declared licence, or a licence outside
 * the allowlist.
 */
function collectBundledPackages(modulePaths, options = {}) {
    const rootDir = options.rootDir || process.cwd();
    const allowed = options.allowed || ALLOWED_LICENSES;
    const byDirectory = new Map();
    for (const modulePath of modulePaths) {
        const location = packageLocation(modulePath);
        if (location && !byDirectory.has(location.directory)) {
            byDirectory.set(location.directory, location);
        }
    }

    const packages = new Map();
    const problems = [];
    for (const { name, directory } of byDirectory.values()) {
        const absolute = path.resolve(rootDir, directory);
        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(path.join(absolute, 'package.json'), 'utf8'));
        } catch (error) {
            problems.push(`${name}: package.json unreadable at ${directory} (${error.code || error.message})`);
            continue;
        }
        const id = `${manifest.name || name}@${manifest.version || '0.0.0'}`;
        if (packages.has(id)) {
            continue;
        }
        const entries = fs.readdirSync(absolute).sort();
        const licenseFiles = entries.filter(entry => LICENSE_FILE.test(entry) && fs.statSync(path.join(absolute, entry)).isFile());
        const noticeFiles = entries.filter(entry => NOTICE_FILE.test(entry) && fs.statSync(path.join(absolute, entry)).isFile());
        const license = declaredLicense(manifest);

        if (!license) {
            problems.push(`${id}: package.json declares no licence`);
        } else if (!isAllowedLicense(license, allowed)) {
            problems.push(`${id}: licence "${license}" is not in the allowlist (${[...allowed].join(', ')})`);
        }

        // A whitespace-only LICENSE is no licence text: drop it so the README
        // fallback (or the failure below) applies as if the file were missing.
        const texts = licenseFiles
            .map(file => ({ file, text: readText(path.join(absolute, file)) }))
            .filter(entry => entry.text.length > 0);
        if (texts.length === 0) {
            const readme = entries.find(entry => README_FILE.test(entry) && fs.statSync(path.join(absolute, entry)).isFile());
            const section = readme ? readmeLicenseSection(fs.readFileSync(path.join(absolute, readme), 'utf8'), license) : null;
            if (section) {
                texts.push({ file: `${readme} (licence section; the package ships no LICENSE file)`, text: section });
            } else {
                problems.push(`${id}: no LICENSE, LICENCE or COPYING file with text, and no ${license || 'licence'} permission notice in its README, so its licence text cannot ship`);
            }
        }
        texts.push(...noticeFiles
            .map(file => ({ file, text: readText(path.join(absolute, file)) }))
            .filter(entry => entry.text.length > 0));

        packages.set(id, {
            id,
            name: manifest.name || name,
            version: manifest.version || '0.0.0',
            license,
            homepage: repositoryUrl(manifest),
            texts,
        });
    }

    if (problems.length > 0) {
        throw new Error(
            `Third-party licence check failed for the extension bundle:\n  - ${problems.join('\n  - ')}\n` +
            'Every package inlined into dist/extension.js must ship its licence text under an allowlisted licence ' +
            '(scripts/third-party-notices.js). Widening the allowlist is a maintainer licence decision.',
        );
    }

    return [...packages.values()].sort((a, b) => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.version, b.version));
}

/** Plain UTF-16 code-unit order, so the output never depends on the build machine's locale. */
function compareCodeUnits(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function repositoryUrl(manifest) {
    const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository && manifest.repository.url;
    const candidate = repository || manifest.homepage;
    if (typeof candidate !== 'string') {
        return null;
    }
    return candidate
        .replace(/^git\+/, '')
        .replace(/^git:\/\//, 'https://')
        .replace(/^github:/, 'https://github.com/')
        .replace(/\.git$/, '');
}

const RULE = '='.repeat(80);
const THIN_RULE = '-'.repeat(80);

/** The notices file for a sorted package list. Deterministic: no dates, no absolute paths. */
function renderNotices(packages, options = {}) {
    const bundle = options.bundle || 'dist/extension.js';
    const lines = [
        'C4X THIRD-PARTY SOFTWARE NOTICES',
        '',
        `The C4X extension package inlines the ${packages.length} open-source packages listed`,
        `below into ${bundle}. Each is redistributed under its own licence,`,
        'reproduced in full below with any NOTICE file the package ships. C4X itself',
        'is MIT-licensed (LICENSE). The cloud provider icon artwork is covered',
        'separately in NOTICE.md.',
        '',
        'This file is generated from the bundle\'s module graph on every build',
        '(esbuild.config.js, scripts/third-party-notices.js). Do not edit it by hand.',
        '',
        'Packages:',
        '',
        ...packages.map(pkg => `  ${pkg.id}  (${pkg.license})`),
    ];
    for (const pkg of packages) {
        lines.push('', RULE, `Package: ${pkg.id}`, `License: ${pkg.license}`);
        if (pkg.homepage) {
            lines.push(`Source: ${pkg.homepage}`);
        }
        for (const { file, text } of pkg.texts) {
            lines.push(THIN_RULE, `${file}:`, '', text);
        }
    }
    return `${lines.join('\n')}\n`;
}

/** The `name@version` ids a notices file declares, from its `Package:` headers. */
function listedPackages(noticesText) {
    return [...noticesText.matchAll(/^Package: (\S+)$/gm)].map(match => match[1]);
}

/**
 * The packages an esbuild bundle contains, read from its original module path
 * comments or preserved c4x-module provenance comments in compacted output. This is
 * evidence independent of the metafile the notices were generated from, so the
 * VSIX smoke can check the shipped notices against the shipped bundle.
 * Returns package directories relative to the bundle's build root.
 */
function bundledPackageDirectories(bundleSource) {
    const directories = new Set();
    for (const match of bundleSource.matchAll(/^(?:\/\/ (\S*node_modules\/\S+)|  \(\*! c4x-module: (\S*node_modules\/\S+) \*\))$/gm)) {
        const location = packageLocation(match[1] || match[2]);
        if (location) {
            directories.add(location.directory);
        }
    }
    return [...directories].sort();
}

/** Generate the notices for an esbuild metafile and write them to outputPath. */
function writeThirdPartyNotices(metafile, outputPath, options = {}) {
    const packages = collectBundledPackages(Object.keys(metafile.inputs), options);
    fs.writeFileSync(outputPath, renderNotices(packages, options));
    return packages;
}

module.exports = {
    ALLOWED_LICENSES,
    NOTICES_FILE,
    bundledPackageDirectories,
    collectBundledPackages,
    declaredLicense,
    isAllowedLicense,
    listedPackages,
    packageLocation,
    readmeLicenseSection,
    renderNotices,
    writeThirdPartyNotices,
};
