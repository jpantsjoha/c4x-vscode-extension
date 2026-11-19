/**
 * A strict, minimal XML 1.0 parser for the security tests (#362).
 *
 * The output-safety tests must judge the SVG the engine emits by its structure,
 * not by searching the text: a check that greps for `<script` passes when the
 * markup is broken in some other way. No XML parser is a dependency of this
 * repository and adding one needs the network, so this file parses the subset
 * of XML an SVG document uses and REJECTS everything else: a DOCTYPE (entity
 * expansion), an unknown entity, an unquoted or duplicate attribute, a stray
 * `<` or `&`, a mismatched or unclosed tag, and any character XML forbids.
 * Rejection is the point: an injection that breaks well-formedness fails here.
 */

export interface XmlElement {
    readonly kind: 'element';
    readonly name: string;
    readonly attributes: ReadonlyMap<string, string>;
    readonly children: ReadonlyArray<XmlNode>;
}

export interface XmlText {
    readonly kind: 'text';
    readonly value: string;
}

export type XmlNode = XmlElement | XmlText;

export class XmlSyntaxError extends Error {}

const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/;
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHAR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const PREDEFINED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(raw: string, where: number): string {
    return raw.replace(/&([^;&<]*);|&/g, (match, body: string | undefined) => {
        if (body === undefined) {
            throw new XmlSyntaxError(`bare '&' near offset ${where}`);
        }
        if (Object.prototype.hasOwnProperty.call(PREDEFINED, body)) {
            return PREDEFINED[body];
        }
        const numeric = /^#(?:x([0-9a-fA-F]+)|([0-9]+))$/.exec(body);
        if (numeric) {
            const code = numeric[1] !== undefined ? parseInt(numeric[1], 16) : parseInt(numeric[2], 10);
            const char = String.fromCodePoint(code);
            if (ILLEGAL_CHAR.test(char) || code === 0) {
                throw new XmlSyntaxError(`character reference to a forbidden character near offset ${where}`);
            }
            return char;
        }
        throw new XmlSyntaxError(`unknown entity '${match}' near offset ${where}`);
    });
}

/** Parse a complete document with exactly one root element. Throws `XmlSyntaxError`. */
export function parseXml(source: string): XmlElement {
    const illegal = ILLEGAL_CHAR.exec(source);
    if (illegal) {
        throw new XmlSyntaxError(`forbidden character U+${illegal[0].charCodeAt(0).toString(16)} at offset ${illegal.index}`);
    }
    let pos = 0;
    const skipMisc = () => {
        for (;;) {
            const ws = /^\s*/.exec(source.slice(pos));
            pos += ws ? ws[0].length : 0;
            if (source.startsWith('<?', pos)) {
                const end = source.indexOf('?>', pos);
                if (end === -1) { throw new XmlSyntaxError('unterminated processing instruction'); }
                pos = end + 2;
            } else if (source.startsWith('<!--', pos)) {
                const end = source.indexOf('-->', pos + 4);
                if (end === -1) { throw new XmlSyntaxError('unterminated comment'); }
                pos = end + 3;
            } else if (source.startsWith('<!', pos)) {
                throw new XmlSyntaxError(`declaration (DOCTYPE or similar) at offset ${pos} is not allowed`);
            } else {
                return;
            }
        }
    };

    const parseElement = (): XmlElement => {
        if (source[pos] !== '<') { throw new XmlSyntaxError(`expected '<' at offset ${pos}`); }
        pos++;
        const nameMatch = NAME.exec(source.slice(pos));
        if (!nameMatch) { throw new XmlSyntaxError(`expected a tag name at offset ${pos}`); }
        const name = nameMatch[0];
        pos += name.length;
        const attributes = new Map<string, string>();
        for (;;) {
            const ws = /^\s*/.exec(source.slice(pos))![0];
            pos += ws.length;
            if (source.startsWith('/>', pos)) {
                pos += 2;
                return { kind: 'element', name, attributes, children: [] };
            }
            if (source[pos] === '>') {
                pos++;
                break;
            }
            if (ws.length === 0) { throw new XmlSyntaxError(`expected whitespace before an attribute at offset ${pos}`); }
            const attr = NAME.exec(source.slice(pos));
            if (!attr) { throw new XmlSyntaxError(`expected an attribute name at offset ${pos}`); }
            pos += attr[0].length;
            const eq = /^\s*=\s*/.exec(source.slice(pos));
            if (!eq) { throw new XmlSyntaxError(`attribute ${attr[0]} has no value at offset ${pos}`); }
            pos += eq[0].length;
            const quote = source[pos];
            if (quote !== '"' && quote !== "'") { throw new XmlSyntaxError(`attribute ${attr[0]} is not quoted at offset ${pos}`); }
            const end = source.indexOf(quote, pos + 1);
            if (end === -1) { throw new XmlSyntaxError(`unterminated attribute ${attr[0]}`); }
            const raw = source.slice(pos + 1, end);
            if (raw.includes('<')) { throw new XmlSyntaxError(`'<' inside attribute ${attr[0]} at offset ${pos}`); }
            if (attributes.has(attr[0])) { throw new XmlSyntaxError(`duplicate attribute ${attr[0]} on <${name}>`); }
            attributes.set(attr[0], decodeEntities(raw, pos));
            pos = end + 1;
        }
        const children: XmlNode[] = [];
        for (;;) {
            if (pos >= source.length) { throw new XmlSyntaxError(`<${name}> is not closed`); }
            if (source.startsWith('</', pos)) {
                pos += 2;
                const close = NAME.exec(source.slice(pos));
                if (!close || close[0] !== name) { throw new XmlSyntaxError(`</${close ? close[0] : '?'}> closes <${name}> at offset ${pos}`); }
                pos += close[0].length;
                const tail = /^\s*>/.exec(source.slice(pos));
                if (!tail) { throw new XmlSyntaxError(`malformed end tag at offset ${pos}`); }
                pos += tail[0].length;
                return { kind: 'element', name, attributes, children };
            }
            if (source.startsWith('<!--', pos)) {
                const end = source.indexOf('-->', pos + 4);
                if (end === -1) { throw new XmlSyntaxError('unterminated comment'); }
                pos = end + 3;
                continue;
            }
            if (source.startsWith('<![CDATA[', pos)) {
                const end = source.indexOf(']]>', pos);
                if (end === -1) { throw new XmlSyntaxError('unterminated CDATA section'); }
                children.push({ kind: 'text', value: source.slice(pos + 9, end) });
                pos = end + 3;
                continue;
            }
            if (source.startsWith('<!', pos) || source.startsWith('<?', pos)) {
                throw new XmlSyntaxError(`declaration inside <${name}> at offset ${pos}`);
            }
            if (source[pos] === '<') {
                children.push(parseElement());
                continue;
            }
            const next = source.indexOf('<', pos);
            const end = next === -1 ? source.length : next;
            const raw = source.slice(pos, end);
            if (raw.includes(']]>')) { throw new XmlSyntaxError(`']]>' in text at offset ${pos}`); }
            children.push({ kind: 'text', value: decodeEntities(raw, pos) });
            pos = end;
        }
    };

    skipMisc();
    const root = parseElement();
    skipMisc();
    if (pos !== source.length) {
        throw new XmlSyntaxError(`content after the root element at offset ${pos}`);
    }
    return root;
}

/** Every element in document order, the root first. */
export function allElements(root: XmlElement): XmlElement[] {
    const out: XmlElement[] = [];
    const visit = (element: XmlElement) => {
        out.push(element);
        element.children.forEach(child => { if (child.kind === 'element') { visit(child); } });
    };
    visit(root);
    return out;
}

/** The concatenated text of an element and its descendants. */
export function textOf(element: XmlElement): string {
    return element.children.map(child => child.kind === 'text' ? child.value : textOf(child)).join('');
}
