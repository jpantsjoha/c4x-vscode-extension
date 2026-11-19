/**
 * Completion helpers for the notation attributes: `$shape`, the other element
 * attributes and the `elementStyle` keys. Pure and VS Code-free so they can be
 * unit tested directly; the provider turns the entries into completion items.
 */

import { StyleKey, drawnShapeNames, styleKeyNames, styleShapeNames } from '../render/elementStyle';

/** One offered attribute name, such as `$shape`, with the help shown beside it. */
export interface AttributeEntry {
    /** The name without its `$`. */
    readonly name: string;
    readonly detail: string;
    readonly documentation: string;
    /** Text inserted after the `$`, as a VS Code snippet. */
    readonly snippet: string;
}

/** One offered shape name. */
export interface ShapeEntry {
    readonly name: string;
    /** True when the renderer draws it; the others draw the theme rectangle. */
    readonly drawn: boolean;
}

const SHAPE_HELP: { readonly [name: string]: string } = {
    Person: 'a person: a head over a rounded body',
    Cylinder: 'a database',
    Bucket: 'an object store',
    Folder: 'files or a file system',
    WebBrowser: 'a web page or single-page app',
    Terminal: 'a command-line tool',
    Box: 'a plain rectangle',
    RoundedBox: 'a rectangle with rounded corners',
};

/** What the shape is for, in a few words; empty for a shape the renderer does not draw. */
export function shapeHelp(name: string): string {
    return SHAPE_HELP[name] ?? '';
}

/** Attributes an element can carry, in the order they are offered. */
export const ELEMENT_ATTRIBUTES: readonly AttributeEntry[] = [
    {
        name: 'code',
        detail: 'Map this Container or Component to source code',
        documentation: 'Comma-separated, workspace-relative globs naming the code this element owns, e.g. ' +
            '`$code="src/parser/**, src/extension.ts"`. Used by **C4X: Export Architecture Conformance**.',
        snippet: 'code="${1:src/}$0"',
    },
    {
        name: 'shape',
        detail: 'Draw this element in a named shape',
        documentation: 'One of the 19 shape names, case sensitive: `Person`, `Cylinder`, `Bucket`, `Folder`, ' +
            '`WebBrowser`, `Terminal`, `Box` and `RoundedBox` are drawn; the others draw the theme rectangle. ' +
            'Overrides a shape a tag style or the theme sets.',
        snippet: 'shape="${1|Cylinder,Bucket,Folder,WebBrowser,Terminal,Person,RoundedBox,Box|}"$0',
    },
    {
        name: 'sprite',
        detail: 'Draw a bundled icon on this element',
        documentation: 'The id of a bundled icon, e.g. `$sprite="c4xicons.aws.simple-storage-service-bucket"`.',
        snippet: 'sprite="${1:c4xicons.}$0"',
    },
    {
        name: 'tags',
        detail: 'Tag this element for `elementStyle` rules and the key',
        documentation: 'Comma-separated tag names, e.g. `$tags="Queue, Internal"`. A tag selects the `elementStyle` rules that style the element.',
        snippet: 'tags="${1:Tag}"$0',
    },
];

const STYLE_KEY_HELP: { readonly [key in StyleKey]: { readonly detail: string; readonly snippet: string } } = {
    stroke: { detail: 'Outline colour, a hex colour', snippet: 'stroke="${1:#BF101D}"$0' },
    background: { detail: 'Fill colour, a hex colour', snippet: 'background="${1:#FFF3E0}"$0' },
    color: { detail: 'Text colour, a hex colour', snippet: 'color="${1:#111111}"$0' },
    shape: { detail: 'Outline shape', snippet: 'shape="${1|Cylinder,Bucket,Folder,WebBrowser,Terminal,Person,RoundedBox,Box|}"$0' },
    sprite: { detail: 'Icon drawn on the element', snippet: 'sprite="${1:c4xicons.}$0"' },
    border: { detail: 'Outline style: solid, dashed or dotted', snippet: 'border="${1|solid,dashed,dotted|}"$0' },
    strokeWidth: { detail: 'Outline width in pixels, "1" to "10"', snippet: 'strokeWidth="${1:2}"$0' },
    legend: { detail: 'Text for this style in the diagram key, at most 120 characters', snippet: 'legend="${1:Meaning}"$0' },
};

/** The `elementStyle` keys, in documentation order, with their help. */
export function styleKeyEntries(): AttributeEntry[] {
    return styleKeyNames().map(key => {
        const help = STYLE_KEY_HELP[key];
        return {
            name: key,
            detail: help.detail,
            documentation: `\`elementStyle Tag $${key}="value"\`. Every value is quoted.`,
            snippet: help.snippet,
        };
    });
}

/** Every shape name, drawn ones first in the renderer's order, then the rest in Structurizr's order. */
export function shapeEntries(): ShapeEntry[] {
    const drawn = new Set(drawnShapeNames());
    const all = styleShapeNames();
    const names = [...all.filter(name => drawn.has(name)), ...all.filter(name => !drawn.has(name))];
    return names.map(name => ({ name, drawn: drawn.has(name) }));
}

/** Border style values offered after `$border="`. */
export const BORDER_VALUES: readonly string[] = ['solid', 'dashed', 'dotted'];

function isInsideQuotes(text: string, offset: number): boolean {
    let inQuote = false;
    for (let i = 0; i < offset; i++) {
        if (text.charAt(i) === '"') {
            inQuote = !inQuote;
        }
    }
    return inQuote;
}

/** A value being typed in `$name="...`. */
export interface ValueContext {
    /** What has been typed after the opening quote. */
    readonly typed: string;
}

/**
 * When the cursor sits inside an unterminated `$<name>="` value (outside any
 * other quoted text), return what has been typed after the quote.
 */
export function attributeValueContext(linePrefix: string, name: string): ValueContext | undefined {
    const match = new RegExp('\\$' + name + '\\s*=\\s*"([^"]*)$').exec(linePrefix);
    if (!match || isInsideQuotes(linePrefix, match.index)) {
        return undefined;
    }
    return { typed: match[1] };
}

/** Cursor after `$shape="` (or `$shape="Cyl`). */
export function shapeValueContext(linePrefix: string): ValueContext | undefined {
    return attributeValueContext(linePrefix, 'shape');
}

/** Cursor after `$border="`. */
export function borderValueContext(linePrefix: string): ValueContext | undefined {
    return attributeValueContext(linePrefix, 'border');
}

/**
 * True when the cursor follows a `$` (optionally with part of a key) on an
 * `elementStyle Tag ...` line, at the start of a key: after the tag or after a comma.
 */
export function styleKeyContext(linePrefix: string): { readonly typed: string } | undefined {
    const match = /\$([A-Za-z]*)$/.exec(linePrefix);
    if (!match || isInsideQuotes(linePrefix, match.index)) {
        return undefined;
    }
    const before = linePrefix.slice(0, match.index).replace(/"[^"]*"/g, '""');
    // Quoted text is blanked, so `elementStyle "Software System" $stroke="#fff", $` reads
    // `elementStyle "" $stroke="", $`: a tag, then zero or more complete keys, each ended by a comma.
    if (!/^\s*elementStyle\s+(""|[^\s",$]+)\s*(,\s*)?(\$[A-Za-z]+\s*=\s*""\s*,\s*)*$/.test(before)) {
        return undefined;
    }
    return { typed: match[0] };
}
