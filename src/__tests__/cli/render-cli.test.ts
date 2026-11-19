/**
 * `c4x render` (#353), run in-process: arguments, exit codes, where the SVG
 * goes, and the one write it may make (the --output path the user names).
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
import * as os from 'os';
import * as path from 'path';
import {
    C4X_USAGE,
    RENDER_EXIT_NOT_RENDERED,
    RENDER_EXIT_OK,
    RENDER_EXIT_USAGE,
    boundedText,
    readAtMost,
    renderProcessIo,
    runC4x,
    runRender,
    type RenderIo,
} from '../../cli/renderCli';
import { MAX_MCP_SOURCE_BYTES } from '../../cli/limits';
import { MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, checkC4xSource } from '../../cli/renderSource';
import { version } from '../../../package.json';

const VALID = 'graph TB\nSystem(a, "A", "Does things")\n';

interface Recorded extends RenderIo {
    out: string;
    err: string;
    writes: Array<[string, string]>;
    reads: string[];
}

function fakeIo(files: Record<string, string> = {}, stdin?: string): Recorded {
    const cwd = '/work';
    const io: Recorded = {
        cwd,
        out: '',
        err: '',
        writes: [],
        reads: [],
        stdout: text => { io.out += text; },
        stderr: text => { io.err += text; },
        readFile: (file, maxBytes) => {
            io.reads.push(path.relative(cwd, file));
            const text = files[path.relative(cwd, file)];
            if (text === undefined) { throw new Error('ENOENT'); }
            return Buffer.byteLength(text, 'utf8') > maxBytes ? undefined : text;
        },
        readStdin: maxBytes => (stdin === undefined || Buffer.byteLength(stdin, 'utf8') > maxBytes ? undefined : stdin),
        sameFile: () => false,
        render: (source, options) => checkC4xSource(source, options),
        writeFile: (file, text) => { io.writes.push([file, text]); },
    };
    return io;
}

describe('c4x render (#353)', () => {
    it('draws a file to standard output, findings and a summary to standard error, exit 0', () => {
        const io = fakeIo({ 'a.c4x': VALID });
        assert.strictEqual(runRender(['a.c4x'], io), RENDER_EXIT_OK);
        assert.match(io.out, /^<\?xml[\s\S]*<\/svg>\n$/);
        assert.match(io.err, /c4x render: drawn in the classic theme: \d+ bytes, \d+ findings?\n$/);
        assert.deepStrictEqual(io.writes, []);
        assert.deepStrictEqual(io.reads, ['a.c4x']);
    });

    it('reads standard input when the file is "-" or omitted', () => {
        for (const args of [[], ['-'], ['--theme', 'c4-model', '-']]) {
            const io = fakeIo({}, VALID);
            assert.strictEqual(runRender(args, io), RENDER_EXIT_OK, io.err);
            assert.match(io.out, /<\/svg>\n$/);
        }
        const tooBig = fakeIo({}, 'x'.repeat(MAX_MCP_SOURCE_BYTES + 1));
        assert.strictEqual(runRender([], tooBig), RENDER_EXIT_USAGE);
        assert.match(tooBig.err, /standard input: larger than 1 MiB, not drawn/);
    });

    it('writes only the one --output path named, and not to standard output', () => {
        for (const args of [['a.c4x', '-o', 'out/d.svg'], ['a.c4x', '--output', 'out/d.svg'], ['a.c4x', '--output=out/d.svg']]) {
            const io = fakeIo({ 'a.c4x': VALID });
            assert.strictEqual(runRender(args, io), RENDER_EXIT_OK, io.err);
            assert.strictEqual(io.out, '');
            assert.strictEqual(io.writes.length, 1);
            assert.strictEqual(io.writes[0][0], path.resolve('/work', 'out/d.svg'));
            assert.match(io.writes[0][1], /<\/svg>$/);
        }
    });

    it('never derives an output path from diagram content', () => {
        const io = fakeIo({ 'a.c4x': 'graph TB\nSystem(a, "/work/evil.svg", "../../x.svg")\n' });
        assert.strictEqual(runRender(['a.c4x'], io), RENDER_EXIT_OK);
        assert.deepStrictEqual(io.writes, []);
    });

    it('refuses an --output that names the input file', () => {
        for (const output of ['a.c4x', './a.c4x', '/work/a.c4x']) {
            const io = fakeIo({ 'a.c4x': VALID });
            assert.strictEqual(runRender(['a.c4x', '-o', output], io), RENDER_EXIT_USAGE);
            assert.match(io.err, /refusing to overwrite the diagram source/);
            assert.deepStrictEqual(io.writes, []);
        }
    });

    it('reports a write failure as exit 2', () => {
        const io = fakeIo({ 'a.c4x': VALID });
        io.writeFile = () => { throw new Error('EACCES'); };
        assert.strictEqual(runRender(['a.c4x', '-o', 'x.svg'], io), RENDER_EXIT_USAGE);
        assert.match(io.err, /x\.svg: cannot be written/);
    });

    it('exits 1 with findings and no SVG for code that does not parse, has a model error or is too large', () => {
        const big = ['%%{ c4: container }%%', 'graph TB', ...Array.from({ length: MAX_RENDER_ELEMENTS + 1 }, (_, i) => `Container(c${i}, "C", "T", "D")`)].join('\n');
        for (const [source, rule, said] of [
            ['graph TB\nNot[valid\n', /C4X-SYNTAX/, /fix the errors above/],
            ['graph TB\nSystem(a, "A", "d")\nSystem(a, "B", "d")\n', /C4X-MODEL/, /fix the errors above/],
            [big, /C4X-RENDER/, /the render is too large/],
        ] as const) {
            const io = fakeIo({ 'a.c4x': source });
            assert.strictEqual(runRender(['a.c4x', '-o', 'out.svg'], io), RENDER_EXIT_NOT_RENDERED);
            assert.match(io.err, rule);
            assert.match(io.err, said);
            assert.strictEqual(io.out, '');
            assert.deepStrictEqual(io.writes, []);
        }
    });

    it('escapes diagram text in findings so a label cannot forge a line', () => {
        const io = fakeIo({ 'a.c4x': 'graph TB\nSystem(a, "x\u001b[2Jfake‮", "")\n' });
        runRender(['a.c4x'], io);
        // eslint-disable-next-line no-control-regex -- the test looks for raw control characters
        assert.doesNotMatch(io.err, /[\u001b‮]/);
    });

    it('format png is reserved: the SVG is written and the run says PNG is not available', () => {
        const io = fakeIo({ 'a.c4x': VALID });
        assert.strictEqual(runRender(['a.c4x', '--format', 'png'], io), RENDER_EXIT_OK);
        assert.match(io.out, /^<\?xml/);
        assert.match(io.err, /PNG is not available in this version/);
    });

    it('exits 2 for usage and input errors', () => {
        const cases: ReadonlyArray<[string[], RegExp]> = [
            [['--theme', 'auto', 'a.c4x'], /--theme must be one of/],
            [['--format', 'pdf', 'a.c4x'], /--format must be one of/],
            [['--view', '-1', 'a.c4x'], /--view must be a whole number/],
            [['--view'], /--view needs a value/],
            [['--bogus'], /unknown option --bogus/],
            [['a.c4x', 'b.c4x'], /one file at a time/],
            [['-o', 'x.svg', '-o', 'y.svg', 'a.c4x'], /--output may be given once/],
            [['--output=', 'a.c4x'], /--output needs a file name/],
            [['missing.c4x'], /missing\.c4x: cannot be read/],
            [['--view', '1', 'a.c4x'], /view 1 does not exist/],
            [['empty.c4x'], /The source is empty/],
            [['big.c4x'], /big\.c4x: larger than 1 MiB/],
            [['eio.c4x'], /eio\.c4x: cannot be read/],
        ];
        for (const [args, message] of cases) {
            const io = fakeIo({ 'a.c4x': VALID, 'empty.c4x': '  \n', 'big.c4x': 'x'.repeat(MAX_MCP_SOURCE_BYTES + 1) });
            const readFile = io.readFile;
            io.readFile = (file, maxBytes) => {
                if (file.endsWith('eio.c4x')) { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); }
                return readFile(file, maxBytes);
            };
            assert.strictEqual(runRender(args, io), RENDER_EXIT_USAGE, `${args.join(' ')}: ${io.err}`);
            assert.match(io.err, message, args.join(' '));
            assert.deepStrictEqual(io.writes, []);
        }
    });

    it('treats arguments after -- as file names', () => {
        const io = fakeIo({ '--theme': VALID });
        assert.strictEqual(runRender(['--', '--theme'], io), RENDER_EXIT_OK, io.err);
    });

    it('prints help and version', () => {
        for (const args of [['-h'], ['--help']]) {
            const io = fakeIo();
            assert.strictEqual(runRender(args, io), RENDER_EXIT_OK);
            assert.strictEqual(io.out, C4X_USAGE);
        }
        const io = fakeIo();
        assert.strictEqual(runRender(['--version'], io), RENDER_EXIT_OK);
        assert.strictEqual(io.out, `${version}\n`);
        assert.match(C4X_USAGE, new RegExp(`over ${MAX_RENDER_ELEMENTS} elements and boundaries or\\n${MAX_RENDER_RELATIONSHIPS} relationships`));
    });

    it('c4x dispatches render, help and version, and refuses an unknown command', () => {
        const render = fakeIo({ 'a.c4x': VALID });
        assert.strictEqual(runC4x(['render', 'a.c4x'], render), RENDER_EXIT_OK);
        const bare = fakeIo();
        assert.strictEqual(runC4x([], bare), RENDER_EXIT_USAGE);
        assert.strictEqual(bare.err, C4X_USAGE);
        const help = fakeIo();
        assert.strictEqual(runC4x(['--help'], help), RENDER_EXIT_OK);
        assert.strictEqual(help.out, C4X_USAGE);
        const versionIo = fakeIo();
        assert.strictEqual(runC4x(['--version'], versionIo), RENDER_EXIT_OK);
        assert.strictEqual(versionIo.out, `${version}\n`);
        const unknown = fakeIo();
        assert.strictEqual(runC4x([`lint\u001b${'y'.repeat(200)}`], unknown), RENDER_EXIT_USAGE);
        assert.match(unknown.err, /^c4x: unknown command lint\\x1by{95}; commands: render/);
    });

    it('a read error on standard input is exit 2, not an exception', () => {
        const io = fakeIo();
        io.readStdin = () => { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); };
        assert.strictEqual(runRender(['-'], io), RENDER_EXIT_USAGE);
        assert.match(io.err, /standard input: cannot be read/);
    });

    it('readAtMost reads at most limit + 1 bytes, whatever the source, and throws a real read error', () => {
        // A source that never ends (a device, a file still growing): it stops one byte past the limit.
        let requested = 0;
        const endless = (_fd: number, buffer: Buffer, offset: number, length: number) => { requested += length; buffer.fill(0x61, offset, offset + length); return length; };
        const read = readAtMost(9, 10, endless);
        assert.strictEqual(read.length, 11);
        assert.strictEqual(requested, 11, 'asked for no more than limit + 1 bytes');
        assert.strictEqual(boundedText(read, 10), undefined);
        // Short reads, a would-block retry and end of file assemble the whole text.
        const chunks = [Buffer.from('graph '), 'EAGAIN', Buffer.from('TB\n')];
        const piecewise = (_fd: number, buffer: Buffer, offset: number) => {
            const next = chunks.shift();
            if (next === undefined) { return 0; }
            if (next === 'EAGAIN') { throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' }); }
            (next as Buffer).copy(buffer, offset);
            return (next as Buffer).length;
        };
        assert.strictEqual(readAtMost(0, 100, piecewise).toString(), 'graph TB\n');
        const windowsEof = () => { throw Object.assign(new Error('EOF'), { code: 'EOF' }); };
        assert.strictEqual(readAtMost(0, 100, windowsEof).length, 0);
        const eio = () => { throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); };
        assert.throws(() => readAtMost(0, 100, eio), /EIO/);
    });

    it('refuses an --output that is a symbolic or hard link to the input, and leaves the source intact', () => {
        const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-render-alias-')));
        try {
            const source = path.join(dir, 'a.c4x');
            fs.writeFileSync(source, VALID);
            fs.symlinkSync(source, path.join(dir, 'soft.svg'));
            fs.linkSync(source, path.join(dir, 'hard.svg'));
            for (const output of ['soft.svg', 'hard.svg']) {
                const io = { ...renderProcessIo(), cwd: dir, out: '', err: '' } as RenderIo & { out: string; err: string };
                // The worker runs a bundle file; in-process the engine is called directly (render-deadline.test.ts covers the worker).
                io.render = (code, options) => checkC4xSource(code, options);
                io.stdout = text => { io.out += text; };
                io.stderr = text => { io.err += text; };
                assert.strictEqual(runRender(['a.c4x', '-o', output], io), RENDER_EXIT_USAGE, `${output}: ${io.err}`);
                assert.match(io.err, /refusing to overwrite the diagram source/);
                assert.strictEqual(fs.readFileSync(source, 'utf8'), VALID, `${output}: the source was truncated`);
            }
            // A different, existing file is overwritten as asked.
            fs.writeFileSync(path.join(dir, 'other.svg'), 'old');
            const io = { ...renderProcessIo(), cwd: dir } as RenderIo;
            io.render = (code, options) => checkC4xSource(code, options);
            io.stdout = () => undefined;
            io.stderr = () => undefined;
            assert.strictEqual(runRender(['a.c4x', '-o', 'other.svg'], io), RENDER_EXIT_OK);
            assert.match(fs.readFileSync(path.join(dir, 'other.svg'), 'utf8'), /<\/svg>$/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('the process adapter reads and writes real files', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-render-io-'));
        try {
            const io = renderProcessIo();
            const file = path.join(dir, 'a.c4x');
            fs.writeFileSync(file, VALID);
            assert.strictEqual(io.readFile(file, 1024), VALID);
            assert.strictEqual(io.readFile(file, Buffer.byteLength(VALID)), VALID, 'exactly at the bound');
            assert.strictEqual(io.readFile(file, Buffer.byteLength(VALID) - 1), undefined, 'one byte over');
            assert.throws(() => io.readFile(path.join(dir, 'missing.c4x'), 1024));
            assert.strictEqual(io.sameFile(file, file), true);
            // Its render runs the deadline worker after the checks; a source the checks refuse never starts one.
            assert.strictEqual(io.render('graph TB\nNot[valid\n', { lint: { enabled: true } as never }).status, 'invalid');
            assert.throws(() => io.sameFile(file, path.join(dir, 'missing.svg')));
            io.writeFile(path.join(dir, 'b.svg'), '<svg/>');
            assert.strictEqual(fs.readFileSync(path.join(dir, 'b.svg'), 'utf8'), '<svg/>');
            assert.strictEqual(io.cwd, process.cwd());
            assert.strictEqual(typeof io.readStdin, 'function');
            // Standard output and error are the process streams; an empty write shows nothing.
            io.stdout('');
            io.stderr('');
            assert.strictEqual(boundedText(Buffer.from('graph TB\n'), 9), 'graph TB\n');
            assert.strictEqual(boundedText(Buffer.from('graph TB\n'), 8), undefined, 'one byte over the bound');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
