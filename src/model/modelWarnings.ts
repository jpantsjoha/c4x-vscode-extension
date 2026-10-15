/**
 * Non-fatal notes an importer attaches to a model, such as a Structurizr
 * `code` property C4X cannot use as a `$code` mapping.
 */
export interface C4ModelWarning {
    /**
     * Identifies the problem independently of where it sits in the file
     * (e.g. element identifier and value), so editing lines above the element
     * does not make it a "new" warning.
     */
    readonly key: string;
    /** Text for the user, including the current source location. */
    readonly message: string;
}

/**
 * The warnings whose keys are not in `seen`, adding those keys to `seen`.
 * Callers show the returned messages once per key, however often they re-render.
 */
export function takeUnseenWarnings(warnings: readonly C4ModelWarning[] | undefined, seen: Set<string>): C4ModelWarning[] {
    const fresh: C4ModelWarning[] = [];
    for (const warning of warnings ?? []) {
        if (!seen.has(warning.key)) {
            seen.add(warning.key);
            fresh.push(warning);
        }
    }
    return fresh;
}
