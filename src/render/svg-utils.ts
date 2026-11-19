/**
 * Shared SVG utility functions used across render modules.
 */

/**
 * Characters XML 1.0 forbids anywhere in a document: C0 controls other than
 * tab, newline and carriage return; U+FFFE and U+FFFF; and UTF-16 surrogates
 * that are not part of a pair. A C4X quoted string may hold any of them, and
 * one of them in a label made the whole SVG malformed, so a browser opening an
 * exported file showed an XML error instead of the diagram (#362).
 */
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Escape text for an SVG text node or a double- or single-quoted attribute
 * value. Characters XML cannot carry become U+FFFD.
 */
export function escapeXml(text: string): string {
    return text
        .replace(XML_ILLEGAL, '\ufffd')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
