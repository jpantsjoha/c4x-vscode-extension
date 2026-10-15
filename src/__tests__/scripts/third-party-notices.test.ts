import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// scripts/third-party-notices.js builds THIRD_PARTY_NOTICES.txt for the
// VSIX from the extension bundle's metafile. These tests drive it against a
// fixture node_modules tree; scripts/test-vsix-smoke.js checks the real
// bundle against the real file.

interface BundledPackage {
    id: string;
    name: string;
    version: string;
    license: string | null;
    homepage: string | null;
    texts: { file: string; text: string }[];
}

interface NoticesModule {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the module's exported constant
    ALLOWED_LICENSES: Set<string>;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the module's exported constant
    NOTICES_FILE: string;
    packageLocation(modulePath: string): { name: string; directory: string } | null;
    readmeLicenseSection(readme: string, license?: string): string | null;
    declaredLicense(manifest: Record<string, unknown>): string | null;
    isAllowedLicense(expression: unknown, allowed?: Set<string>): boolean;
    collectBundledPackages(modulePaths: string[], options?: { rootDir?: string; allowed?: Set<string> }): BundledPackage[];
    renderNotices(packages: BundledPackage[], options?: { bundle?: string }): string;
    listedPackages(noticesText: string): string[];
    bundledPackageDirectories(bundleSource: string): string[];
    writeThirdPartyNotices(metafile: { inputs: Record<string, unknown> }, outputPath: string, options?: { rootDir?: string }): BundledPackage[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const notices: NoticesModule = require('../../../scripts/third-party-notices');

const MIT_TEXT = 'MIT License\n\nCopyright (c) Fixture Authors\n\nPermission is hereby granted...';
const APACHE_TEXT = 'Apache License\nVersion 2.0, January 2004';
const NOTICE_TEXT = 'Fixture SDK\nCopyright 2026 Fixture LLC';

/** Writes files under a fresh temporary root; every path is fixture-controlled. */
function fixtureTree(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-notices-'));
    for (const [relative, contents] of Object.entries(files)) {
        const target = path.join(root, relative);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        fs.writeFileSync(target, contents);
    }
    return root;
}

function manifest(fields: Record<string, unknown>): string {
    return JSON.stringify(fields);
}

const PNPM = 'node_modules/.pnpm';
const SDK_DIR = `${PNPM}/@fixture+sdk@2.0.0/node_modules/@fixture/sdk`;
const UTIL_DIR = `${PNPM}/util-lib@1.4.0/node_modules/util-lib`;

function healthyTree(): string {
    return fixtureTree({
        [`${SDK_DIR}/package.json`]: manifest({ name: '@fixture/sdk', version: '2.0.0', license: 'Apache-2.0', repository: { url: 'git+https://github.com/fixture/sdk.git' } }),
        [`${SDK_DIR}/LICENSE`]: `${APACHE_TEXT}\r\n`,
        [`${SDK_DIR}/NOTICE`]: NOTICE_TEXT,
        [`${SDK_DIR}/dist/index.js`]: 'module.exports = {};',
        // A nested manifest without a name must not be mistaken for the package root.
        [`${SDK_DIR}/dist/esm/package.json`]: manifest({ type: 'module' }),
        [`${UTIL_DIR}/package.json`]: manifest({ name: 'util-lib', version: '1.4.0', licenses: [{ type: 'MIT' }] }),
        [`${UTIL_DIR}/LICENSE-MIT.txt`]: MIT_TEXT,
        [`${UTIL_DIR}/index.js`]: 'module.exports = 1;',
    });
}

describe('third-party notices generator', () => {
    const roots: string[] = [];
    afterEach(() => {
        while (roots.length > 0) {
            fs.rmSync(roots.pop() as string, { recursive: true, force: true });
        }
    });
    function tree(build: () => string): string {
        const root = build();
        roots.push(root);
        return root;
    }

    describe('packageLocation', () => {
        it('resolves pnpm, npm and scoped module paths to the package directory', () => {
            assert.deepStrictEqual(notices.packageLocation(`${UTIL_DIR}/lib/a.js`), { name: 'util-lib', directory: UTIL_DIR });
            assert.deepStrictEqual(notices.packageLocation(`${SDK_DIR}/dist/esm/index.mjs`), { name: '@fixture/sdk', directory: SDK_DIR });
            assert.deepStrictEqual(notices.packageLocation('node_modules/dagre/index.js'), { name: 'dagre', directory: 'node_modules/dagre' });
            assert.deepStrictEqual(
                notices.packageLocation('node_modules\\lodash\\lodash.js'),
                { name: 'lodash', directory: 'node_modules/lodash' },
            );
        });

        it('returns null for first-party code and package-store internals', () => {
            assert.strictEqual(notices.packageLocation('src/extension.ts'), null);
            assert.strictEqual(notices.packageLocation('node_modules/.pnpm/lock.yaml'), null);
            assert.strictEqual(notices.packageLocation('node_modules/@scope'), null);
        });
    });

    describe('declaredLicense', () => {
        it('reads the license string, the legacy object and the legacy array', () => {
            assert.strictEqual(notices.declaredLicense({ license: ' MIT ' }), 'MIT');
            assert.strictEqual(notices.declaredLicense({ license: { type: 'ISC' } }), 'ISC');
            assert.strictEqual(notices.declaredLicense({ licenses: [{ type: 'MIT' }] }), 'MIT');
            assert.strictEqual(notices.declaredLicense({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] }), '(MIT OR Apache-2.0)');
        });

        it('returns null when nothing is declared', () => {
            assert.strictEqual(notices.declaredLicense({}), null);
            assert.strictEqual(notices.declaredLicense({ license: '' }), null);
            assert.strictEqual(notices.declaredLicense({ licenses: [] }), null);
        });
    });

    describe('isAllowedLicense', () => {
        it('accepts every allowlisted identifier', () => {
            for (const id of notices.ALLOWED_LICENSES) {
                assert.strictEqual(notices.isAllowedLicense(id), true, id);
            }
        });

        it('evaluates OR, AND and parentheses', () => {
            assert.strictEqual(notices.isAllowedLicense('(MIT OR GPL-3.0-only)'), true);
            assert.strictEqual(notices.isAllowedLicense('GPL-3.0-only OR Apache-2.0'), true);
            assert.strictEqual(notices.isAllowedLicense('MIT AND BSD-3-Clause'), true);
            assert.strictEqual(notices.isAllowedLicense('MIT AND GPL-3.0-only'), false);
            assert.strictEqual(notices.isAllowedLicense('(MIT AND (ISC OR GPL-2.0-only))'), true);
        });

        it('refuses copyleft, exceptions, custom references and malformed expressions', () => {
            for (const expression of ['GPL-3.0-only', 'LGPL-2.1-or-later', 'Apache-2.0 WITH LLVM-exception',
                'SEE LICENSE IN LICENSE.md', 'LicenseRef-Proprietary', 'UNLICENSED', '(MIT', 'MIT OR', 'OR MIT', '', 'mit']) {
                assert.strictEqual(notices.isAllowedLicense(expression), false, expression);
            }
            assert.strictEqual(notices.isAllowedLicense(undefined), false);
        });
    });

    describe('collectBundledPackages and renderNotices', () => {
        it('collects each bundled package once, with its licence and NOTICE texts', () => {
            const root = tree(healthyTree);
            const packages = notices.collectBundledPackages([
                'src/extension.ts',
                `${UTIL_DIR}/index.js`,
                `${SDK_DIR}/dist/index.js`,
                `${SDK_DIR}/dist/esm/package.json`,
                `${UTIL_DIR}/index.js`,
            ], { rootDir: root });

            assert.deepStrictEqual(packages.map(pkg => pkg.id), ['@fixture/sdk@2.0.0', 'util-lib@1.4.0']);
            const [sdk, util] = packages;
            assert.strictEqual(sdk.license, 'Apache-2.0');
            assert.strictEqual(sdk.homepage, 'https://github.com/fixture/sdk');
            assert.deepStrictEqual(sdk.texts.map(text => text.file), ['LICENSE', 'NOTICE']);
            assert.strictEqual(sdk.texts[0].text, APACHE_TEXT, 'CRLF and trailing whitespace are normalised');
            assert.strictEqual(util.license, 'MIT');
            assert.deepStrictEqual(util.texts.map(text => text.file), ['LICENSE-MIT.txt']);
        });

        it('renders a deterministic file whose Package headers round-trip', () => {
            const root = tree(healthyTree);
            const packages = notices.collectBundledPackages([`${UTIL_DIR}/index.js`, `${SDK_DIR}/dist/index.js`], { rootDir: root });
            const text = notices.renderNotices(packages);

            assert.deepStrictEqual(notices.listedPackages(text), ['@fixture/sdk@2.0.0', 'util-lib@1.4.0']);
            assert.match(text, /^ {2}@fixture\/sdk@2\.0\.0 {2}\(Apache-2\.0\)$/m);
            assert.match(text, /^ {2}util-lib@1\.4\.0 {2}\(MIT\)$/m);
            assert.ok(text.includes(APACHE_TEXT));
            assert.ok(text.includes(NOTICE_TEXT), 'an Apache-2.0 NOTICE file travels with the code');
            assert.ok(text.includes(MIT_TEXT));
            assert.ok(!text.includes(root), 'no absolute build path leaks into the shipped file');
            assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(text), 'no timestamp, so rebuilds are byte-identical');
            assert.strictEqual(notices.renderNotices(packages), text);
        });

        it('fails, naming every offender, when a package has no licence file or a refused licence', () => {
            const root = tree(() => fixtureTree({
                'node_modules/no-text/package.json': manifest({ name: 'no-text', version: '1.0.0', license: 'MIT' }),
                'node_modules/no-text/index.js': '',
                'node_modules/copyleft/package.json': manifest({ name: 'copyleft', version: '3.1.0', license: 'GPL-3.0-only' }),
                'node_modules/copyleft/LICENSE': 'GNU GENERAL PUBLIC LICENSE',
                'node_modules/undeclared/package.json': manifest({ name: 'undeclared', version: '0.1.0' }),
                'node_modules/undeclared/LICENSE': MIT_TEXT,
                'node_modules/fine/package.json': manifest({ name: 'fine', version: '1.0.0', license: 'ISC' }),
                'node_modules/fine/LICENSE': 'ISC License',
            }));
            const inputs = ['no-text', 'copyleft', 'undeclared', 'fine'].map(name => `node_modules/${name}/index.js`);

            assert.throws(() => notices.collectBundledPackages(inputs, { rootDir: root }), (error: Error) => {
                assert.match(error.message, /no-text@1\.0\.0: no LICENSE, LICENCE or COPYING file with text, and no .* permission notice in its README/);
                assert.match(error.message, /copyleft@3\.1\.0: licence "GPL-3\.0-only" is not in the allowlist/);
                assert.match(error.message, /undeclared@0\.1\.0: package\.json declares no licence/);
                assert.doesNotMatch(error.message, /fine@/);
                return true;
            });
        });

        it('fails when a bundled package directory has no readable package.json', () => {
            const root = tree(() => fixtureTree({ 'node_modules/ghost/index.js': '' }));
            assert.throws(
                () => notices.collectBundledPackages(['node_modules/ghost/index.js'], { rootDir: root }),
                /ghost: package\.json unreadable/,
            );
        });

        it('honours a narrower allowlist, so widening it is a deliberate edit', () => {
            const root = tree(healthyTree);
            assert.throws(
                () => notices.collectBundledPackages([`${SDK_DIR}/dist/index.js`], { rootDir: root, allowed: new Set(['MIT']) }),
                /@fixture\/sdk@2\.0\.0: licence "Apache-2\.0" is not in the allowlist \(MIT\)/,
            );
        });
    });

    describe('README licence fallback', () => {
        const SETEXT_README = [
            'data-uri-to-buffer', '==================', '', 'Usage', '-----', '', 'Some usage.', '',
            'License', '-------', '', '(The MIT License)', '', 'Copyright (c) 2014 Fixture Author',
            '', 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software.',
            '', '[rfc]: http://tools.ietf.org/html/rfc2397', '',
        ].join('\n');

        const ISC_README = [
            '# pkg', '', '## Licence', '', 'Copyright (c) 2020 Fixture.', '',
            'Permission to use, copy, modify, and/or distribute this software for any purpose',
            'with or without fee is hereby granted, provided that the above notice appears.',
            '', '## Changelog', '', 'v1',
        ].join('\n');
        const BSD_README = '# pkg\n\n## License\n\nCopyright (c) 2020 Fixture.\n\nRedistribution and use in source and binary forms,\nwith or without modification, are permitted provided that the following conditions are met: x.\n';
        const APACHE_README = '# pkg\n\n## License\n\nCopyright 2020 Fixture. Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0\n';
        const SUMMARY_README = '# pkg\n\n## License\n\nCopyright (c) 2020 X. Licensed under the MIT licence; see the repository for the full text, which is far too long to repeat here.\n';

        it('extracts a setext or ATX licence section up to the next heading, without link definitions', () => {
            const setext = notices.readmeLicenseSection(SETEXT_README, 'MIT');
            assert.ok(setext);
            assert.match(setext as string, /^\(The MIT License\)/);
            assert.match(setext as string, /Permission is hereby granted/);
            assert.doesNotMatch(setext as string, /rfc2397|Some usage/);

            const atx = notices.readmeLicenseSection(ISC_README, 'ISC');
            assert.ok(atx);
            assert.match(atx as string, /Permission to use, copy, modify/);
            assert.doesNotMatch(atx as string, /Changelog|v1/);
        });

        it('rejects a licence heading with no licence text', () => {
            assert.strictEqual(notices.readmeLicenseSection('# pkg\n\n## License\n\nMIT\n'), null);
            assert.strictEqual(notices.readmeLicenseSection('# pkg\n\nNo licence heading at all.\n'), null);
        });

        it('requires the permission notice of the declared licence', () => {
            assert.ok(notices.readmeLicenseSection(BSD_README, 'BSD-3-Clause'));
            assert.ok(notices.readmeLicenseSection(BSD_README, 'BSD-2-Clause'));
            // A summary sentence is not the MIT notice, however long.
            assert.strictEqual(notices.readmeLicenseSection(SUMMARY_README, 'MIT'), null);
            // The notice for one licence does not satisfy another.
            assert.strictEqual(notices.readmeLicenseSection(SETEXT_README, 'ISC'), null);
            assert.strictEqual(notices.readmeLicenseSection(ISC_README, 'MIT'), null);
            // A compound expression needs every licence's notice.
            assert.strictEqual(notices.readmeLicenseSection(SETEXT_README, 'MIT AND ISC'), null);
            assert.ok(notices.readmeLicenseSection(SETEXT_README, '(MIT)'));
        });

        it('never allows the fallback for Apache-2.0, or without a declared licence', () => {
            assert.strictEqual(notices.readmeLicenseSection(APACHE_README, 'Apache-2.0'), null);
            // Even a README that carries the full MIT text is refused under an Apache declaration.
            assert.strictEqual(notices.readmeLicenseSection(SETEXT_README, 'Apache-2.0'), null);
            assert.strictEqual(notices.readmeLicenseSection(SETEXT_README, 'MIT OR Apache-2.0'), null);
            assert.strictEqual(notices.readmeLicenseSection(SETEXT_README), null);
        });

        it('ships the README section when a package has no LICENSE file, and still fails without one', () => {
            const root = tree(() => fixtureTree({
                'node_modules/readme-only/package.json': manifest({ name: 'readme-only', version: '4.0.1', license: 'MIT' }),
                'node_modules/readme-only/README.md': SETEXT_README,
                'node_modules/readme-only/index.js': '',
                'node_modules/badge-only/package.json': manifest({ name: 'badge-only', version: '1.0.0', license: 'MIT' }),
                'node_modules/badge-only/README.md': '# badge-only\n\n## License\n\nMIT\n',
                'node_modules/badge-only/index.js': '',
            }));
            const [readmeOnly] = notices.collectBundledPackages(['node_modules/readme-only/index.js'], { rootDir: root });
            assert.deepStrictEqual(readmeOnly.texts.map(text => text.file), ['README.md (licence section; the package ships no LICENSE file)']);
            assert.match(readmeOnly.texts[0].text, /Copyright \(c\) 2014 Fixture Author/);
            assert.throws(
                () => notices.collectBundledPackages(['node_modules/badge-only/index.js'], { rootDir: root }),
                /badge-only@1\.0\.0: no LICENSE, LICENCE or COPYING file with text, and no MIT permission notice in its README/,
            );
        });
    });

    describe('empty and unusable licence files', () => {
        const MIT_README = '# pkg\n\n## License\n\nCopyright (c) 2020 Fixture.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n';

        it('treats a whitespace-only LICENSE as missing, so it neither ships blank nor passes', () => {
            const root = tree(() => fixtureTree({
                'node_modules/blank/package.json': manifest({ name: 'blank', version: '1.0.0', license: 'MIT' }),
                'node_modules/blank/LICENSE': ' \r\n\t\n',
                'node_modules/blank/index.js': '',
                'node_modules/blank-readme/package.json': manifest({ name: 'blank-readme', version: '1.0.0', license: 'MIT' }),
                'node_modules/blank-readme/LICENSE': '\n\n',
                'node_modules/blank-readme/README.md': MIT_README,
                'node_modules/blank-readme/index.js': '',
                'node_modules/blank-apache/package.json': manifest({ name: 'blank-apache', version: '1.0.0', license: 'Apache-2.0' }),
                'node_modules/blank-apache/LICENSE': '   ',
                'node_modules/blank-apache/README.md': MIT_README,
                'node_modules/blank-apache/index.js': '',
            }));
            assert.throws(
                () => notices.collectBundledPackages(['node_modules/blank/index.js'], { rootDir: root }),
                /blank@1\.0\.0: no LICENSE, LICENCE or COPYING file with text/,
            );
            assert.throws(
                () => notices.collectBundledPackages(['node_modules/blank-apache/index.js'], { rootDir: root }),
                /blank-apache@1\.0\.0: no LICENSE/,
            );
            const [fallback] = notices.collectBundledPackages(['node_modules/blank-readme/index.js'], { rootDir: root });
            assert.deepStrictEqual(fallback.texts.map(text => text.file), ['README.md (licence section; the package ships no LICENSE file)']);
        });

        it('sorts packages by plain code-unit order, whatever the locale', () => {
            // Names differ by more than case, so the fixture also works on case-insensitive file systems (macOS).
            const root = tree(() => fixtureTree({
                'node_modules/banana/package.json': manifest({ name: 'banana', version: '1.0.0', license: 'MIT' }),
                'node_modules/banana/LICENSE': MIT_TEXT,
                'node_modules/Zed/package.json': manifest({ name: 'Zed', version: '1.0.0', license: 'MIT' }),
                'node_modules/Zed/LICENSE': MIT_TEXT,
                'node_modules/apple/package.json': manifest({ name: 'apple', version: '1.0.0', license: 'MIT' }),
                'node_modules/apple/LICENSE': MIT_TEXT,
            }));
            const names = notices.collectBundledPackages(['node_modules/banana/x.js', 'node_modules/Zed/x.js', 'node_modules/apple/x.js'], { rootDir: root }).map(pkg => pkg.name);
            // localeCompare would give apple, banana, Zed.
            assert.deepStrictEqual(names, ['Zed', 'apple', 'banana']);
        });
    });

    describe('writeThirdPartyNotices', () => {
        it('writes the notices for an esbuild metafile', () => {
            const root = tree(healthyTree);
            const output = path.join(root, notices.NOTICES_FILE);
            const packages = notices.writeThirdPartyNotices(
                { inputs: { 'src/extension.ts': {}, [`${UTIL_DIR}/index.js`]: {} } },
                output,
                { rootDir: root },
            );
            assert.deepStrictEqual(packages.map(pkg => pkg.id), ['util-lib@1.4.0']);
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            assert.deepStrictEqual(notices.listedPackages(fs.readFileSync(output, 'utf8')), ['util-lib@1.4.0']);
        });
    });

    describe('bundledPackageDirectories', () => {
        it('reads the packages an unminified bundle contains from its module comments', () => {
            const bundle = [
                '"use strict";',
                '// src/extension.ts',
                `// ${UTIL_DIR}/index.js`,
                'var x = 1; // node_modules/not-a-module-comment/index.js',
                `// ${SDK_DIR}/dist/index.js`,
                `// ${SDK_DIR}/dist/other.js`,
                '  // node_modules/indented/index.js',
            ].join('\n');
            assert.deepStrictEqual(notices.bundledPackageDirectories(bundle), [SDK_DIR, UTIL_DIR]);
        });

        it('reads preserved source provenance after whitespace compaction', () => {
            const bundle = [
                `  (*! c4x-module: ${UTIL_DIR}/index.js *)`,
                'var x=1;',
                `  (*! c4x-module: ${SDK_DIR}/dist/index.js *)`,
                `  (*! c4x-module: ${SDK_DIR}/dist/other.js *)`,
            ].join('\n');
            assert.deepStrictEqual(notices.bundledPackageDirectories(bundle), [SDK_DIR, UTIL_DIR]);
        });

        it('finds nothing in a minified bundle', () => {
            assert.deepStrictEqual(notices.bundledPackageDirectories('var a=1;function b(){}'), []);
        });
    });
});
