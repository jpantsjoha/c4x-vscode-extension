/**
 * Layout quality across the shipped corpus.
 *
 * Every `c4x` fence in samples/ and docs/ is laid out and checked for defects
 * a reader would see immediately: two elements drawn on top of each other, or
 * geometry pushed off the top/left of the canvas.
 *
 * This exists because the unit suite was fully green while the OAuth dynamic
 * sample rendered "Mobile App" and "OAuth Provider" overlapping by 240x43px.
 * Nothing asserted the one property that matters most to someone looking at a
 * diagram: boxes must not sit on top of each other.
 *
 * Containment is excluded — a deployment Node legitimately encloses its
 * children, and a boundary legitimately encloses its members.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element } from '../../model/C4Model';

const ROOT = path.resolve(__dirname, '../../..');
const CORPUS_DIRS = ['samples', 'docs'];

function markdownFiles(dir: string, out: string[] = []): string[] {
    const absolute = path.join(ROOT, dir);
    if (!fs.existsSync(absolute)) {
        return out;
    }
    const walk = (current: string): void => {
        for (const entry of fs.readdirSync(current)) {
            const full = path.join(current, entry);
            if (fs.statSync(full).isDirectory()) {
                if (!/node_modules|\.git|\.tmp/.test(full)) {
                    walk(full);
                }
            } else if (entry.endsWith('.md')) {
                out.push(full);
            }
        }
    };
    walk(absolute);
    return out;
}

function fencesIn(markdown: string): string[] {
    return [...markdown.matchAll(/```c4x\n([\s\S]*?)```/g)].map(match => match[1]);
}

/** True when one id encloses the other, in which case overlap is by design. */
function containmentChecker(view: C4View): (a: string, b: string) => boolean {
    const chains = new Map<string, Set<string>>();
    const walk = (element: C4Element, chain: string[]): void => {
        chains.set(element.id, new Set(chain));
        (element.children ?? []).forEach(child => walk(child, [...chain, element.id]));
    };
    view.elements.forEach(element => walk(element, []));
    return (a, b) => chains.get(a)?.has(b) === true || chains.get(b)?.has(a) === true;
}

describe('layout quality across the shipped sample corpus', function () {
    // 140+ fences through parse -> model -> dagre.
    this.timeout(60_000);

    const parser = new C4XParser();
    const engine = new DagreLayoutEngine();
    const files = CORPUS_DIRS.flatMap(dir => markdownFiles(dir));

    it('finds c4x fences to check', () => {
        const total = files.reduce((sum, file) => sum + fencesIn(fs.readFileSync(file, 'utf8')).length, 0);
        assert.ok(total > 50, `expected a substantial corpus, found ${total} fences`);
    });

    it('never draws two elements on top of each other', () => {
        const defects: string[] = [];

        for (const file of files) {
            fencesIn(fs.readFileSync(file, 'utf8')).forEach((source, index) => {
                let view: C4View;
                try {
                    const model = c4ModelBuilder.build(parser.parse(source), 'Corpus');
                    if (model.views.length === 0) {
                        return;
                    }
                    view = model.views[0];
                } catch {
                    return; // parse failures are verify-docs' job, not this test's
                }

                const encloses = containmentChecker(view);
                const laid = engine.layoutSync(view);
                const elements = laid.elements;

                for (let i = 0; i < elements.length; i++) {
                    for (let j = i + 1; j < elements.length; j++) {
                        const a = elements[i];
                        const b = elements[j];
                        if (encloses(a.id, b.id)) {
                            continue;
                        }
                        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                        if (overlapX > 0 && overlapY > 0) {
                            defects.push(
                                `${path.relative(ROOT, file)} fence ${index + 1}: ` +
                                `${a.id} overlaps ${b.id} by ${overlapX.toFixed(0)}x${overlapY.toFixed(0)}px`,
                            );
                        }
                    }
                }
            });
        }

        assert.deepStrictEqual(defects, [], `overlapping elements:\n  ${defects.join('\n  ')}`);
    });

    it('never places geometry off the top or left of the canvas', () => {
        const defects: string[] = [];

        for (const file of files) {
            fencesIn(fs.readFileSync(file, 'utf8')).forEach((source, index) => {
                try {
                    const model = c4ModelBuilder.build(parser.parse(source), 'Corpus');
                    if (model.views.length === 0) {
                        return;
                    }
                    const laid = engine.layoutSync(model.views[0]);
                    for (const element of laid.elements) {
                        if (element.x < 0 || element.y < 0) {
                            defects.push(
                                `${path.relative(ROOT, file)} fence ${index + 1}: ` +
                                `${element.id} at ${element.x}, ${element.y}`,
                            );
                        }
                    }
                    for (const boundary of laid.boundaries ?? []) {
                        if (boundary.x < 0 || boundary.y < 0) {
                            defects.push(
                                `${path.relative(ROOT, file)} fence ${index + 1}: ` +
                                `boundary ${boundary.id} at ${boundary.x}, ${boundary.y}`,
                            );
                        }
                    }
                } catch {
                    return;
                }
            });
        }

        assert.deepStrictEqual(defects, [], `negative coordinates:\n  ${defects.join('\n  ')}`);
    });
});

describe('DagreLayoutEngine — separation wins over label avoidance (UAT)', () => {
    // The OAuth dynamic sample: 12 relationships over 4 elements. The nudging
    // loop balances element separation against pushing elements clear of
    // relationship labels; at this density the two fight, the loop exits at its
    // iteration cap without converging, and the label forces used to leave two
    // elements sitting on top of each other. Separation now gets a final pass.
    const DENSE_DYNAMIC_VIEW = `%%{ c4: dynamic }%%
graph TB
  Person(user, "User", "Mobile app user")
  Container(app, "Mobile App", "React Native", "Client application")
  Container(auth, "OAuth Provider", "Auth0", "Authorization server")
  Container(api, "API Server", "Node.js", "Resource server")
  user -->|1. Taps "Login with Google"| app
  app -->|2. Initiates auth (with PKCE)| auth
  auth -.->|3. Shows login screen| user
  user -->|4. Enters credentials| auth
  auth -.->|5. Returns authorization code| app
  app -->|6. Exchanges code for token| auth
  auth -.->|7. Returns access_token + refresh_token| app
  app -->|8. Requests /api/profile (with token)| api
  api -->|9. Validates token| auth
  auth -.->|10. Token valid| api
  api -.->|11. Returns user profile| app
  app -.->|12. Shows dashboard| user
`;

    it('separates every element on a densely connected dynamic view', () => {
        const model = c4ModelBuilder.build(new C4XParser().parse(DENSE_DYNAMIC_VIEW), 'Dense');
        const laid = new DagreLayoutEngine().layoutSync(model.views[0]);
        const elements = laid.elements;

        for (let i = 0; i < elements.length; i++) {
            for (let j = i + 1; j < elements.length; j++) {
                const a = elements[i];
                const b = elements[j];
                const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                assert.ok(
                    overlapX <= 0 || overlapY <= 0,
                    `${a.id} overlaps ${b.id} by ${overlapX.toFixed(0)}x${overlapY.toFixed(0)}px`,
                );
            }
        }
    });

    it('still respects an explicitly pinned pair rather than tidying it apart', () => {
        // Two elements the author deliberately placed on top of each other stay
        // where they were put — $x/$y outranks tidiness.
        const pinned = `graph TB
Container(a, "A", "T", $x="100", $y="100")
Container(b, "B", "T", $x="110", $y="110")
`;
        const model = c4ModelBuilder.build(new C4XParser().parse(pinned), 'Pinned');
        const laid = new DagreLayoutEngine().layoutSync(model.views[0]);
        const a = laid.elements.find(el => el.id === 'a')!;
        const b = laid.elements.find(el => el.id === 'b')!;
        assert.strictEqual(a.x, 100);
        assert.strictEqual(a.y, 100);
        assert.strictEqual(b.x, 110);
        assert.strictEqual(b.y, 110);
    });
});
