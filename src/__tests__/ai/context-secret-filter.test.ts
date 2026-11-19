import * as assert from 'assert';

// CodeContextExtractor imports vscode; resolve it to the unit-test mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { classifyContextFile } from '../../ai/CodeContextExtractor';
import { describeOutgoing, type OutgoingRequest } from '../../ai/outgoingRequest';

// The secret-content filter (#485, from the #471 review of #392). Pattern set
// adapted from the gitleaks default rules; same set as release/1.8.x (#488).
// Fixtures are assembled at run time so this file holds no literal secret.
const j = (...parts: string[]) => parts.join('');
const run = (n: number, ch = 'a') => ch.repeat(n);

describe('context secret filter (#485)', () => {
    const SHAPES: Record<string, string> = {
        'payment-provider live key': `const k = "${j('sk', '_live_', run(24, 'A'))}";`,
        'payment-provider restricted key': `k=${j('rk', '_live_', run(24, 'B'))}`,
        'package-registry token': `//registry:_authToken=${j('npm', '_', run(36, 'c'))}`,
        'signed web token': `Authorization: Bearer ${j('ey', 'J', run(12, 'h'))}.${j('ey', 'J', run(12, 'p'))}.${run(20, 's')}`,
        'AI provider key (project)': `${j('sk', '-proj-', run(30, 'x'))}`,
        'AI provider key (anthropic)': `${j('sk', '-ant-', 'api03-', run(30, 'y'))}`,
        'git host token (gitlab)': `${j('gl', 'pat-', run(24, 'z'))}`,
        'model hub token': `${j('h', 'f_', run(36, 'q'))}`,
        'chat webhook url': `https://${j('hooks', '.slack.com')}/services/${run(24, 'T')}`,
        'cloud temporary access id': j('AS', 'IA', run(16, 'A')),
        'fine-grained git token': j('github', '_pat_', run(30, 'a')),
        'unquoted password assignment': `db.password=${run(12, 'p')}1`,
        'unquoted key assignment (env style)': `API_KEY: ${run(14, 'k')}`,
        'quoted password assignment': `password = "${run(10, 'w')}"`,
        'JSON password field (quoted property name)': `{ "password": "${run(12, 'j')}9" }`,
        'JSON api key field': `  "apiKey": "${run(14, 'm')}",`,
        'env assignment with trailing comment': `DB_PASSWORD=${run(12, 'e')}9 # rotate monthly`,
        'key assignment with line comment': `api_key: ${run(14, 'n')}1 // staging`,
        'private key block variant': j('-----BEGIN ', 'PGP ', 'PRIVATE KEY BLOCK-----'),
    };

    for (const [shape, content] of Object.entries(SHAPES)) {
        it(`drops a file holding a ${shape}`, () => {
            assert.strictEqual(classifyContextFile('src/config.txt', content), 'credentials');
        });
    }

    describe('false positives stay sendable', () => {
        const HARMLESS: Record<string, string> = {
            'short sk- identifier': 'const el = "sk-button"; import skLearn from "sk-learn-helpers";',
            'sk- prefix in a css class': '.sk-circle-fade-in-long-class-name { color: red; }',
            'password read from the environment': 'password = process.env.DB_PASSWORD_VALUE_NAME',
            'password typed as a string': 'password: string',
            'key reference by call': 'const apiKey = this.config.getApiKeyFromStore();',
            'prose mentioning a token': 'Pass the token in the header and rotate the secret monthly.',
            'jwt-like but too short': 'eyJ.eyJ.abc',
            'password copied from a settings object': 'password = settings.password',
            'password typed as an options type': 'password: PasswordOptions',
            'password typed with a class name': 'secret: SecretStoreClientConfig;',
            'secret assigned from a call': 'secret = loadSecretFromVaultNow()',
            'env reference with trailing comment': 'API_KEY=${API_KEY_FROM_CI} # set in CI',
            'JSON field naming a reference': '{ "passwordField": "passwordInput" }',
            'npm_ prefix with short body': 'const npm_config = 1; npm_lifecycle_event',
        };
        for (const [name, content] of Object.entries(HARMLESS)) {
            it(`keeps ${name}`, () => {
                assert.strictEqual(classifyContextFile('src/app.ts', content), undefined);
            });
        }
    });

    describe('credential file names and folders are never read', () => {
        for (const name of ['.envrc', 'prod.tfvars', 'terraform.tfvars', '.docker/config.json', 'home/.kube/config', 'secrets.properties', 'token.json']) {
            it(`excludes ${name} by name alone`, () => {
                assert.strictEqual(classifyContextFile(name, ''), 'credentials');
            });
        }
        it('does not exclude look-alike paths', () => {
            assert.strictEqual(classifyContextFile('docs/docker/config.md', ''), undefined);
            assert.strictEqual(classifyContextFile('src/kube/config.ts', ''), undefined);
        });
    });

    // Round 3: two contexts. Configuration values are literals (any non-empty
    // value excludes); in source code only a quoted literal does.
    describe('configuration context: any value of a credential key excludes', () => {
        const CONFIG: Array<[string, string, string]> = [
            ['all-letters value (the round-1 fixture)', 'config/app.conf', `API_KEY: ${run(14, 'k')}`],
            ['all-letters value in YAML', 'deploy/values.yaml', `db:\n  password: ${run(12, 'p')}`],
            ['all-letters value in properties', 'app.properties', `db.password=${run(12, 'p')}`],
            ['an environment reference', 'docker-compose.yml', 'environment:\n  - DB_PASSWORD=${DB_PASSWORD}'],
            ['a JSON field', 'settings.json', `{ "clientSecret": "${run(6, 's')}" }`],
            ['a TOML field', 'Cargo.toml', `[registry]\ntoken = "${run(6, 't')}"`],
            ['an INI field', 'setup.cfg', `[auth]\npassword = ${run(8, 'w')}`],
            ['a shell export', 'deploy.sh', `export API_TOKEN=${run(9, 'x')}`],
            ['an XML element', 'settings.xml', `<server>\n  <password>${run(9, 'x')}</password>\n</server>`],
            ['an unknown extension', 'notes.txt', `secret: ${run(5, 'z')}`],
            ['a long quoted value', 'app.yaml', `api_key: "${run(500, 'q')}"`],
            ['a value whose literal part lies past 300 characters (truncation case)', 'app.conf', `API_KEY=${run(300, 'Q')}9876`],
            ['a quote split across lines', 'app.yaml', `password: "${run(12, 'q')}\n  ${run(12, 'r')}"`],
            ['a value on the next line', 'app.json', `{\n  "password":\n    "${run(12, 'q')}"\n}`],
            ['wide spacing', 'app.ini', `password${' '.repeat(40)}=${' '.repeat(40)}${run(12, 'v')}`],
            ['deep indentation', 'app.yaml', `${' '.repeat(240)}secret_key: ${run(12, 'v')}`],
            ['a key after column 700 on one line', 'app.json', `{ "padding": "${run(700, 'p')}", "authToken": "${run(10, 'v')}" }`],
        ];
        for (const [name, file, content] of CONFIG) {
            it(`excludes ${name} (${file})`, () => {
                assert.strictEqual(classifyContextFile(file, content), 'credentials');
            });
        }
        it('keeps configuration whose credential keys are empty or absent', () => {
            assert.strictEqual(classifyContextFile('app.json', '{ "password": "", "author": "JP", "max_tokens": 10 }'), undefined);
            assert.strictEqual(classifyContextFile('values.yaml', 'passwordField: input\nsecretName: db\ntoken_url: https://x'), undefined);
            assert.strictEqual(classifyContextFile('README.md', 'Pass the token in the header and rotate the secret monthly.'), undefined);
        });
    });

    describe('source context: quoted literals exclude, identifiers do not', () => {
        const LITERALS: Array<[string, string, string]> = [
            ['a long quoted literal', 'src/a.ts', `const apiKey = "${run(500, 'q')}";`],
            ['a quote split across lines', 'src/a.ts', `const password = "${run(12, 'q')}\n  ${run(12, 'r')}";`],
            ['a literal on the next line', 'src/a.py', `password = \\\n    "${run(12, 'q')}"`],
            ['wide spacing', 'src/a.js', `password${' '.repeat(40)}=${' '.repeat(40)}'${run(12, 'v')}'`],
            ['deep indentation', 'src/a.py', `${' '.repeat(240)}secret = '${run(12, 'v')}'`],
            ['a key after column 700 on one line', 'src/a.js', `const pad = "${run(700, 'p')}", token = "${run(10, 'v')}";`],
            ['a template without interpolation', 'src/a.ts', `const token = \`${run(12, 'v')}\`;`],
            ['a literal after a type annotation', 'src/a.py', `password: str = "${run(10, 'v')}"`],
            ['a template with literal text around an interpolation', 'src/a.ts', 'const authorization = `Bearer ${token}`;'],
            ['a call default (round 4)', 'src/a.py', `password = os.getenv("PW", "${run(10, 'v')}")`],
            ['a parenthesised literal (round 4)', 'src/a.ts', `const secret = ("${run(10, 'v')}");`],
            ['a literal inside a nested call (round 4)', 'src/a.py', `password = os.getenv("PW", str("${run(10, 'v')}"))`],
            ['a Python-prefixed literal (round 4)', 'src/a.py', `secret = rb'${run(10, 'v')}'`],
            ['an f-string with literal text (round 4)', 'src/a.py', `token = f"${run(6, 'v')}{suffix}"`],
            ['a C# verbatim literal (round 4)', 'src/a.cs', `var password = @"${run(10, 'v')}";`],
            ['an unclosed fallback quote (round 4)', 'src/a.ts', `const password = process.env.PW || "${run(10, 'v')}`],
            ['a fallback on a continuation line (round 4)', 'src/a.ts', `const password = process.env.PW\n  || "${run(10, 'v')}";`],
            ['a default inside a call spread over lines (round 4)', 'src/a.py', `password = os.getenv(\n    "PW",\n    "${run(10, 'v')}",\n)`],
            ['a literal after a trailing operator (round 4)', 'src/a.ts', `const token = process.env.T ??\n  "${run(10, 'v')}";`],
            ['a compound assignment', 'src/a.ts', `config.token ??= "${run(10, 'v')}";`],
            ['a literal fallback', 'src/a.ts', `const password = process.env.DB || "${run(10, 'v')}";`],
            ['a quoted property name', 'src/a.ts', `const c = { "password": "${run(10, 'v')}" };`],
            ['a keyword argument', 'src/a.py', `connect(user="u", password="${run(10, 'v')}")`],
            ['a literal in a comment', 'src/a.ts', `// don't ship: password = "${run(10, 'v')}"`],
            ['an assignment inside a multi-line template', 'src/a.ts', `const env = \`\nDB_PASSWORD=${run(10, 'v')}\n\`;`],
            ['an assignment inside a triple-quoted string', 'src/a.py', `CONF = """\nsecret: ${run(10, 'v')}\n"""`],
        ];
        for (const [name, file, content] of LITERALS) {
            it(`excludes ${name} (${file})`, () => {
                assert.strictEqual(classifyContextFile(file, content), 'credentials');
            });
        }
        const REFERENCES: Array<[string, string]> = [
            ['an all-letters identifier', `const password = ${run(12, 'p')};`],
            ['an all-letters identifier, unquoted assignment', `API_KEY: ${run(14, 'k')}`],
            ['a reference continued on the next line', 'const password = settings\n  .password;\n\nconst label = "Password";'],
            ['an optional property type', 'password?: string;'],
            ['a comparison', 'if (password === confirmPassword) { return; }'],
            ['a reference or pointer type', 'fn login(password: &str, token: *const u8) {}'],
        ];
        for (const [name, content] of REFERENCES) {
            it(`keeps ${name}`, () => {
                assert.strictEqual(classifyContextFile('src/app.ts', content), undefined);
            });
        }
    });

    // Round 5: in source code, any quote in a credential assignment's
    // right-hand side excludes, unless the whole right-hand side is one of the
    // fixed environment lookups with a single name.
    describe('source context: the environment-lookup allowlist (round 5)', () => {
        const LOOKUPS: Array<[string, string, string]> = [
            ['getenv', 'src/a.c', 'getenv("DB_PASSWORD")'],
            ['os.getenv', 'src/a.py', 'os.getenv("DB_PASSWORD")'],
            ['os.environ subscript', 'src/a.py', "os.environ['DB_PASSWORD']"],
            ['os.environ.get', 'src/a.py', 'os.environ.get("DB_PASSWORD")'],
            ['environ.get', 'src/a.py', 'environ.get("DB_PASSWORD")'],
            ['process.env subscript', 'src/a.ts', 'process.env["DB_PASSWORD"]'],
            ['System.getenv', 'src/A.java', 'System.getenv("DB_PASSWORD")'],
            ['Environment.GetEnvironmentVariable', 'src/A.cs', 'Environment.GetEnvironmentVariable("DB_PASSWORD")'],
            ['ENV subscript', 'src/a.rb', 'ENV["DB_PASSWORD"]'],
            ['ENV.fetch', 'src/a.rb', 'ENV.fetch("DB_PASSWORD")'],
        ];
        const withDefault = (lookup: string) => lookup.replace(/(["'])DB_PASSWORD\1/, `$1DB_PASSWORD$1, "${run(10, 'v')}"`);
        for (const [name, file, lookup] of LOOKUPS) {
            it(`keeps ${name} with a single name`, () => {
                assert.strictEqual(classifyContextFile(file, `password = ${lookup}`), undefined);
            });
            it(`excludes ${name} with a default or fallback`, () => {
                const changed = lookup.endsWith(']') ? `${lookup} || "${run(10, 'v')}"` : withDefault(lookup);
                assert.strictEqual(classifyContextFile(file, `password = ${changed}`), 'credentials');
            });
        }
        it('keeps process.env.NAME and other quote-free right-hand sides', () => {
            assert.strictEqual(classifyContextFile('src/a.ts', 'const password = process.env.DB_PASSWORD;'), undefined);
            assert.strictEqual(classifyContextFile('src/a.ts', 'const password = settings.password;'), undefined);
            assert.strictEqual(classifyContextFile('src/a.ts', 'const token = await vault.read(path);'), undefined);
        });
        it('excludes a lookup name that is not identifier-like', () => {
            assert.strictEqual(classifyContextFile('src/a.py', 'password = os.getenv("db password")'), 'credentials');
        });
        const PROBES: Array<[string, string, string]> = [
            ['decrypt of a literal', 'src/a.ts', `const password = decrypt("${run(16, 'v')}");`],
            ['base64 decode of a literal', 'src/a.py', `password = b64decode("${run(16, 'v')}")`],
            ['str of a literal', 'src/a.py', `secret = str("${run(16, 'v')}")`],
            ['a call with a string argument', 'src/a.ts', 'const secret = vault.read("db/password");'],
            ['a template that is interpolation only', 'src/a.ts', 'const authorization = `${token}`;'],
            ['an interpolation holding a literal (template)', 'src/a.ts', `const token = \`\${"${run(10, 'v')}"}\`;`],
            ['an interpolation holding a literal (f-string)', 'src/a.py', `token = f"{'${run(10, 'v')}'}"`],
            ['an f-string that is interpolation only', 'src/a.py', 'token = f"{prefix}"'],
            ['an empty default', 'src/a.ts', "const password = '';"],
            ['a comment between continuation lines (trailing operator)', 'src/a.ts', `const password = process.env.PW ||\n  // fallback for local runs\n  "${run(10, 'v')}";`],
            ['a comment between continuation lines (leading operator)', 'src/a.ts', `const password = process.env.PW\n  // fallback for local runs\n  || "${run(10, 'v')}";`],
            ['a comment at the end of a continued line', 'src/a.py', `password = (os.getenv("PW")  # local\n    or "${run(10, 'v')}")`],
            ['a call default', 'src/a.py', `password = os.getenv("PW", "${run(10, 'v')}")`],
        ];
        for (const [name, file, content] of PROBES) {
            it(`excludes ${name} (${file})`, () => {
                assert.strictEqual(classifyContextFile(file, content), 'credentials');
            });
        }
    });

    // Round 6: no expression parsing. A credential line is safe only as one
    // whole-line lookup statement; otherwise any quote or block comment in the
    // next ten lines (to a blank line) excludes.
    describe('source context: whole-line lookups and the quote window (round 6)', () => {
        const EXCLUDED: Array<[string, string, string]> = [
            ['a block comment with punctuation before a later literal', 'src/a.ts', `const password = process.env.PW /* a, b; c) ] */\n  || "${run(10, 'v')}";`],
            ['a # comment without a space before a later literal', 'src/a.py', `password = (env_pw #fallback: see docs)\n    or "${run(10, 'v')}")`],
            ['an allowed lookup followed by a call on the next line', 'src/a.py', `password = os.getenv("PW")\n    .strip("${run(10, 'v')}")`],
            ['an allowed lookup followed by a subscript on the next line', 'src/a.ts', `const password = process.env["PW"]\n  ["${run(10, 'v')}"];`],
            ['a + operator on the next line', 'src/a.ts', `const password = process.env["PW"]\n  + "${run(10, 'v')}";`],
            ['a % operator on the next line', 'src/a.py', `password = os.environ["PW"]\n    % "${run(10, 'v')}"`],
            ['a ?? operator on the next line', 'src/a.ts', `const token = process.env["T"]\n  ?? "${run(10, 'v')}";`],
            ['an or operator on the next line (round 6)', 'src/a.py', `password = (os.getenv("PW")\n    or "${run(10, 'v')}")`],
            ['a ^ operator on the next line (round 6)', 'src/a.ts', `const secret = process.env["S"]\n  ^ "${run(10, 'v')}";`],
            ['a ternary on the next line (round 6)', 'src/a.py', `password = os.getenv("PW")\n    if ok else "${run(10, 'v')}"`],
            ['a literal two lines below a safe lookup (round 6)', 'src/a.ts', `const password = process.env.PW\n  // note\n  ;var x = "${run(10, 'v')}";`],
            ['a literal a few lines below', 'src/a.ts', `const password = settings.password\n  .trim()\n  .concat(\n    "${run(10, 'v')}");`],
            ['a quote in the trailing comment of a lookup', 'src/a.ts', 'const password = process.env["PW"]; // the "prod" one'],
            ['a key inside a string (accepted false positive)', 'src/a.ts', 'console.log("token: " + token);'],
            ['a key inside a comment with an apostrophe (accepted false positive)', 'src/a.ts', "// the user's password: see docs"],
            ['a lookup inside a call argument list (accepted false positive)', 'src/a.py', 'connect(user=u, password=os.getenv("DB_PASSWORD"))'],
            ['an assignment inside a long template', 'src/a.ts', `const env = \`\nDB_PASSWORD=${run(10, 'v')}\n\`;`],
        ];
        for (const [name, file, content] of EXCLUDED) {
            it(`excludes ${name} (${file})`, () => {
                assert.strictEqual(classifyContextFile(file, content), 'credentials');
            });
        }
        const SAFE: Array<[string, string, string]> = [
            ['a typed declaration', 'src/A.java', 'private static final String PASSWORD = System.getenv("DB_PASSWORD");'],
            ['a lookup with a quote-free comment', 'src/a.ts', 'export const password = process.env["DB_PASSWORD"]; // set in CI'],
            ['a Python annotation', 'src/a.py', 'password: str = os.environ.get("DB_PASSWORD")  # from the vault'],
            ['a C# declaration', 'src/A.cs', 'var password = Environment.GetEnvironmentVariable("DB_PASSWORD");'],
            ['a lookup followed by unrelated code after a blank line', 'src/a.rb', 'password = ENV.fetch("DB_PASSWORD")\n\nputs "ready"'],
            ['a quote eleven lines below', 'src/a.ts', `const password = settings.password;\n${'x();\n'.repeat(10)}log("done");`],
        ];
        for (const [name, file, content] of SAFE) {
            it(`keeps ${name} (${file})`, () => {
                assert.strictEqual(classifyContextFile(file, content), undefined);
            });
        }
    });

    describe('scan cost is linear at and beyond the file-size limit', () => {
        const LIMIT = 50 * 1024;
        const CEILING_MS = 100;
        const fill = (unit: string, size = LIMIT) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
        const ADVERSARIAL: Record<string, string> = {
            'repeated key names': fill('password'),
            'repeated keys with separators': fill('secret_'),
            'one long identifier': fill('aB'),
            'unclosed quotes': fill('"a\'b`c'),
            'keys with empty values': fill('token=\n'),
            'keys with identifier values': fill('token = x; '),
            'spaces before a separator': `${' '.repeat(LIMIT - 8)}secret=`,
            'quoted keys': fill('"passwordField":'),
            'nested brackets': fill('password = ((((x'),
            'lookup calls in a right-hand side': fill('password = get("a"); '),
            'continuation lines': `password = a${fill(' ||\n b')}`,
            'open interpolations': `token = \`${fill('${')}`,
        };
        for (const [name, body] of Object.entries(ADVERSARIAL)) {
            for (const file of ['a.yaml', 'a.ts']) {
                it(`${name} (${file}, ${Math.round(body.length / 1024)} KB)`, () => {
                    // Median of five runs, so one slow scheduler tick does not
                    // decide it; the ceiling allows for coverage instrumentation.
                    const runs: number[] = [];
                    for (let n = 0; n < 5; n++) {
                        const started = process.hrtime.bigint();
                        classifyContextFile(file, body);
                        runs.push(Number(process.hrtime.bigint() - started) / 1e6);
                    }
                    const median = runs.sort((x, y) => x - y)[2];
                    if (process.env.C4X_TIMING_LOG) {
                        console.log(`timing ${name} ${file} median=${median.toFixed(2)}ms`);
                    }
                    assert.ok(median < CEILING_MS, `median ${median.toFixed(1)} ms of ${runs.map(r => r.toFixed(1)).join(', ')}`);
                });
            }
        }
        it('cost grows linearly: ten times the input takes well under thirty times as long', () => {
            // Linear growth gives a ratio near 10; quadratic near 100. A ratio
            // is used, not a fixed budget, so coverage instrumentation and a
            // loaded machine do not decide the result.
            const time = (copies: number) => {
                const started = process.hrtime.bigint();
                for (const body of Object.values(ADVERSARIAL)) {
                    const input = body.repeat(copies);
                    classifyContextFile('a.yaml', input);
                    classifyContextFile('a.ts', input);
                }
                return Number(process.hrtime.bigint() - started) / 1e6;
            };
            time(2); // warm up
            const small = time(2);
            const large = time(20);
            assert.ok(large / small < 30, `100 KB inputs took ${small.toFixed(1)} ms, 1 MB inputs ${large.toFixed(1)} ms`);
        });
    });

    it('the confirmation lists files dropped for size or because they are not text', () => {
        const outgoing: OutgoingRequest = {
            prompt: 'p',
            files: [],
            excluded: [
                { path: 'big.log', reason: 'too large' },
                { path: 'logo.png', reason: 'not text' },
            ],
            guidance: 'built-in',
        };
        const text = describeOutgoing(outgoing, { kind: 'folder', label: 'x' }, 'guidance').join('\n');
        assert.match(text, /- big\.log \(too large to send; never sent\)/);
        assert.match(text, /- logo\.png \(not a text file; never sent\)/);
    });
});
