/**
 * Branch coverage for the SaveAnchor fence scanner and model-identity hash:
 * unterminated and mismatched fences, indentation limits, CRLF line ends,
 * info strings, nested elements and the bounds assertion.
 *
 * Every case asserts which blocks were found, what they span, or the error.
 */
import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
    captureAnchor,
    createNativeDocumentBlock,
    findC4xFencedBlocks,
    resolveAnchor,
    SaveAnchorBlock,
} from '../../writeback/SaveAnchor';

const BACKTICKS = '```';

function documentOf(text: string, uri = 'file:///workspace/architecture.md'): vscode.TextDocument {
    return {
        uri: { toString: () => uri },
        version: 1,
        getText: () => text,
    } as vscode.TextDocument;
}

function blocksOf(text: string): SaveAnchorBlock[] {
    return findC4xFencedBlocks(documentOf(text));
}

function bodyOf(text: string): string {
    const block = blocksOf(text)[0];
    assert.ok(block, `expected one editable C4X fence in:\n${text}`);
    return text.slice(block.bodyRange.start, block.bodyRange.end);
}

function identityOf(text: string): string {
    return createNativeDocumentBlock(documentOf(text)).modelIdentity;
}

describe('SaveAnchor fence scanner — fence termination', () => {
    it('treats nothing after an unterminated fence of another marker as editable', () => {
        // The ~~~js fence is never closed, so by CommonMark the c4x fence below is its
        // body, not a diagram. Until 2026-09-09 the scanner resumed on the next line and
        // returned one editable block here.
        const text = ['~~~js', 'const x = 1;', '```c4x', 'graph TB', '    A[A]', '```', 'after'].join('\n');
        assert.deepStrictEqual(blocksOf(text), []);
    });

    it('still finds a c4x fence that precedes an unterminated fence, with its range and ordinal intact', () => {
        const text = ['```c4x', 'graph TB', '    A[A]', '```', '~~~js', 'const x = 1;'].join('\n');
        assert.strictEqual(blocksOf(text).length, 1);
        assert.strictEqual(bodyOf(text), 'graph TB\n    A[A]\n');
        assert.strictEqual(blocksOf(text)[0].blockOrdinal, 0);
    });

    it('does not read a backtick fence whose info string contains a backtick as an opener', () => {
        // CommonMark forbids a backtick in a backtick fence's info string, so this prose
        // line is not a fence; treating it as one (and unterminated) would silence the
        // real diagram below it.
        const text = ['````  ```c4x ````', '', '```c4x', 'graph TB', '    A[A]', '```'].join('\n');
        assert.strictEqual(blocksOf(text).length, 1);
        assert.strictEqual(bodyOf(text), 'graph TB\n    A[A]\n');
    });

    it('ignores an opening fence that is never closed', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n`;

        assert.deepStrictEqual(blocksOf(text), []);
    });

    it('finds a properly closed c4x fence followed by prose', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS}\ntext\n`;

        assert.strictEqual(blocksOf(text).length, 1);
    });

    it("treats a c4x opener inside another fence's body as content, not a block", () => {
        // The js fence opens at line 0 and closes at the bare run below, so the
        // c4x opener between them is body text. The scanner must resume after the
        // closing line rather than re-reading the body, or it invents a c4x block.
        const text = `${BACKTICKS}js\nconst inner = true;\n${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS}\ntext\n`;

        assert.strictEqual(blocksOf(text).length, 0);
    });

    it('does not accept a closing fence shorter than the opening run', () => {
        const text = `\`\`\`\`c4x\ngraph TB\n${BACKTICKS}\nPerson(User, "User")\n\`\`\`\`\n`;

        assert.strictEqual(bodyOf(text), `graph TB\n${BACKTICKS}\nPerson(User, "User")\n`);
    });

    it('accepts a closing fence padded with trailing whitespace', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS}  \t\n`;

        assert.strictEqual(bodyOf(text), 'graph TB\nPerson(User, "User")\n');
    });

    it('rejects a closing fence followed by other text', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS} trailing\n`;

        assert.deepStrictEqual(blocksOf(text), []);
    });
});

describe('SaveAnchor fence scanner — fence syntax', () => {
    it('accepts a fence indented by up to three spaces', () => {
        const text = `   ${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n   ${BACKTICKS}\n`;

        assert.strictEqual(bodyOf(text), 'graph TB\nPerson(User, "User")\n');
    });

    it('ignores a fence indented by four spaces, which Markdown reads as a code block', () => {
        const text = `    ${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n    ${BACKTICKS}\n`;

        assert.deepStrictEqual(blocksOf(text), []);
    });

    it('ignores a run of fewer than three fence characters', () => {
        const text = '``c4x\ngraph TB\nPerson(User, "User")\n``\n';

        assert.deepStrictEqual(blocksOf(text), []);
    });

    it('ignores a line that opens with neither a backtick nor a tilde', () => {
        const text = 'plain text\nmore text\n';

        assert.deepStrictEqual(blocksOf(text), []);
    });

    it('reads only the first word of the info string as the language', () => {
        const text = `${BACKTICKS}c4x title="Component view"\ngraph TB\nPerson(User, "User")\n${BACKTICKS}\n`;

        assert.strictEqual(bodyOf(text), 'graph TB\nPerson(User, "User")\n');
    });

    it('does not treat a fence in another language as editable C4X', () => {
        const text = `${BACKTICKS}mermaid\ngraph TB\n${BACKTICKS}\n`;

        assert.deepStrictEqual(blocksOf(text), []);
    });
});

describe('SaveAnchor fence scanner — CRLF documents', () => {
    it('keeps the carriage return out of the fence line but inside the block body', () => {
        const text = `${BACKTICKS}c4x\r\ngraph TB\r\nPerson(User, "User")\r\n${BACKTICKS}\r\n`;

        const block = blocksOf(text)[0];
        assert.ok(block, 'expected a block in the CRLF document');
        assert.strictEqual(text.slice(block.bodyRange.start, block.bodyRange.end), 'graph TB\r\nPerson(User, "User")\r\n');
        assert.strictEqual(block.blockRange.start, 0);
        assert.strictEqual(block.blockRange.end, text.length);
    });

    it('resolves an anchor captured from a CRLF document', () => {
        const text = `${BACKTICKS}c4x\r\ngraph TB\r\nPerson(User, "User")\r\n${BACKTICKS}\r\n`;
        const document = documentOf(text);
        const anchor = captureAnchor(document, findC4xFencedBlocks(document)[0]);

        const resolution = resolveAnchor(document, anchor);

        assert.ok(resolution.valid, `expected the anchor to resolve, got: ${resolution.valid ? '' : resolution.reason}`);
    });
});

describe('SaveAnchor resolver — ordinal beyond the surviving blocks', () => {
    it('reports range_out_of_bounds when the anchored ordinal no longer exists', () => {
        const first = `${BACKTICKS}c4x\ngraph TB\nPerson(First, "First")\n${BACKTICKS}\n`;
        const second = `${BACKTICKS}c4x\ngraph TB\nPerson(Second, "Second")\n${BACKTICKS}\n`;
        const document = documentOf(first + second);
        const blocks = findC4xFencedBlocks(document);
        assert.strictEqual(blocks.length, 2, 'fixture must contain two C4X fences');

        const anchor = captureAnchor(document, blocks[1]);
        // The second fence is replaced by prose of at least the same length, so
        // the anchored range is still inside the document but ordinal 1 is gone.
        const padding = 'x'.repeat(second.length);
        const shrunk = documentOf(first + padding);

        assert.deepStrictEqual(resolveAnchor(shrunk, anchor), { valid: false, reason: 'range_out_of_bounds' });
    });
});

describe('SaveAnchor — bounds assertion on capture', () => {
    it('refuses to capture a block that runs past the end of the document', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS}\n`;
        const document = documentOf(text);
        const block = findC4xFencedBlocks(document)[0];
        const overrun: SaveAnchorBlock = {
            ...block,
            blockRange: { start: block.blockRange.start, end: text.length + 1 },
        };

        assert.throws(
            () => captureAnchor(document, overrun),
            (error: unknown) => error instanceof RangeError &&
                error.message === 'Save anchor block range is outside the source document.',
        );
    });

    it('captures a block that ends exactly at the end of the document', () => {
        const text = `${BACKTICKS}c4x\ngraph TB\nPerson(User, "User")\n${BACKTICKS}\n`;
        const document = documentOf(text);

        const anchor = captureAnchor(document, findC4xFencedBlocks(document)[0]);

        assert.strictEqual(anchor.blockRange.end, text.length);
    });
});

describe('SaveAnchor — model identity', () => {
    it('includes elements nested inside a deployment node', () => {
        const withApi = 'graph TB\nNode(Cluster, "Cluster")  {\n  Container(API, "API")\n}\n';
        const withGateway = 'graph TB\nNode(Cluster, "Cluster")  {\n  Container(Gateway, "API")\n}\n';

        assert.notStrictEqual(
            identityOf(withApi),
            identityOf(withGateway),
            'renaming a nested container must change the model identity',
        );
    });

    it('is insensitive to the declaration order of two elements that share an identifier', () => {
        const personFirst = 'graph TB\nPerson(A, "A")\nContainer(A, "A container")\n';
        const containerFirst = 'graph TB\nContainer(A, "A container")\nPerson(A, "A")\n';

        assert.strictEqual(
            identityOf(personFirst),
            identityOf(containerFirst),
            'the identity sort must break an id tie on the element type',
        );
    });

    it('still distinguishes two documents whose elements differ in type', () => {
        const asContainer = 'graph TB\nContainer(A, "A")\n';
        const asComponent = 'graph TB\nComponent(A, "A")\n';

        assert.notStrictEqual(identityOf(asContainer), identityOf(asComponent));
    });

    it('hashes an unparseable body to a stable placeholder identity', () => {
        assert.strictEqual(identityOf('graph TB\nPerson('), identityOf('not c4x at all {{{'));
    });
});
