/**
 * Positional identity of relationships and boundaries (#261).
 *
 * C4ModelBuilder names relationships `rel-<index>` and boundaries
 * `<label>-boundary-<index>`, by their position in the source. A staged edit
 * keyed by such an id names a position, not a statement: once the source
 * changes, the same id can name a different relationship or boundary.
 *
 * This module records, for each positional id, a fingerprint of the statement
 * it names, so a draft can be checked before it is re-attached to changed
 * source. Element ids are authored names and are not positional, so they are
 * not recorded here.
 */
import type { C4Boundary, C4View } from '../model/C4Model';

export type PositionalIdentity = ReadonlyMap<string, string>;

const SEP = '\u0000';

/**
 * Suffix on the fingerprint of a boundary that contains, at any depth, a
 * boundary that cannot be told apart from another. Such an id is ambiguous
 * even when its own fingerprint is unique.
 */
const AMBIGUOUS_DESCENDANT = SEP + 'ambiguous-descendant';

/** Fingerprint every positional id in a view (the preview renders the model's first view). */
export function positionalIdentityOf(view: Pick<C4View, 'relationships' | 'boundaries'>): PositionalIdentity {
    const identity = new Map<string, string>();
    for (const rel of view.relationships) {
        identity.set(rel.id, ['rel', rel.from, rel.to, rel.label ?? '', rel.technology ?? '', rel.relType ?? ''].join(SEP));
    }
    const boundaries = view.boundaries ?? [];
    const byId = new Map(boundaries.map(b => [b.id, b]));
    // A nested boundary is a member of its parent by its own positional id
    // (#339). Fingerprints must not carry those ids: two identical parent
    // blocks would then differ only by where their children sit, and a swap
    // would go unnoticed. A nested member is named by its structure instead.
    const structural = new Map<string, string>();
    const structureOf = (boundary: C4Boundary, visiting: Set<string>): string => {
        const known = structural.get(boundary.id);
        if (known !== undefined) {
            return known;
        }
        visiting.add(boundary.id);
        const members = boundary.elements.map(id => {
            const child = byId.get(id);
            if (!child) {
                return id;
            }
            return visiting.has(child.id) ? '{cycle}' : `{${structureOf(child, visiting)}}`;
        });
        visiting.delete(boundary.id);
        const fingerprint = ['boundary', boundary.label, boundary.boundaryType ?? '', boundary.alias ?? '', members.sort().join(',')].join(SEP);
        structural.set(boundary.id, fingerprint);
        return fingerprint;
    };
    for (const boundary of boundaries) {
        structureOf(boundary, new Set());
    }

    // A parent whose nested boundary cannot be told apart from another cannot
    // vouch for that child either: ambiguity propagates up to every ancestor.
    const counts = new Map<string, number>();
    for (const fingerprint of structural.values()) {
        counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    const parentOf = new Map<string, string>();
    for (const boundary of boundaries) {
        for (const id of boundary.elements) {
            if (byId.has(id) && !parentOf.has(id)) {
                parentOf.set(id, boundary.id);
            }
        }
    }
    const inheritsAmbiguity = new Set<string>();
    for (const boundary of boundaries) {
        if ((counts.get(structural.get(boundary.id)!) ?? 0) < 2) {
            continue;
        }
        const seen = new Set<string>([boundary.id]);
        for (let parent = parentOf.get(boundary.id); parent !== undefined && !seen.has(parent); parent = parentOf.get(parent)) {
            seen.add(parent);
            inheritsAmbiguity.add(parent);
        }
    }
    for (const boundary of boundaries) {
        const fingerprint = structural.get(boundary.id)!;
        identity.set(boundary.id, inheritsAmbiguity.has(boundary.id) ? fingerprint + AMBIGUOUS_DESCENDANT : fingerprint);
    }
    return identity;
}

/**
 * The positional ids whose statement changed between two versions of a
 * diagram: present in both, but naming a different relationship or boundary.
 * An id that disappeared is not listed; an edit staged on it no longer finds
 * its target and is dropped or refused as a missing target.
 */
export function changedPositionalIds(before: PositionalIdentity, after: PositionalIdentity): string[] {
    const changed: string[] = [];
    for (const [id, fingerprint] of before) {
        const now = after.get(id);
        if (now !== undefined && now !== fingerprint) {
            changed.push(id);
        }
    }
    return changed;
}

/**
 * Positional ids whose fingerprint another id in the same diagram shares, such
 * as two identical relationships. Such an id cannot show that it still names
 * the same statement: after one of them is removed or reordered, the id keeps
 * its fingerprint while naming the other statement.
 */
export function ambiguousPositionalIds(identity: PositionalIdentity): string[] {
    const counts = new Map<string, number>();
    for (const fingerprint of identity.values()) {
        counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    return [...identity]
        .filter(([, fingerprint]) => (counts.get(fingerprint) ?? 0) > 1 || fingerprint.endsWith(AMBIGUOUS_DESCENDANT))
        .map(([id]) => id);
}

/**
 * Why a draft cannot be rebased onto changed source, or undefined when it can.
 *
 * A rebase keeps every staged edit and re-anchors it to the new source. That
 * is safe for edits keyed by element id. For an edit keyed by a positional id
 * it is safe only while that id still names the same statement: the
 * fingerprint is unchanged and no other statement shares it. Otherwise Save
 * would apply the edit to a different relationship or boundary. When the
 * webview does not say which keys are staged, every unsafe positional id
 * counts.
 */
export function rebaseRefusal(
    before: PositionalIdentity | undefined,
    after: PositionalIdentity,
    stagedKeys: readonly string[] | undefined,
): string | undefined {
    if (!before) {
        // No record of the diagram the draft was staged against: nothing can
        // show that a positional key still names its statement.
        return stagedKeys !== undefined && stagedKeys.length === 0
            ? undefined
            : 'Cannot rebase: the diagram this draft was staged against is not known. Choose Reload and discard draft to continue.';
    }
    const unsafe = new Set([
        ...changedPositionalIds(before, after),
        ...ambiguousPositionalIds(before).filter(id => after.has(id)),
        ...ambiguousPositionalIds(after).filter(id => before.has(id)),
    ]);
    const staged = [...unsafe].filter(id => stagedKeys === undefined || stagedKeys.includes(id));
    if (staged.length === 0) {
        return undefined;
    }
    const noun = staged.length === 1 ? 'staged relationship or boundary edit names' : 'staged relationship or boundary edits name';
    return `Cannot rebase: ${staged.length} ${noun} a statement that the external change moved or that cannot be told apart from another, so it could apply to a different one. Choose Reload and discard draft to continue.`;
}
