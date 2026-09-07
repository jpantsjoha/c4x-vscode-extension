#!/usr/bin/env ts-node
/**
 * Doc-claim linter.
 *
 * Prose drifts from code silently, and nothing in the build noticed. On
 * 2026-08-07 the shipped default image model had been retired for three weeks,
 * `docs/FAQ.md` told users the default text model was `gemini-3.1-pro-preview`,
 * `docs/GEMINI_GUIDE.md` said `gemini-3-flash-preview`, and the code said
 * neither. All three passed every gate.
 *
 * This checks the claims a build can actually verify. It is deliberately
 * offline: it reads the repository, never the network, so it runs in CI and on
 * a plane. Model *lifecycle* cannot be checked here, because Google's model
 * list publishes no deprecation state — lifecycle verification requires a separate live review.
 *
 * Run: pnpm run verify:doc-claims   (wired into `make verify-docs`)
 */

import * as fs from 'fs';
import * as path from 'path';

// Tests point this at an isolated repository-shaped fixture. Production runs
// always verify the actual checkout, even if the fixture variable leaks in.
const ROOT = process.env.NODE_ENV === 'test' && process.env.C4X_DOC_CLAIM_ROOT
    ? path.resolve(process.env.C4X_DOC_CLAIM_ROOT)
    : path.resolve(__dirname, '..');

interface Failure {
    rule: string;
    file: string;
    detail: string;
}

const failures: Failure[] = [];
const notes: string[] = [];

function read(relative: string): string {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function exists(relative: string): boolean {
    return fs.existsSync(path.join(ROOT, relative));
}

// ── The code is the source of truth ─────────────────────────────────────────

const modelsSource = read('src/ai/models.ts');

function constantOf(name: string): string {
    const match = modelsSource.match(new RegExp(`export const ${name} = '([^']+)'`));
    if (!match) {
        throw new Error(`Could not read ${name} from src/ai/models.ts`);
    }
    return match[1];
}

const CONSTANTS: Record<string, string> = {};
for (const name of [
    'DEFAULT_MODEL',
    'PRO_MODEL',
    'LITE_MODEL',
    'DEFAULT_IMAGE_MODEL',
    'PRO_IMAGE_MODEL',
    'LITE_IMAGE_MODEL',
]) {
    CONSTANTS[name] = constantOf(name);
}

/** Every id the registry knows, with its channel. */
const registryChannels = new Map<string, string>();
for (const entry of modelsSource.matchAll(/\{ id: ([^,]+), purpose: '[^']*', channel: '(ga|preview|retired)'/g)) {
    const raw = entry[1].trim();
    const id = raw.startsWith("'") ? raw.slice(1, -1) : CONSTANTS[raw];
    if (id) {
        registryChannels.set(id, entry[2]);
    }
}

const pkg = JSON.parse(read('package.json'));
const settings = pkg.contributes.configuration.properties;

// ── Rule 1: no preview or retired id may be a shipped default ───────────────
//
// This is the rule that would have caught the v1.6.2 image default.

for (const key of ['c4x.ai.model', 'c4x.ai.imageModel']) {
    const value: string = settings[key]?.default;
    if (!value) {
        continue;
    }
    const channel = registryChannels.get(value);
    if (value.includes('-preview') || value.includes('-exp')) {
        failures.push({
            rule: 'R1 no preview default',
            file: 'package.json',
            detail: `${key} defaults to "${value}", which is a preview id. Preview models are retired on short notice.`,
        });
    } else if (channel === 'retired') {
        failures.push({
            rule: 'R1 no retired default',
            file: 'package.json',
            detail: `${key} defaults to "${value}", which the registry marks retired.`,
        });
    } else if (!channel) {
        failures.push({
            rule: 'R1 unknown default',
            file: 'package.json',
            detail: `${key} defaults to "${value}", which is absent from MODEL_REGISTRY.`,
        });
    }
}

// PRO_MODEL is a default slot too — it is the failover every text failure
// elevates to — but it is a code constant, not a package.json default, so the
// loop above never sees it. A preview exemption is a named, dated decision,
// never permission for the whole preview channel. A replacement preview must
// be reviewed and added here deliberately; every other replacement must be a
// MODEL_REGISTRY entry whose channel is `ga`.
const PREVIEW_DEFAULT_ALLOWLIST = new Map<string, {
    id: string;
    approvedOn: string;
    decision: string;
    reason: string;
}>([
    ['PRO_MODEL', {
        id: 'gemini-3.1-pro-preview',
        approvedOn: '2026-09-05',
        decision: 'maintainer-approved preview failover',
        reason: 'No generally available Pro exists in the Gemini 3.x line; revisit when one ships.',
    }],
]);

const proChannel = registryChannels.get(CONSTANTS.PRO_MODEL);
const previewDecision = PREVIEW_DEFAULT_ALLOWLIST.get('PRO_MODEL');
const proLooksPreview = CONSTANTS.PRO_MODEL.includes('-preview') || CONSTANTS.PRO_MODEL.includes('-exp');

if (!proChannel) {
    failures.push({
        rule: 'R1 unknown default',
        file: 'src/ai/models.ts',
        detail: `PRO_MODEL is "${CONSTANTS.PRO_MODEL}", which is absent from MODEL_REGISTRY. ` +
            'Add it with channel "ga", or record a reviewed, dated preview exception in PREVIEW_DEFAULT_ALLOWLIST.',
    });
} else if (proChannel === 'retired') {
    failures.push({
        rule: 'R1 no retired default',
        file: 'src/ai/models.ts',
        detail: `PRO_MODEL is "${CONSTANTS.PRO_MODEL}", which the registry marks retired. Choose a GA replacement.`,
    });
} else if (proLooksPreview || proChannel === 'preview') {
    if (proChannel !== 'preview' || previewDecision?.id !== CONSTANTS.PRO_MODEL) {
        failures.push({
            rule: 'R1 preview failover must match an approved decision',
            file: 'src/ai/models.ts',
            detail: `PRO_MODEL is "${CONSTANTS.PRO_MODEL}", a preview id, but the only approved preview is ` +
                `"${previewDecision?.id}" (${previewDecision?.decision}, ${previewDecision?.approvedOn}). ` +
                'Choose a MODEL_REGISTRY id with channel "ga", or record a new reviewed, dated decision in PREVIEW_DEFAULT_ALLOWLIST.',
        });
    } else {
        notes.push(
            `R1 allows preview PRO_MODEL "${CONSTANTS.PRO_MODEL}" by ${previewDecision.decision}, ` +
            `approved ${previewDecision.approvedOn}: ${previewDecision.reason}`
        );
    }
}

// ── Rule 2: package.json defaults must equal the code constants ─────────────

const defaultPairs: Array<[string, string]> = [
    ['c4x.ai.model', 'DEFAULT_MODEL'],
    ['c4x.ai.imageModel', 'DEFAULT_IMAGE_MODEL'],
];
for (const [key, constant] of defaultPairs) {
    const declared: string = settings[key]?.default;
    if (declared !== CONSTANTS[constant]) {
        failures.push({
            rule: 'R2 manifest matches code',
            file: 'package.json',
            detail: `${key} default is "${declared}" but ${constant} is "${CONSTANTS[constant]}".`,
        });
    }
}

// ── Rule 3: user-facing docs must not name a retired model as current ───────
//
// Retired ids may still be *mentioned*, for migration advice. What they may
// not do is appear on a line that calls them the default.

const USER_DOCS = [
    'README.md',
    'docs/GEMINI_GUIDE.md',
    'docs/FAQ.md',
    'docs/DIAGRAM-WITH-GEMINI-IMAGE.md',
    'docs/C4X-GENERATION-GUIDELINES.md',
];

const retiredIds = [...registryChannels.entries()]
    .filter(([, channel]) => channel === 'retired')
    .map(([id]) => id);

for (const doc of USER_DOCS) {
    if (!exists(doc)) {
        continue;
    }
    const lines = read(doc).split('\n');
    lines.forEach((line, index) => {
        // "(default)" is the parenthetical form — `gemini-x (default)` — that the
        // generation guidelines used for a retired id for five months unnoticed.
        const claimsDefault = /\bdefaults? to\b|\*\*Default\*\*|\bis the default\b|\(default\)|"c4x\.ai\.(model|imageModel)":/i.test(line);
        if (!claimsDefault) {
            return;
        }
        for (const id of retiredIds) {
            if (line.includes(id)) {
                failures.push({
                    rule: 'R3 no retired model presented as current',
                    file: `${doc}:${index + 1}`,
                    detail: `presents retired "${id}" as a default or recommended setting.`,
                });
            }
        }
        for (const [key, constant] of [['model', 'DEFAULT_MODEL'], ['imageModel', 'DEFAULT_IMAGE_MODEL']] as const) {
            if (line.includes(`"c4x.ai.${key}"`) && !line.includes(CONSTANTS[constant])) {
                const mentionsAnyModel = /gemini-[0-9]/.test(line);
                if (mentionsAnyModel && !line.includes('any Gemini model')) {
                    notes.push(`${doc}:${index + 1} sets c4x.ai.${key} to a non-default model as an example.`);
                }
            }
        }
    });
}

// ── Rule 8: authoritative current-default claims must match code ───────────
//
// These four surfaces are the authoritative present-tense text-default claims:
// README.md's "The default model is ...", GEMINI_GUIDE's "C4X defaults to ...",
// FAQ's "The default is ...", and the `(default)` row in c4x.ai.model's setting
// description. Each recogniser is anchored to that exact claim form. Changelogs,
// ADR history, migration prose and "previous default" rows are intentionally
// outside this list, so a true historical statement cannot fail the current
// contract. Adding another authoritative claim means adding its recogniser here.

interface AuthoritativeDefaultClaim {
    file: string;
    source: string;
    pattern: RegExp;
    form: string;
}

const AUTHORITATIVE_TEXT_DEFAULT_CLAIMS: AuthoritativeDefaultClaim[] = [
    {
        file: 'README.md',
        source: read('README.md'),
        pattern: /^The default model is `([^`]+)`/gm,
        form: 'The default model is `<id>`',
    },
    {
        file: 'docs/GEMINI_GUIDE.md',
        source: read('docs/GEMINI_GUIDE.md'),
        pattern: /^C4X defaults to `([^`]+)`/gm,
        form: 'C4X defaults to `<id>`',
    },
    {
        file: 'docs/FAQ.md',
        source: read('docs/FAQ.md'),
        pattern: /^The default is `([^`]+)`\.$/gm,
        form: 'The default is `<id>`.',
    },
    {
        file: 'package.json',
        source: settings['c4x.ai.model']?.description ?? '',
        pattern: /^- (gemini-[^\s]+) — .* \(default\)$/gm,
        form: '- <id> — ... (default) in c4x.ai.model.description',
    },
];

let authoritativeClaimsChecked = 0;
for (const claim of AUTHORITATIVE_TEXT_DEFAULT_CLAIMS) {
    const matches = [...claim.source.matchAll(claim.pattern)];
    if (matches.length !== 1) {
        failures.push({
            rule: 'R8 authoritative current default matches code',
            file: claim.file,
            detail: `expected exactly one current-default claim shaped as "${claim.form}", found ${matches.length}.`,
        });
        continue;
    }

    authoritativeClaimsChecked += 1;
    const stated = matches[0][1];
    if (stated !== CONSTANTS.DEFAULT_MODEL) {
        const prefix = claim.source.slice(0, matches[0].index ?? 0);
        const line = claim.file === 'package.json' ? '' : `:${prefix.split('\n').length}`;
        failures.push({
            rule: 'R8 authoritative current default matches code',
            file: `${claim.file}${line}`,
            detail: `states current default "${stated}" but DEFAULT_MODEL is "${CONSTANTS.DEFAULT_MODEL}".`,
        });
    }
}

// ── Rule 5: every command the docs tell users to run must exist ────────────
//
// docs/GEMINI_GUIDE.md instructed users to run "C4X: Set Gemini API Key" as the
// way to add a key. No such command was registered. The documentation had been
// describing an extension that did not exist, and the only real way in was to
// trigger a failure and click a button in the error toast.

const declaredCommands = new Set<string>(
    (pkg.contributes?.commands ?? []).map((c: { title: string }) => c.title.trim())
);

for (const doc of USER_DOCS) {
    if (!exists(doc)) {
        continue;
    }
    const lines = read(doc).split('\n');
    lines.forEach((line, index) => {
        // Commands are cited in backticks or quotes: `C4X: Do Thing`
        for (const match of line.matchAll(/[`'"](C4X: [^`'"]+)[`'"]/g)) {
            const cited = match[1].trim();
            if (!declaredCommands.has(cited)) {
                failures.push({
                    rule: 'R5 cited command must exist',
                    file: `${doc}:${index + 1}`,
                    detail: `tells the user to run "${cited}", which is not in package.json contributes.commands.`,
                });
            }
        }
    });
}

// ── Rule 6: a deprecated setting must name the command that replaced it ────
//
// c4x.ai.apiKey was deprecated in favour of SecretStorage. VS Code greys a
// deprecated setting out, so the settings page silently became a dead end:
// users looking for "where do I put my API key" found a disabled box and no
// alternative named. Deprecating a setting removes a user's entry point, so
// the replacement has to be spelled out where they are looking.

for (const [key, property] of Object.entries<any>(settings)) {
    const deprecation = `${property.deprecationMessage ?? ''} ${property.markdownDeprecationMessage ?? ''} ${property.description ?? ''}`;
    if (!property.deprecationMessage && !property.markdownDeprecationMessage) {
        continue;
    }
    const namesACommand = [...declaredCommands].some(title => deprecation.includes(title));
    if (!namesACommand) {
        failures.push({
            rule: 'R6 deprecated setting names its replacement',
            file: 'package.json',
            detail: `${key} is deprecated but names no existing command, leaving the settings page a dead end.`,
        });
    }
}

// ── Rule 7: every declared setting must be read by the code ────────────────
//
// c4x.ai.modelStrategy was declared with a description promising that "a model
// your key cannot reach is replaced rather than left to fail, and you are
// told". Nothing in src/ read it. R1-R6 all passed, because none of them walks
// the manifest looking for promises the code never keeps. A setting the user
// can change and the extension never reads is a dead control on the settings
// page, which is the same defect class as the deprecated setting R6 catches.
//
// Reads compose, so a literal grep for "c4x.ai.model" finds nothing:
// getConfiguration('c4x.ai').get('model') is the real shape. This accepts
// either the whole key as a literal or a (section, sub-key) pair, and the pair
// must appear in the SAME file so an unrelated coincidence across the tree
// cannot fake a read.

/**
 * Keys allowed to be unread, each with the reason. Every entry is a promise on
 * the settings page that nothing keeps, so an entry here is debt, not a fix.
 */
const UNREAD_SETTINGS_ALLOWED = new Map<string, string>([
    // (empty — the tree reads every declared setting)
]);

function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') {
                continue;
            }
            found.push(...sourceFiles(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            found.push(full);
        }
    }
    return found;
}

/** Every configuration key `src/` actually reads, in either shape. */
function keysReadBySource(): Set<string> {
    const read = new Set<string>();

    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
        const text = fs.readFileSync(file, 'utf8');

        // getConfiguration('c4x'), getConfiguration?.('c4x.ai'), getConfiguration()
        const sections = new Set<string>();
        let bareSection = false;
        for (const match of text.matchAll(/getConfiguration\s*(?:\?\.)?\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g)) {
            const section = match[1] ?? match[2];
            if (section === undefined) {
                bareSection = true;
            } else {
                sections.add(section);
            }
        }
        if (sections.size === 0 && !bareSection) {
            continue;
        }

        // .get('key'), .get<T>('key'), and .get(IDENT) where IDENT is a
        // file-local string constant — ThemeManager reads its key that way.
        const constants = new Map<string, string>();
        for (const match of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'\s*;/g)) {
            constants.set(match[1], match[2]);
        }

        const subKeys = new Set<string>();
        let dynamicRead = false;
        for (const match of text.matchAll(/\.get\s*(?:<[^>]*>)?\s*\(\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))/g)) {
            const literal = match[1] ?? match[2] ?? (match[3] ? constants.get(match[3]) : undefined);
            if (literal) {
                subKeys.add(literal);
            } else {
                // .get(key) where key is a parameter — SvgBuilder reads its
                // settings through a one-hop helper. The key cannot be resolved
                // statically, so every key-shaped literal in the file counts as
                // a candidate. This is the only place the rule is generous, and
                // only files that genuinely do a dynamic read get it.
                dynamicRead = true;
            }
        }
        if (dynamicRead) {
            for (const match of text.matchAll(/['"]([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*)['"]/g)) {
                subKeys.add(match[1]);
            }
        }

        for (const sub of subKeys) {
            if (bareSection) {
                read.add(sub);
            }
            for (const section of sections) {
                read.add(section ? `${section}.${sub}` : sub);
            }
        }
    }

    return read;
}

const settingsRead = keysReadBySource();
const unreadSettings: string[] = [];

for (const key of Object.keys(settings)) {
    if (settingsRead.has(key)) {
        continue;
    }
    unreadSettings.push(key);
    const allowed = UNREAD_SETTINGS_ALLOWED.get(key);
    if (allowed) {
        notes.push(`R7 allows unread setting ${key}: ${allowed}`);
        continue;
    }
    failures.push({
        rule: 'R7 declared setting must be read',
        file: 'package.json',
        detail: `${key} is declared in contributes.configuration but nothing in src/ reads it. ` +
            'Wire it up, or remove it — a setting the code ignores is a promise the extension cannot keep.',
    });
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log('Doc-claim linter');
console.log(`  DEFAULT_MODEL       ${CONSTANTS.DEFAULT_MODEL}`);
console.log(`  DEFAULT_IMAGE_MODEL ${CONSTANTS.DEFAULT_IMAGE_MODEL}`);
console.log(`  registry entries    ${registryChannels.size}`);
console.log(
    `  settings (R7)       ${Object.keys(settings).length} declared, ` +
    `${Object.keys(settings).length - unreadSettings.length} read by src/`
);
console.log(
    `  current defaults (R8) ${authoritativeClaimsChecked}/${AUTHORITATIVE_TEXT_DEFAULT_CLAIMS.length} ` +
    'authoritative claims recognised'
);
console.log('');

for (const note of notes) {
    console.log(`  note: ${note}`);
}

if (failures.length === 0) {
    console.log('  All doc claims agree with the code.');
    process.exit(0);
}

console.error(`  ${failures.length} claim(s) disagree with the code:\n`);
for (const failure of failures) {
    console.error(`  [${failure.rule}] ${failure.file}`);
    console.error(`      ${failure.detail}`);
}
console.error('\nFix the prose, or fix the code. They may not disagree.');
process.exit(1);
