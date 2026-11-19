/**
 * Decides when a preview render may reach the webview (#408).
 *
 * Every render replaces the webview's canvas and clears its staged edits. A
 * render the user did not choose must therefore never reach a webview that
 * holds an unsaved draft or shows the conflict banner. Such a render is held
 * and recorded as OWED, and is scheduled as soon as the state that blocked it
 * ends.
 *
 * Rule (#439): only a render the user authorised may reach a dirty preview
 * unmarked: Reload and discard, the render after a visual Save, the webview's
 * `ready`, a document switch. Every render a source event triggers on its
 * own (a text change, a text-editor save or autosave) is AUTOMATIC: it is
 * decided on the panel state when its timer fires and when it completes, not
 * when it was queued. Facing a dirty preview that is not in conflict, an
 * automatic render whose diagram source is unchanged (a save, an edit outside
 * the anchored fence) is held as owed and repaid after Save or Discard; one
 * whose diagram source changed opens the conflict, because the draft was made
 * against the canvas the render would replace. It never clears the draft.
 *
 * "The diagram source the preview shows" is the text the save anchor
 * fingerprints: the whole document for a .c4x, Structurizr .dsl or PlantUML
 * .puml file (so any text change there is a real change), and the fence body
 * for a Markdown fence editor (plus its ordinal and uniqueness among fences).
 * Sidecar persistence keeps coordinates in a separate file that is not the
 * watched document, so it does not widen this. The anchor is the one the last
 * posted render captured. With no anchor (the fence was not found) nothing
 * can be proven either way: the automatic render is posted marked, so a dirty
 * webview declines it.
 *
 * Causes of a render, strongest first (a queued render merges to the
 * stronger cause, so an authorised render queued beside an automatic one
 * still wins, and an automatic one is never downgraded to a plain retry):
 * - 'source': authorised by the user (see above). Never held, never marked.
 * - 'auto': triggered by a source event (#439). Marked. Clean: posted.
 *   Dirty, not in conflict: held if the diagram source is unchanged, conflict
 *   if it changed, posted marked if there is no anchor. In conflict: held.
 * - 'retry': a render whose document changed while it was in flight, or one
 *   owed and repaid after a clean report. Held while blocked.
 * - 'theme': a colour-theme or `c4x.theme` change, or Refresh Preview. Held
 *   while blocked.
 *
 * "Blocked" means the webview reports staged edits (dirty) or the panel is in
 * conflict. A render that is not 'source' is sent with `refresh: true`, and a
 * webview that turns out to hold staged edits declines it (this covers an
 * automatic render already in flight when the edit was staged, if the host
 * has not yet heard the draft is dirty). The same applies to the `error` a
 * failed render sends: it carries the cause's mark, and a dirty webview
 * declines a marked error instead of replacing its canvas.
 *
 * Invariant: if the canvas does not reflect the current source and theme,
 * then a render is scheduled or in flight, or the panel is blocked and a
 * render is recorded as owed. Every path that ends a blocked state reports
 * the webview clean (`dirtyStateChanged: false`) or renders directly (Reload
 * and discard), and a clean report schedules the owed render. A refused Save
 * ends nothing: the client keeps the draft and sends no clean report or
 * `ready`, so the panel stays blocked with its debt until the user discards,
 * reloads or saves successfully, and no render is triggered that could be
 * declined and owed again in a loop.
 *
 * State table (D = dirty and not in conflict, C = in conflict, A = what the
 * anchor says about the diagram source now, owed in {none, theme, source}):
 *
 * | Event                                   | Not blocked              | Blocked (D or C)                    |
 * |-----------------------------------------|--------------------------|-------------------------------------|
 * | theme change / Refresh Preview          | schedule 'theme'         | owe theme; notice                   |
 * | text change or save (any A)             | schedule 'auto'          | D, A unchanged/unknown: schedule    |
 * |                                         |   (layout kept if A is   |   'auto'; D, A changed: C := on,    |
 * |                                         |   unchanged)             |   owe source; C: owe source         |
 * | timer fires, cause 'source'             | post                     | post (user chose it)                |
 * | timer fires, cause 'auto' (#439)        | post, marked             | D, A unchanged: owe source, layout  |
 * |                                         |                          |   kept; D, A changed: C := on, owe  |
 * |                                         |                          |   source; D, A unknown: post marked;|
 * |                                         |                          |   C: owe source                     |
 * | timer fires, cause 'theme' or 'retry'   | post, marked             | owe it; notice for theme            |
 * | render done, conflict began during it   | retry                    | owe it                              |
 * | render done, document changed           | retry ('auto' stays auto)| retry (its timer then decides)      |
 * | render done, 'auto' (#439)              | post, marked             | as "timer fires, cause 'auto'"      |
 * | render done, 'theme'/'retry'            | post, marked             | owe it                              |
 * | render done, 'source'                   | post                     | post                                |
 * | webview declined a marked render/error  | -                        | D := true; owe theme; restore shown |
 * |   (names the token it shows)            |                          |   state; A changed: C := on;        |
 * |                                         |                          |   token unmatched: C := on          |
 * | render not posted (held, stale, retry)  | shown state unchanged    | shown state unchanged               |
 * | clean report (Save, Discard, last edit  | if owed: schedule 'retry'| -                                   |
 * |   removed, refused Save, Reload)        |   (or 'theme'); C := off |                                     |
 * | Save refused (any code) (#439)          | -                        | D stays, C stays, owed kept,        |
 * |                                         |                          |   nothing scheduled; the client     |
 * |                                         |                          |   keeps the draft, posts no ready   |
 * | Rebase accepted                         | -                        | C := off; D stays; owed kept        |
 * | Rebase refused / View diff              | -                        | no change; owed kept                |
 * | a result is posted (render or error)    | owed := none             | owed := none                        |
 * | webview accepts an error (unmarked, or  | it tears the draft down and reports clean: D := false            |
 * |   marked while clean)                   |                                                                  |
 * | panel disposed                          | everything reset         | everything reset                    |
 *
 * What the webview shows (review of #442): the host's layout snapshot,
 * revision, save anchor and positional identity describe the result the
 * webview SHOWS, because Save, Rebase and every anchor check read them. They
 * advance when a result is posted; a render that is held, or completes stale,
 * changes none of them (only the source-event listener invalidates the
 * snapshot, for a real change). Every posted result carries a `renderToken`,
 * and a webview that declines a marked one names the token it still shows;
 * the host restores that state, then re-checks the diagram source: unchanged
 * keeps Save valid at the current version (revision carry), changed opens
 * the conflict because the draft was made against the older canvas. If the
 * decline names no token, or one the host no longer holds, and a marked
 * result was posted since the newest result known shown, the host cannot
 * tell which canvas the draft was made on: it opens the conflict (owe
 * source) so the user chooses, rather than letting Save fail and discard the
 * draft. PreviewPanel.rememberShown() states which records may be evicted.
 *
 * Pure state, no VS Code dependency, so the unit tier drives the table directly.
 */
export type RenderCause = 'source' | 'auto' | 'retry' | 'theme';
export type OwedRender = 'none' | 'theme' | 'source';

/** What the save anchor says about the diagram source now. */
export type AnchorCheck = 'unchanged' | 'changed' | 'unknown';
export type SourceEventDecision = 'schedule-auto' | 'enter-conflict' | 'owe-source';

/**
 * A text change to, or a save of, the watched document (#439). In conflict
 * the render is owed. A real change to the diagram source under an unsaved
 * draft opens the conflict now. Anything else queues an automatic render,
 * which is decided again when its timer fires.
 */
export function decideSourceEvent(state: { dirty: boolean; conflict: boolean; anchor: AnchorCheck }): SourceEventDecision {
    if (state.conflict) {
        return 'owe-source';
    }
    return state.dirty && state.anchor === 'changed' ? 'enter-conflict' : 'schedule-auto';
}

export type FireDecision = 'post' | 'post-marked' | 'hold' | 'conflict';
export type RenderCompletion = 'post' | 'retry' | 'hold' | 'conflict';

export interface RenderCompletionState {
    /** The document version or URI no longer matches what this render read. */
    stale: boolean;
    /** A conflict was entered while this render was in flight. */
    conflictBegan: boolean;
    /** The webview holds unsaved staged edits now. */
    dirty: boolean;
    /** The panel is in conflict now. */
    conflict: boolean;
    cause: RenderCause;
    /** For an 'auto' render: the diagram source against the last posted render's anchor. */
    anchor?: AnchorCheck;
}

/** An automatic render facing the panel as it is now (#439). */
function decideAuto(dirty: boolean, conflict: boolean, anchor: AnchorCheck): 'post-marked' | 'hold' | 'conflict' {
    if (conflict) {
        return 'hold';
    }
    if (!dirty || anchor === 'unknown') {
        return 'post-marked';
    }
    return anchor === 'changed' ? 'conflict' : 'hold';
}

/** What a finished render does, on the panel state as it is NOW. */
export function decideRenderCompletion(state: RenderCompletionState): RenderCompletion {
    const blocked = state.dirty || state.conflict;
    if (state.conflictBegan) {
        // The canvas the user drafted on is out of date; the conflict path
        // owns the preview until the draft is resolved.
        return blocked ? 'hold' : 'retry';
    }
    if (state.stale) {
        return 'retry';
    }
    if (state.cause === 'auto') {
        const decision = decideAuto(state.dirty, state.conflict, state.anchor ?? 'unknown');
        return decision === 'post-marked' ? 'post' : decision;
    }
    if (state.cause !== 'source' && blocked) {
        return 'hold';
    }
    return 'post';
}

/** What a debounce timer does when it fires with the merged cause. */
export function decideFire(cause: RenderCause, dirty: boolean, conflict: boolean, anchor: AnchorCheck = 'unknown'): FireDecision {
    if (cause === 'source') {
        return 'post';
    }
    if (cause === 'auto') {
        return decideAuto(dirty, conflict, anchor);
    }
    return dirty || conflict ? 'hold' : 'post-marked';
}

const STRENGTH: Record<RenderCause, number> = { theme: 1, retry: 2, auto: 3, source: 4 };

/** The stronger of two causes: source beats auto beats retry beats theme. */
export function strongerCause(a: RenderCause, b: RenderCause): RenderCause {
    return STRENGTH[a] >= STRENGTH[b] ? a : b;
}

function owedFor(cause: RenderCause): OwedRender {
    return cause === 'theme' ? 'theme' : 'source';
}

export class NonSourceRenderGate {
    private owedRender: OwedRender = 'none';
    /** Merged cause of the render waiting on the debounce timer, if any. */
    private scheduledCause: RenderCause | undefined;

    get owed(): OwedRender {
        return this.owedRender;
    }

    /** True while a render is owed until the draft is saved or discarded. */
    get isPending(): boolean {
        return this.owedRender !== 'none';
    }

    /** Record a render owed for `cause`; a source debt is never downgraded to theme. */
    owe(cause: RenderCause): void {
        const next = owedFor(cause);
        if (this.owedRender === 'none' || next === 'source') {
            this.owedRender = next;
        }
    }

    /** A theme change or Refresh Preview. 'schedule' when it may render now. */
    request(blocked: boolean): 'schedule' | 'defer' {
        if (blocked) {
            this.owe('theme');
            return 'defer';
        }
        return 'schedule';
    }

    /** A render was put on the debounce timer; requests merge to the stronger cause. */
    scheduled(cause: RenderCause): void {
        this.scheduledCause = this.scheduledCause === undefined ? cause : strongerCause(this.scheduledCause, cause);
    }

    /**
     * The debounce timer fired. Returns the decision and the cause to render
     * with. `anchor` is read only for an automatic render.
     */
    fire(dirty: boolean, conflict: boolean, anchor: () => AnchorCheck = () => 'unknown'): { decision: FireDecision; cause: RenderCause } {
        const cause = this.scheduledCause ?? 'source';
        this.scheduledCause = undefined;
        const decision = decideFire(cause, dirty, conflict, cause === 'auto' ? anchor() : 'unknown');
        if (decision === 'hold' || decision === 'conflict') {
            this.owe(cause);
        }
        return { decision, cause };
    }

    /**
     * A render is starting outside the timer (`ready`, Reload and discard). It
     * reads the current source and theme, so a queued non-source render is
     * redundant: returns true when the caller should cancel the timer. The
     * cancelled render stays owed until the starting render is posted.
     */
    supersedeScheduled(): boolean {
        if (this.scheduledCause !== undefined && this.scheduledCause !== 'source') {
            this.owe(this.scheduledCause);
            this.scheduledCause = undefined;
            return true;
        }
        return false;
    }

    /** A finished render was held: record it as owed. */
    held(cause: RenderCause): void {
        this.owe(cause);
    }

    /** The webview declined a marked render: it holds staged edits. */
    declined(): void {
        this.owe('theme');
    }

    /**
     * The webview reported its dirty state. When it is clean and a render is
     * owed, returns the cause to schedule it with; otherwise undefined.
     */
    dirtyChanged(dirty: boolean): RenderCause | undefined {
        if (dirty || this.owedRender === 'none') {
            return undefined;
        }
        return this.owedRender === 'source' ? 'retry' : 'theme';
    }

    /** A render was posted: it shows the current source and theme. */
    rendered(): void {
        this.owedRender = 'none';
    }

    /** Forget everything: the panel was disposed. */
    reset(): void {
        this.owedRender = 'none';
        this.scheduledCause = undefined;
    }
}
