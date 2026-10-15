/**
 * Which element owns a file when several elements' `$code` globs match it.
 *
 * Rule: the glob with the longest fixed prefix wins; on a tie, the element
 * declared first wins. Both the exported allow-list and `conform` use the
 * regexes built here, so they can never disagree about ownership. Before
 * this, the export granted a file the permissions of every element whose glob
 * matched it, so with `orders = src/orders/**` and
 * `pricing = src/orders/pricing.js` an undeclared pricing -> store import
 * passed as an orders -> store one.
 *
 * Each glob becomes `(?!(?:<more specific competing globs>)$)<glob>`: a
 * negative lookahead, which keeps the star height at 1 so dependency-cruiser's
 * safe-regex check accepts it. Competing globs whose fixed prefixes cannot
 * both match one path are left out, so views without overlap get the plain
 * regexes.
 */

import { globToRegexBody, staticPrefixLength } from '../model/codeGlobRegex';
import { ConformanceElement } from './view';

export interface OwnedElement {
    readonly element: ConformanceElement;
    /** Anchored regex matching exactly the files this element owns. */
    readonly ownedRegex: string;
}

interface GlobEntry {
    readonly elementIndex: number;
    readonly glob: string;
    readonly prefix: string;
    readonly specificity: number;
}

function canOverlap(a: GlobEntry, b: GlobEntry): boolean {
    return a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix);
}

/** True when `other` takes precedence over `entry` for a file both match. */
function outranks(other: GlobEntry, entry: GlobEntry): boolean {
    return other.specificity > entry.specificity ||
        (other.specificity === entry.specificity && other.elementIndex < entry.elementIndex);
}

/** Ownership regexes for every element that declares `$code`, in input order. */
export function ownedRegexes(elements: readonly ConformanceElement[]): OwnedElement[] {
    const mapped = elements.filter(element => element.codePaths && element.codePaths.length > 0);
    const entries: GlobEntry[] = mapped.flatMap((element, elementIndex) =>
        (element.codePaths ?? []).map(glob => {
            const specificity = staticPrefixLength(glob);
            return { elementIndex, glob, prefix: glob.slice(0, specificity), specificity };
        }));

    return mapped.map((element, elementIndex) => {
        const bodies = entries
            .filter(entry => entry.elementIndex === elementIndex)
            .map(entry => {
                const competitors = entries.filter(other =>
                    other.elementIndex !== elementIndex && outranks(other, entry) && canOverlap(other, entry));
                const body = globToRegexBody(entry.glob);
                if (competitors.length === 0) {
                    return body;
                }
                const excluded = [...new Set(competitors.map(other => globToRegexBody(other.glob)))].join('|');
                return `(?!(?:${excluded})$)${body}`;
            });
        const ownedRegex = bodies.length === 1 ? `^${bodies[0]}$` : `^(?:${bodies.join('|')})$`;
        return { element, ownedRegex };
    });
}
