/**
 * `c4x render` (#353): draws one C4X diagram to SVG outside VS Code, through
 * `checkC4xSource`, the engine the preview uses. No `vscode` import anywhere
 * below this file; the bundle `cli/c4x.cjs` is built from `./c4xMain.ts`.
 *
 * Writes: the SVG goes to standard output, or to the one file the user names
 * with `-o`/`--output`. No other path is ever written, and none is derived
 * from diagram content. Findings and the summary go to standard error.
 *
 * Exit codes: 0 when the SVG was written; 1 when the source has a syntax,
 * input-limit or model error, or the render is too large (findings only, no
 * SVG); 2 for a usage or input error, or a fault in the engine.
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeLintOptions } from '../model/lint';
import { MAX_MCP_SOURCE_BYTES } from './limits';
import { LintEngineError, type HeadlessFinding } from './lintSource';
import { escapeControl } from './report';
import { DEFAULT_RENDER_THEME, MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, RENDER_FORMATS, RENDER_THEMES, RENDER_TIME_BUDGET_MS, type RenderFormat, type RenderOptions, type RenderOutcome } from './renderSource';
import { renderWithDeadline } from './renderWorker';
// The extension's version: c4x draws with the engine of that release.
import { version as C4X_VERSION } from '../../package.json';

export const RENDER_EXIT_OK = 0;
export const RENDER_EXIT_NOT_RENDERED = 1;
export const RENDER_EXIT_USAGE = 2;
/** The render passed the deadline (RENDER_TIME_BUDGET_MS) and was stopped: findings only, no SVG. */
export const RENDER_EXIT_TOO_SLOW = 3;

/** Everything `c4x` touches outside its arguments, so tests can run it in-process. */
export interface RenderIo {
    readonly cwd: string;
    stdout(text: string): void;
    stderr(text: string): void;
    /**
     * At most `maxBytes` of the file as text, or undefined when it holds more.
     * Reads no more than `maxBytes + 1` bytes, so a special or growing file
     * cannot make it read without bound. Throws when the file cannot be read.
     */
    readFile(file: string, maxBytes: number): string | undefined;
    /** Standard input, bounded the same way. Throws when it cannot be read. */
    readStdin(maxBytes: number): string | undefined;
    /** True when both paths exist and name the same file (device and inode), through links included. */
    sameFile(a: string, b: string): boolean;
    /** Used only for the `-o` path the user named. */
    writeFile(file: string, text: string): void;
    /** Check and draw: in the process, in a worker stopped at the deadline (./renderWorker.ts). */
    render(source: string, options: RenderOptions): RenderOutcome;
}

export const C4X_USAGE = `Usage: c4x render [options] [file.c4x | -]

Draws a C4X diagram as SVG with the same parser, layout and renderer as the
VS Code extension's preview. Reads the file named, or standard input when the
file is "-" or omitted. Writes the SVG to standard output, or to the one file
named with --output; findings and a summary go to standard error.

Options:
  --theme <${[...RENDER_THEMES.keys()].join('|')}>
                         Theme to draw (default: ${DEFAULT_RENDER_THEME})
  --format <svg|png>     Output format (default: svg). png is reserved: this
                         version writes the SVG and says PNG is not available
  --view <n>             0-based view to draw (default: 0; a C4X source has one)
  -o, --output <file>    Write the SVG to this file instead of standard output
  -h, --help             Show this help
  --version              Print the c4x version

Exit codes: 0 SVG written; 1 not drawn (syntax, input-limit or model error, or
a render over the size bounds); 2 usage, input or internal error; 3 not drawn:
the render took longer than ${RENDER_TIME_BUDGET_MS} ms and was stopped.
Input: at most 1 MiB of C4X. Diagrams over ${MAX_RENDER_ELEMENTS} elements and boundaries or
${MAX_RENDER_RELATIONSHIPS} relationships, or whose SVG exceeds 2 MiB, are not drawn.
`;

interface RenderArgs {
    readonly input?: string;
    readonly theme?: string;
    readonly format: RenderFormat;
    readonly view?: number;
    readonly output?: string;
    readonly help: boolean;
    readonly version: boolean;
}

class UsageError extends Error {}

function parseRenderArgs(argv: readonly string[]): RenderArgs {
    let input: string | undefined;
    let theme: string | undefined;
    let format: RenderFormat = 'svg';
    let view: number | undefined;
    let output: string | undefined;
    let help = false;
    let version = false;
    let literal = false;

    const valueOf = (flag: string, inline: string | undefined, index: number): [string, number] => {
        if (inline !== undefined) { return [inline, index]; }
        const next = argv[index + 1];
        if (next === undefined) { throw new UsageError(`${flag} needs a value`); }
        return [next, index + 1];
    };
    const setInput = (value: string) => {
        if (input !== undefined) { throw new UsageError('c4x render draws one file at a time'); }
        input = value;
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (literal || !arg.startsWith('-') || arg === '-') {
            setInput(arg);
            continue;
        }
        if (arg === '--') { literal = true; continue; }
        const equals = arg.indexOf('=');
        const flag = equals === -1 ? arg : arg.slice(0, equals);
        const inline = equals === -1 ? undefined : arg.slice(equals + 1);
        let value: string;
        switch (flag) {
            case '--theme':
                [value, index] = valueOf(flag, inline, index);
                if (!RENDER_THEMES.has(value)) { throw new UsageError(`--theme must be one of ${[...RENDER_THEMES.keys()].join(', ')}`); }
                theme = value;
                break;
            case '--format':
                [value, index] = valueOf(flag, inline, index);
                if (!(RENDER_FORMATS as readonly string[]).includes(value)) { throw new UsageError(`--format must be one of ${RENDER_FORMATS.join(', ')}`); }
                format = value as RenderFormat;
                break;
            case '--view':
                [value, index] = valueOf(flag, inline, index);
                if (!/^\d{1,6}$/.test(value)) { throw new UsageError('--view must be a whole number, 0 or more'); }
                view = Number(value);
                break;
            case '-o':
            case '--output':
                if (output !== undefined) { throw new UsageError('--output may be given once'); }
                [output, index] = valueOf(flag, inline, index);
                if (output === '') { throw new UsageError('--output needs a file name'); }
                break;
            case '-h':
            case '--help':
                help = true;
                break;
            case '--version':
                version = true;
                break;
            default:
                throw new UsageError(`unknown option ${flag}`);
        }
    }
    return { input, theme, format, view, output, help, version };
}

/** One finding as `line:column severity ruleId message hint`, escaped so diagram text cannot forge a line. */
export function describeRenderFinding(finding: HeadlessFinding): string {
    const text = finding.hint ? `${finding.message} ${finding.hint}` : finding.message;
    return escapeControl(`${finding.line}:${finding.column} ${finding.severity} ${finding.ruleId} ${text}`);
}

function readSource(args: RenderArgs, io: RenderIo, fail: (message: string) => void): string | undefined {
    const fromStdin = args.input === undefined || args.input === '-';
    const name = fromStdin ? 'standard input' : args.input!;
    let text: string | undefined;
    try {
        text = fromStdin ? io.readStdin(MAX_MCP_SOURCE_BYTES) : io.readFile(path.resolve(io.cwd, args.input!), MAX_MCP_SOURCE_BYTES);
    } catch {
        fail(`${name}: cannot be read`);
        return undefined;
    }
    if (text === undefined) { fail(`${name}: larger than 1 MiB, not drawn`); }
    return text;
}

/** Run `c4x render` with the arguments after `render`, and return its exit code. Never throws for bad input. */
export function runRender(argv: readonly string[], io: RenderIo): number {
    const say = (message: string) => io.stderr(`c4x render: ${escapeControl(message)}\n`);
    let args: RenderArgs;
    try {
        args = parseRenderArgs(argv);
    } catch (error) {
        io.stderr(`c4x render: ${escapeControl((error as Error).message)}\n\n${C4X_USAGE}`);
        return RENDER_EXIT_USAGE;
    }
    if (args.help) { io.stdout(C4X_USAGE); return RENDER_EXIT_OK; }
    if (args.version) { io.stdout(`${C4X_VERSION}\n`); return RENDER_EXIT_OK; }
    if (args.output !== undefined && args.input !== undefined && args.input !== '-') {
        const output = path.resolve(io.cwd, args.output);
        const input = path.resolve(io.cwd, args.input);
        // The same path, or another name for the same file: a symbolic or hard link.
        let same = output === input;
        try { same ||= io.sameFile(output, input); } catch { /* an output that does not exist yet is not the input */ }
        if (same) {
            say('--output names the input file; refusing to overwrite the diagram source');
            return RENDER_EXIT_USAGE;
        }
    }

    let inputFailed = false;
    const source = readSource(args, io, message => { say(message); inputFailed = true; });
    if (inputFailed || source === undefined) { return RENDER_EXIT_USAGE; }

    let outcome;
    try {
        outcome = io.render(source, { theme: args.theme, format: args.format, view: args.view, lint: normalizeLintOptions(true, undefined) });
    } catch (error) {
        say(error instanceof LintEngineError ? error.message : 'unexpected failure in the C4X engine');
        return RENDER_EXIT_USAGE;
    }
    for (const finding of outcome.findings) {
        io.stderr(`${describeRenderFinding(finding)}\n`);
    }
    if (outcome.status === 'bad-options' || outcome.status === 'empty') {
        say(outcome.message ?? 'nothing to draw');
        return RENDER_EXIT_USAGE;
    }
    if (outcome.status === 'timed-out') {
        say(`not drawn: the render took longer than ${RENDER_TIME_BUDGET_MS} ms and was stopped`);
        return RENDER_EXIT_TOO_SLOW;
    }
    if (outcome.status !== 'rendered' || outcome.svg === undefined) {
        say(outcome.status === 'too-large' ? 'not drawn: the render is too large' : 'not drawn: fix the errors above');
        return RENDER_EXIT_NOT_RENDERED;
    }
    if (outcome.message) { say(outcome.message); }
    if (args.output !== undefined) {
        try {
            io.writeFile(path.resolve(io.cwd, args.output), outcome.svg);
        } catch {
            say(`${args.output}: cannot be written`);
            return RENDER_EXIT_USAGE;
        }
    } else {
        io.stdout(outcome.svg.endsWith('\n') ? outcome.svg : `${outcome.svg}\n`);
    }
    say(`drawn in the ${outcome.theme} theme: ${outcome.svgBytes} bytes, ${outcome.findings.length} finding${outcome.findings.length === 1 ? '' : 's'}`);
    return RENDER_EXIT_OK;
}

/** Bytes read from standard input as text, or undefined when there are more than `maxBytes`. */
export function boundedText(data: Buffer, maxBytes: number): string | undefined {
    return data.length > maxBytes ? undefined : data.toString('utf8');
}

/** The one call `readAtMost` makes, so a test can inject a failing read. */
export type ReadSync = (fd: number, buffer: Buffer, offset: number, length: number, position: null) => number;

/**
 * Read from `fd` until end of file or until `maxBytes + 1` bytes are in hand,
 * whichever comes first: never more, whatever the file is (a pipe, a device,
 * a file still growing). A read error other than "try again" is thrown.
 */
export function readAtMost(fd: number, maxBytes: number, readSync: ReadSync = fs.readSync): Buffer {
    const buffer = Buffer.alloc(maxBytes + 1);
    let filled = 0;
    while (filled < buffer.length) {
        let read: number;
        try {
            read = readSync(fd, buffer, filled, buffer.length - filled, null);
        } catch (error) {
            // A non-blocking standard input with nothing yet: wait for it.
            if ((error as NodeJS.ErrnoException).code === 'EAGAIN') { continue; }
            // Windows reports the end of a closed pipe as EOF.
            if ((error as NodeJS.ErrnoException).code === 'EOF') { break; }
            throw error;
        }
        if (read === 0) { break; }
        filled += read;
    }
    return buffer.subarray(0, filled);
}

/** The real process: used by `./c4xMain.ts`. */
export function renderProcessIo(): RenderIo {
    return {
        cwd: process.cwd(),
        stdout: text => process.stdout.write(text),
        stderr: text => process.stderr.write(text),
        readFile: (file, maxBytes) => {
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the user asked to draw
            const fd = fs.openSync(file, 'r');
            try { return boundedText(readAtMost(fd, maxBytes), maxBytes); } finally { fs.closeSync(fd); }
        },
        readStdin: maxBytes => boundedText(readAtMost(0, maxBytes), maxBytes),
        sameFile: (a, b) => {
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- the --output path and the input the user named
            const [first, second] = [fs.statSync(a), fs.statSync(b)];
            return first.dev === second.dev && first.ino === second.ino;
        },
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the one --output path the user named
        writeFile: (file, text) => fs.writeFileSync(file, text),
        render: (source, options) => renderWithDeadline(source, options),
    };
}

/** `c4x <command> …`: dispatch. Only `render` today; `c4x-lint` stays the lint command. */
export function runC4x(argv: readonly string[], io: RenderIo): number {
    const [command, ...rest] = argv;
    if (command === 'render') { return runRender(rest, io); }
    if (command === '--version') { io.stdout(`${C4X_VERSION}\n`); return RENDER_EXIT_OK; }
    if (command === undefined || command === '-h' || command === '--help') {
        (command === undefined ? io.stderr : io.stdout)(C4X_USAGE);
        return command === undefined ? RENDER_EXIT_USAGE : RENDER_EXIT_OK;
    }
    io.stderr(`c4x: unknown command ${escapeControl(Array.from(command).slice(0, 100).join(''))}; commands: render\n\n${C4X_USAGE}`);
    return RENDER_EXIT_USAGE;
}
